// Transaction service. Balance updates always run inside an interactive
// transaction together with the row change, so account balances can never
// drift from the ledger.

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { toUTC, isoDayUTC, monthRange } from '@/lib/date'
import { duplicateKey } from '@/lib/csv'
import { Paginated, TransactionDTO } from '@/lib/types'

type Direction = 'in' | 'out'

interface TxnInput {
  accountId: string
  categoryId?: string | null
  amountPaise: number
  direction: Direction
  date: string // ISO YYYY-MM-DD
  note?: string | null
  source?: string
  tripId?: string | null
  /** client-generated idempotency key (offline write-queue replays) */
  clientKey?: string | null
}

/** How a transaction moves the stored balance, per account type. */
export function balanceEffect(type: string, direction: Direction, amountPaise: number): number {
  if (type === 'credit_card') {
    // outstanding owed: spending grows it, payments shrink it
    return direction === 'out' ? amountPaise : -amountPaise
  }
  return direction === 'out' ? -amountPaise : amountPaise
}

function parseDate(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new HttpError('Date must be YYYY-MM-DD', 422)
  return toUTC(iso)
}

/**
 * The ownership guards below take the client to run on.
 *
 * Inside `db.$transaction(async (tx) => ...)` they MUST be passed `tx`. Calling
 * them on the global `db` from inside a transaction asks the pool for a SECOND
 * connection while the transaction's own connection sits idle: it burns the
 * interactive-transaction timeout on network round-trips, and on a small
 * serverless pool it deadlocks outright — every concurrent request holds one
 * connection and waits for another that never frees. That surfaced as
 * `P2028: Transaction not found` once the app moved from local SQLite (where
 * queries are sub-millisecond and the pool is irrelevant) to a remote Postgres.
 *
 * `PrismaClient` is structurally assignable to `Prisma.TransactionClient`, so
 * callers outside a transaction can still pass `db`.
 */
type Db = Prisma.TransactionClient

async function assertOwned(client: Db, userId: string, accountId: string) {
  const account = await client.account.findFirst({ where: { id: accountId, userId } })
  if (!account) throw new HttpError('Account not found', 404)
  return account
}

async function assertCategory(client: Db, userId: string, categoryId?: string | null) {
  if (!categoryId) return null
  const category = await client.category.findFirst({ where: { id: categoryId, userId } })
  if (!category) throw new HttpError('Category not found', 404)
  return category
}

async function assertTrip(client: Db, userId: string, tripId?: string | null) {
  if (!tripId) return null
  const trip = await client.trip.findFirst({ where: { id: tripId, userId } })
  if (!trip) throw new HttpError('Trip not found', 404)
  return trip
}

function toDTO(t: {
  id: string
  accountId: string
  categoryId: string | null
  amountPaise: number
  direction: string
  date: Date
  note: string | null
  source: string
  tripId: string | null
  createdAt: Date
  account?: { name: string } | null
  category?: { name: string; emoji: string; color: string } | null
}): TransactionDTO {
  return {
    id: t.id,
    accountId: t.accountId,
    accountName: t.account?.name ?? undefined,
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    categoryEmoji: t.category?.emoji ?? null,
    categoryColor: t.category?.color ?? null,
    amountPaise: t.amountPaise,
    direction: t.direction as Direction,
    date: isoDayUTC(t.date),
    note: t.note,
    source: t.source as TransactionDTO['source'],
    tripId: t.tripId,
    createdAt: t.createdAt.toISOString(),
  }
}

export async function createTransaction(userId: string, input: TxnInput): Promise<TransactionDTO & { deduped?: boolean }> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new HttpError('Amount must be a positive amount', 422)
  }
  const date = parseDate(input.date)

  // Idempotency (Decision #38): a replayed Quick-Add (offline retry, double
  // tap) resolves to the ORIGINAL row instead of creating a duplicate —
  // clientKey is unique per user, so the ledger can never double-count.
  if (input.clientKey) {
    const existing = await db.transaction.findFirst({
      where: { userId, clientKey: input.clientKey },
      include: { account: { select: { name: true } }, category: true },
    })
    if (existing) return { ...toDTO(existing), deduped: true }
  }

  // Guards run BEFORE the transaction opens, on their own connection, so the
  // transaction itself is just the two writes that must be atomic together.
  const account = await assertOwned(db, userId, input.accountId)
  await assertCategory(db, userId, input.categoryId)
  await assertTrip(db, userId, input.tripId)

  return db.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        amountPaise: input.amountPaise,
        direction: input.direction,
        date,
        note: input.note?.trim() || null,
        source: input.source ?? 'manual',
        tripId: input.tripId ?? null,
        clientKey: input.clientKey ?? null,
      },
      include: { account: { select: { name: true } }, category: true },
    })
    await tx.account.update({
      where: { id: account.id },
      data: { balancePaise: { increment: balanceEffect(account.type, input.direction, input.amountPaise) } },
    })
    return toDTO(created)
  })
}

export interface TxnFilters {
  accountId?: string
  categoryId?: string
  tripId?: string
  month?: string // YYYY-MM
  direction?: Direction
  limit?: number
  offset?: number
}

export async function listTransactions(userId: string, filters: TxnFilters): Promise<Paginated<TransactionDTO> & { totalPaise: { in: number; out: number } }> {
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50))
  const offset = Math.max(0, filters.offset ?? 0)

  const where: Record<string, unknown> = { userId }
  if (filters.accountId) where.accountId = filters.accountId
  if (filters.categoryId) where.categoryId = filters.categoryId
  if (filters.tripId) where.tripId = filters.tripId
  if (filters.direction) where.direction = filters.direction
  if (filters.month) {
    if (!/^\d{4}-\d{2}$/.test(filters.month)) throw new HttpError('month must be YYYY-MM', 422)
    const { start, endExclusive } = monthRange(filters.month)
    where.date = { gte: start, lt: endExclusive }
  }

  const [rows, totalRows] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      skip: offset,
      include: { account: { select: { name: true } }, category: true },
    }),
    db.transaction.aggregate({
      where,
      _sum: {
        amountPaise: true,
      },
      _count: true,
    }),
  ])

  // Separate in/out totals for the filtered set.
  const [inAgg, outAgg] = await Promise.all([
    db.transaction.aggregate({ where: { ...where, direction: 'in' }, _sum: { amountPaise: true } }),
    db.transaction.aggregate({ where: { ...where, direction: 'out' }, _sum: { amountPaise: true } }),
  ])

  const hasMore = rows.length > limit
  return {
    items: rows.slice(0, limit).map(toDTO),
    nextOffset: hasMore ? offset + limit : null,
    totalPaise: { in: inAgg._sum.amountPaise ?? 0, out: outAgg._sum.amountPaise ?? 0 },
  }
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: Partial<TxnInput>,
): Promise<TransactionDTO> {
  // Reads and validation happen up front (see the guards' note above); the
  // transaction then holds only the three writes whose atomicity matters.
  const existing = await db.transaction.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Transaction not found', 404)
  const oldAccount = await db.account.findUnique({ where: { id: existing.accountId } })
  if (!oldAccount) throw new HttpError('Account not found', 404)

  const nextAccountId = input.accountId ?? existing.accountId
  const nextAccount = await assertOwned(db, userId, nextAccountId)
  await assertCategory(db, userId, input.categoryId !== undefined ? input.categoryId : existing.categoryId)
  await assertTrip(db, userId, input.tripId !== undefined ? input.tripId : existing.tripId)

  const nextAmount = input.amountPaise ?? existing.amountPaise
  if (!Number.isInteger(nextAmount) || nextAmount <= 0) throw new HttpError('Amount must be positive', 422)
  const nextDirection = (input.direction ?? existing.direction) as Direction
  const nextDate = input.date ? parseDate(input.date) : existing.date

  return db.$transaction(async (tx) => {
    // Revert old balance effect, then apply the new one.
    await tx.account.update({
      where: { id: oldAccount.id },
      data: { balancePaise: { decrement: balanceEffect(oldAccount.type, existing.direction as Direction, existing.amountPaise) } },
    })
    await tx.account.update({
      where: { id: nextAccount.id },
      data: { balancePaise: { increment: balanceEffect(nextAccount.type, nextDirection, nextAmount) } },
    })

    const updated = await tx.transaction.update({
      where: { id },
      data: {
        accountId: nextAccountId,
        categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
        amountPaise: nextAmount,
        direction: nextDirection,
        date: nextDate,
        note: input.note !== undefined ? input.note?.trim() || null : existing.note,
        tripId: input.tripId !== undefined ? input.tripId : existing.tripId,
      },
      include: { account: { select: { name: true } }, category: true },
    })
    return toDTO(updated)
  })
}

export async function deleteTransaction(userId: string, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId } })
    if (!existing) throw new HttpError('Transaction not found', 404)
    const account = await tx.account.findUnique({ where: { id: existing.accountId } })
    if (account) {
      await tx.account.update({
        where: { id: account.id },
        data: {
          balancePaise: { decrement: balanceEffect(account.type, existing.direction as Direction, existing.amountPaise) },
        },
      })
    }
    await tx.transaction.delete({ where: { id } })
  })
}

/** Most recently used category ids (recent-first chips for Quick-Add). */
export async function recentCategoryIds(userId: string, take = 10): Promise<string[]> {
  const rows = await db.transaction.findMany({
    where: { userId, categoryId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { categoryId: true },
    take: 60,
  })
  const seen: string[] = []
  for (const r of rows) {
    if (r.categoryId && !seen.includes(r.categoryId)) seen.push(r.categoryId)
    if (seen.length >= take) break
  }
  return seen
}

/* ------------------------------------------------------------------ */
/* Bulk import (Phase 6 — CSV statements)                              */
/* ------------------------------------------------------------------ */

export interface ImportRowInput {
  amountPaise: number
  direction: Direction
  date: string // YYYY-MM-DD
  note?: string | null
  categoryId?: string | null
}

export interface ImportResult {
  created: number
  skippedDuplicates: number
  failedRows: Array<{ index: number; message: string }>
  createdIds: string[]
}

const MAX_IMPORT_ROWS = 500

/**
 * Bulk-create transactions for ONE account (a bank statement always belongs
 * to one account) with ledger-truth guarantees:
 *  - per-row validation collects failures instead of failing the whole file
 *  - duplicate detection (same day+direction+amount+normalized note within
 *    the imported date span) skips re-imported statements
 *  - every create + the single balance adjustment run in ONE DB transaction,
 *    so the balance can never drift even on a mid-import crash
 */
export async function importTransactions(
  userId: string,
  input: { accountId: string; source: string; rows: ImportRowInput[] },
): Promise<ImportResult> {
  if (input.rows.length === 0) throw new HttpError('No rows to import', 422)
  if (input.rows.length > MAX_IMPORT_ROWS) {
    throw new HttpError(`Too many rows (max ${MAX_IMPORT_ROWS} per import)`, 422)
  }

  const account = await db.account.findFirst({ where: { id: input.accountId, userId } })
  if (!account) throw new HttpError('Account not found', 404)

  // validate rows up-front; collect failures with their original index
  const valid: Array<{ index: number; amountPaise: number; direction: Direction; date: Date; note: string | null; categoryId: string | null }> = []
  const failedRows: ImportResult['failedRows'] = []

  const ownedCategories = new Set(
    (await db.category.findMany({ where: { userId }, select: { id: true } })).map((c) => c.id),
  )
  const isoRe = /^\d{4}-\d{2}-\d{2}$/

  for (let i = 0; i < input.rows.length; i++) {
    const r = input.rows[i]
    if (!Number.isInteger(r.amountPaise) || r.amountPaise <= 0) {
      failedRows.push({ index: i, message: 'Amount must be a positive paise integer' })
      continue
    }
    if (r.direction !== 'in' && r.direction !== 'out') {
      failedRows.push({ index: i, message: 'Direction must be in or out' })
      continue
    }
    if (!isoRe.test(r.date)) {
      failedRows.push({ index: i, message: 'Date must be YYYY-MM-DD' })
      continue
    }
    let categoryId: string | null = null
    if (r.categoryId != null && r.categoryId !== '') {
      if (!ownedCategories.has(r.categoryId)) {
        failedRows.push({ index: i, message: 'Unknown category' })
        continue
      }
      categoryId = r.categoryId
    }
    valid.push({
      index: i,
      amountPaise: r.amountPaise,
      direction: r.direction,
      date: toUTC(r.date),
      note: r.note?.trim().slice(0, 500) || null,
      categoryId,
    })
  }

  if (valid.length === 0) return { created: 0, skippedDuplicates: 0, failedRows, createdIds: [] }

  // duplicate detection against the ledger within the imported date span
  const minDate = new Date(Math.min(...valid.map((v) => v.date.getTime())))
  const maxDate = new Date(Math.max(...valid.map((v) => v.date.getTime())))
  const existing = await db.transaction.findMany({
    where: { userId, accountId: input.accountId, date: { gte: minDate, lte: maxDate } },
    select: { amountPaise: true, direction: true, date: true, note: true },
  })
  const existingKeys = new Set(
    existing.map((t) =>
      duplicateKey({
        accountId: input.accountId,
        date: isoDayUTC(t.date),
        direction: t.direction as Direction,
        amountPaise: t.amountPaise,
        note: t.note,
      }),
    ),
  )

  const plan = new Map<number, boolean>() // index → isDuplicate
  const seen = new Set<string>()
  for (const v of valid) {
    const key = duplicateKey({
      accountId: input.accountId,
      date: isoDayUTC(v.date),
      direction: v.direction,
      amountPaise: v.amountPaise,
      note: v.note,
    })
    if (existingKeys.has(key) || seen.has(key)) {
      plan.set(v.index, true)
    } else {
      seen.add(key)
      plan.set(v.index, false)
    }
  }

  const toCreate = valid.filter((v) => !plan.get(v.index))
  const skippedDuplicates = valid.length - toCreate.length

  if (toCreate.length === 0) {
    return { created: 0, skippedDuplicates, failedRows, createdIds: [] }
  }

  // one DB transaction: all creates + one net balance adjustment
  const createdIds = await db.$transaction(async (tx) => {
    const ids: string[] = []
    let netEffect = 0
    for (const v of toCreate) {
      const row = await tx.transaction.create({
        data: {
          userId,
          accountId: input.accountId,
          categoryId: v.categoryId,
          amountPaise: v.amountPaise,
          direction: v.direction,
          date: v.date,
          note: v.note,
          source: input.source,
        },
      })
      ids.push(row.id)
      netEffect += balanceEffect(account.type, v.direction, v.amountPaise)
    }
    if (netEffect !== 0) {
      await tx.account.update({
        where: { id: account.id },
        data: { balancePaise: { increment: netEffect } },
      })
    }
    return ids
  })

  return { created: createdIds.length, skippedDuplicates, failedRows, createdIds }
}

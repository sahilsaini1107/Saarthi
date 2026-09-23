// Bill & subscription service with the pay-once guarantee:
// unique (billId, dueDate) at the DB level + interactive transaction that
// logs the linked transaction and advances the schedule drift-free.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { anchorDayFor, advanceDue, Frequency, FREQUENCIES } from '@/lib/recurrence'
import { balanceEffect } from '@/services/transactions'
import { addDaysUTC, isoDayUTC, monthRange, todayISO, toUTC } from '@/lib/date'
import { BillDTO } from '@/lib/types'

export interface BillWithMeta extends BillDTO {
  daysUntilDue: number
  overdue: boolean
  lastPaidDate: string | null
}

function toDTO(b: {
  id: string
  name: string
  amountPaise: number
  frequency: string
  customDays: number | null
  nextDue: Date
  anchorDay: number
  remindDaysBefore: number
  categoryId: string | null
  accountId: string | null
  active: boolean
}): BillDTO {
  return {
    id: b.id,
    name: b.name,
    amountPaise: b.amountPaise,
    frequency: b.frequency as Frequency,
    customDays: b.customDays,
    nextDue: isoDayUTC(b.nextDue),
    anchorDay: b.anchorDay,
    remindDaysBefore: b.remindDaysBefore,
    categoryId: b.categoryId,
    accountId: b.accountId,
    active: b.active,
  }
}

function validateInput(input: { name: string; amountPaise: number; frequency: Frequency; customDays?: number | null }) {
  if (!input.name.trim()) throw new HttpError('Bill name is required', 422)
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) throw new HttpError('Amount must be positive', 422)
  if (!FREQUENCIES.includes(input.frequency)) throw new HttpError('Unknown frequency', 422)
  if (input.frequency === 'custom_days' && (!input.customDays || input.customDays < 1 || input.customDays > 365)) {
    throw new HttpError('Custom frequency must be 1–365 days', 422)
  }
}

export async function createBill(
  userId: string,
  input: {
    name: string
    amountPaise: number
    frequency: Frequency
    customDays?: number | null
    nextDue: string
    remindDaysBefore?: number
    categoryId?: string | null
    accountId?: string | null
  },
): Promise<BillDTO> {
  validateInput(input)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextDue)) throw new HttpError('Next due must be YYYY-MM-DD', 422)
  if (input.remindDaysBefore != null && (input.remindDaysBefore < 0 || input.remindDaysBefore > 30)) {
    throw new HttpError('Remind days must be 0–30', 422)
  }
  const due = toUTC(input.nextDue)
  const row = await db.bill.create({
    data: {
      userId,
      name: input.name.trim(),
      amountPaise: input.amountPaise,
      frequency: input.frequency,
      customDays: input.frequency === 'custom_days' ? input.customDays ?? 30 : null,
      nextDue: due,
      anchorDay: anchorDayFor(due),
      remindDaysBefore: input.remindDaysBefore ?? 1,
      categoryId: input.categoryId ?? null,
      accountId: input.accountId ?? null,
      active: true,
    },
  })
  return toDTO(row)
}

export async function listBills(userId: string, tz: string): Promise<BillWithMeta[]> {
  const rows = await db.bill.findMany({
    where: { userId },
    orderBy: { nextDue: 'asc' },
    include: { payments: { orderBy: { dueDate: 'desc' }, take: 1 } },
  })
  const today = toUTC(todayISO(tz))
  return rows.map((b) => {
    const daysUntilDue = Math.round((b.nextDue.getTime() - today.getTime()) / 86_400_000)
    return {
      ...toDTO(b),
      daysUntilDue,
      overdue: b.active && daysUntilDue < 0,
      lastPaidDate: b.payments[0] ? isoDayUTC(b.payments[0].dueDate) : null,
    }
  })
}

export async function updateBill(
  userId: string,
  id: string,
  input: Partial<{
    name: string
    amountPaise: number
    frequency: Frequency
    customDays: number | null
    nextDue: string
    remindDaysBefore: number
    categoryId: string | null
    accountId: string | null
    active: boolean
  }>,
): Promise<BillDTO> {
  const existing = await db.bill.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Bill not found', 404)
  validateInput({
    name: input.name ?? existing.name,
    amountPaise: input.amountPaise ?? existing.amountPaise,
    frequency: (input.frequency ?? existing.frequency) as Frequency,
    customDays: input.customDays ?? existing.customDays,
  })
  const nextDue = input.nextDue ? toUTC(input.nextDue) : existing.nextDue
  const row = await db.bill.update({
    where: { id },
    data: {
      name: input.name?.trim() || existing.name,
      amountPaise: input.amountPaise ?? existing.amountPaise,
      frequency: input.frequency ?? existing.frequency,
      customDays: input.customDays !== undefined ? input.customDays : existing.customDays,
      nextDue,
      // re-derive the anchor if the due date was moved
      anchorDay: input.nextDue ? anchorDayFor(nextDue) : existing.anchorDay,
      remindDaysBefore: input.remindDaysBefore ?? existing.remindDaysBefore,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      accountId: input.accountId !== undefined ? input.accountId : existing.accountId,
      active: input.active ?? existing.active,
    },
  })
  return toDTO(row)
}

export async function deleteBill(userId: string, id: string): Promise<void> {
  const existing = await db.bill.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Bill not found', 404)
  await db.bill.delete({ where: { id } })
}

/**
 * Mark a bill's period as paid. Exactly once per (bill, dueDate):
 * a second attempt for the same period fails with 409 — the uniqueness is
 * enforced by the DB, not just application logic.
 */
export async function payBill(userId: string, billId: string, dueDateISO: string, todayISOStr: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateISO)) throw new HttpError('dueDate must be YYYY-MM-DD', 422)
  const dueDate = toUTC(dueDateISO)

  return db.$transaction(async (tx) => {
    const bill = await tx.bill.findFirst({ where: { id: billId, userId } })
    if (!bill) throw new HttpError('Bill not found', 404)
    if (!bill.active) throw new HttpError('Bill is inactive', 409)

    const already = await tx.billPayment.findUnique({
      where: { billId_dueDate: { billId: bill.id, dueDate } },
    })
    if (already) throw new HttpError('This bill period is already paid', 409)

    const accountId = bill.accountId ?? (await defaultAccount(tx, userId))
    const account = await tx.account.findFirst({ where: { id: accountId, userId } })
    if (!account) throw new HttpError('Pay-from account not found', 404)

    const today = toUTC(todayISOStr)
    const txn = await tx.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: bill.categoryId,
        amountPaise: bill.amountPaise,
        direction: 'out',
        date: today,
        note: `${bill.name} — bill payment`,
        source: 'manual',
      },
    })

    // Keep the ledger consistent: paying a bill moves the balance.
    await tx.account.update({
      where: { id: account.id },
      data: { balancePaise: { increment: balanceEffect(account.type, 'out', bill.amountPaise) } },
    })

    await tx.billPayment.create({
      data: { userId, billId: bill.id, dueDate, paidDate: new Date(), transactionId: txn.id },
    })

    // Advance the schedule. If earlier periods were skipped, catch up so the
    // next due lands in the future (keeps calendar + reminders sane).
    let next = bill.nextDue
    const opts = {
      customDays: bill.customDays,
      anchorDay: bill.anchorDay,
    }
    for (let i = 0; i < 120 && next.getTime() <= today.getTime(); i++) {
      next = advanceDue(next, bill.frequency as Frequency, opts)
    }

    const updated = await tx.bill.update({
      where: { id: bill.id },
      data: { nextDue: next },
    })

    return { bill: toDTO(updated), transactionId: txn.id }
  })
}

async function defaultAccount(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], userId: string) {
  const first = await tx.account.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!first) throw new HttpError('Add an account first — bills need somewhere to log payment', 409)
  return first.id
}

/** Bills due within `days` (incl. overdue), for the Today widget. */
export async function upcomingBills(userId: string, tz: string, days = 7) {
  const today = toUTC(todayISO(tz))
  const horizon = addDaysUTC(today, days)
  const rows = await db.bill.findMany({
    where: { userId, active: true, nextDue: { lte: horizon } },
    orderBy: { nextDue: 'asc' },
    include: { category: { select: { emoji: true, name: true, color: true } } },
  })
  return rows.map((b) => {
    const daysUntilDue = Math.round((b.nextDue.getTime() - today.getTime()) / 86_400_000)
    return {
      id: b.id,
      name: b.name,
      amountPaise: b.amountPaise,
      dueDate: isoDayUTC(b.nextDue),
      daysUntilDue,
      overdue: daysUntilDue < 0,
      emoji: b.category?.emoji ?? '🧾',
    }
  })
}

/** Which due dates fall in a given month (calendar view). */
export async function billsInMonth(userId: string, monthKey: string) {
  const { start, endExclusive } = monthRange(monthKey)
  const rows = await db.bill.findMany({
    where: { userId, active: true },
    include: { payments: { select: { dueDate: true } } },
  })
  const inMonth = rows.filter((b) => b.nextDue.getTime() >= start.getTime() && b.nextDue.getTime() < endExclusive.getTime())
  return {
    monthKey,
    bills: inMonth.map((b) => ({
      id: b.id,
      name: b.name,
      amountPaise: b.amountPaise,
      dueDate: isoDayUTC(b.nextDue),
      paidForThisPeriod: b.payments.some((p) => p.dueDate.getTime() === b.nextDue.getTime()),
      emoji: '🧾',
    })),
  }
}

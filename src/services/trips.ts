// Trip service (Phase 5.2). Trips bucket expenses via Transaction.tripId;
// deleting a trip never touches the ledger (SetNull). Phase is derived from
// dates (lib/trips.ts) so it can never go stale.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { isoDayUTC, todayISO, toUTC } from '@/lib/date'
import { daysLeftInTrip, daysUntilStart, tripDaySeries, tripDurationDays, tripPhase, tripPeakDay, tripTotalSpendPaise } from '@/lib/trips'
import type { TripPhase } from '@/lib/trips'

export interface TripSummary {
  id: string
  name: string
  emoji: string
  destination: string | null
  startDate: string
  endDate: string | null
  budgetPaise: number | null
  notes: string | null
  phase: TripPhase
  durationDays: number
  daysUntilStart: number | null
  daysLeft: number | null
  spentPaise: number
  remainingPaise: number | null
  txnCount: number
}

function phaseOrder(p: TripPhase): number {
  return p === 'ongoing' ? 0 : p === 'planned' ? 1 : 2
}

function toSummary(
  trip: {
    id: string
    name: string
    emoji: string
    destination: string | null
    startDate: Date
    endDate: Date | null
    budgetPaise: number | null
    notes: string | null
    _count?: { transactions: number }
  },
  txns: readonly { amountPaise: number; direction: string }[],
  today: string,
): TripSummary {
  const start = isoDayUTC(trip.startDate)
  const end = trip.endDate ? isoDayUTC(trip.endDate) : null
  const spent = tripTotalSpendPaise(txns)
  return {
    id: trip.id,
    name: trip.name,
    emoji: trip.emoji,
    destination: trip.destination,
    startDate: start,
    endDate: end,
    budgetPaise: trip.budgetPaise,
    notes: trip.notes,
    phase: tripPhase(start, end, today),
    durationDays: tripDurationDays(start, end, today),
    daysUntilStart: daysUntilStart(start, today),
    daysLeft: daysLeftInTrip(end, today),
    spentPaise: spent,
    remainingPaise: trip.budgetPaise != null ? trip.budgetPaise - spent : null,
    txnCount: trip._count?.transactions ?? txns.length,
  }
}

export async function listTrips(userId: string, tz: string): Promise<TripSummary[]> {
  const today = todayISO(tz)
  const trips = await db.trip.findMany({
    where: { userId },
    include: {
      transactions: { select: { amountPaise: true, direction: true } },
      _count: { select: { transactions: true } },
    },
    orderBy: { startDate: 'asc' },
  })
  return trips
    .map((t) => toSummary(t, t.transactions, today))
    .sort((a, b) => phaseOrder(a.phase) - phaseOrder(b.phase) || a.startDate.localeCompare(b.startDate))
}

export interface TripDetail extends TripSummary {
  /** per-day outflow within [start, min(end, today)] — chart-ready */
  daySeries: { iso: string; outPaise: number }[]
  peakDay: string | null
  byCategory: { categoryId: string | null; name: string; emoji: string; color: string; outPaise: number }[]
  /** linked transactions, newest first (bounded) */
  transactions: {
    id: string
    amountPaise: number
    direction: string
    date: string
    note: string | null
    categoryName: string | null
    categoryEmoji: string | null
    accountName: string
  }[]
}

export async function getTrip(userId: string, tripId: string, tz: string): Promise<TripDetail> {
  const today = todayISO(tz)
  const trip = await db.trip.findFirst({ where: { id: tripId, userId } })
  if (!trip) throw new HttpError('Trip not found', 404)

  const txns = await db.transaction.findMany({
    where: { tripId, userId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      category: { select: { id: true, name: true, emoji: true, color: true } },
      account: { select: { name: true } },
    },
  })

  const summary = toSummary(
    { ...trip, _count: { transactions: txns.length } },
    txns.map((t) => ({ amountPaise: t.amountPaise, direction: t.direction })),
    today,
  )

  const startISO = isoDayUTC(trip.startDate)
  const endISO = trip.endDate ? isoDayUTC(trip.endDate) : null

  const series = tripDaySeries(
    txns.map((t) => ({ date: isoDayUTC(t.date), amountPaise: t.amountPaise, direction: t.direction })),
    startISO,
    endISO,
    today,
  )

  const catMap = new Map<string, { categoryId: string | null; name: string; emoji: string; color: string; outPaise: number }>()
  for (const t of txns) {
    if (t.direction !== 'out') continue
    const key = t.categoryId ?? 'uncat'
    const existing = catMap.get(key)
    if (existing) existing.outPaise += t.amountPaise
    else
      catMap.set(key, {
        categoryId: t.categoryId,
        name: t.category?.name ?? 'Uncategorised',
        emoji: t.category?.emoji ?? '❓',
        color: t.category?.color ?? '#94A3B8',
        outPaise: t.amountPaise,
      })
  }

  return {
    ...summary,
    daySeries: series,
    peakDay: tripPeakDay(series),
    byCategory: [...catMap.values()].sort((a, b) => b.outPaise - a.outPaise),
    transactions: txns.map((t) => ({
      id: t.id,
      amountPaise: t.amountPaise,
      direction: t.direction,
      date: isoDayUTC(t.date),
      note: t.note,
      categoryName: t.category?.name ?? null,
      categoryEmoji: t.category?.emoji ?? null,
      accountName: t.account.name,
    })),
  }
}

export interface TripInput {
  name: string
  emoji?: string
  destination?: string | null
  startDate: string // ISO YYYY-MM-DD
  endDate?: string | null
  budgetPaise?: number | null
  notes?: string | null
}

function parseISODate(iso: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new HttpError(`${field} must be YYYY-MM-DD`, 422)
  return toUTC(iso)
}

function assertDates(startISO: string, endISO: string | null) {
  if (endISO && endISO < startISO) throw new HttpError('End date cannot be before the start date', 422)
}

function assertBudget(budgetPaise: number | null | undefined) {
  if (budgetPaise == null) return
  if (!Number.isInteger(budgetPaise) || budgetPaise <= 0) throw new HttpError('Budget must be a positive amount', 422)
}

export async function createTrip(userId: string, input: TripInput): Promise<TripSummary> {
  assertDates(input.startDate, input.endDate ?? null)
  assertBudget(input.budgetPaise)
  const today = todayISO((await db.user.findUniqueOrThrow({ where: { id: userId } })).timezone)
  const trip = await db.trip.create({
    data: {
      userId,
      name: input.name.trim(),
      emoji: input.emoji ?? '✈️',
      destination: input.destination?.trim() || null,
      startDate: parseISODate(input.startDate, 'startDate'),
      endDate: input.endDate ? parseISODate(input.endDate, 'endDate') : null,
      budgetPaise: input.budgetPaise ?? null,
      notes: input.notes?.trim() || null,
    },
    include: { _count: { select: { transactions: true } } },
  })
  return toSummary(trip, [], today)
}

export async function updateTrip(userId: string, tripId: string, input: Partial<TripInput>): Promise<TripSummary> {
  const existing = await db.trip.findFirst({ where: { id: tripId, userId } })
  if (!existing) throw new HttpError('Trip not found', 404)

  const startISO = input.startDate ?? isoDayUTC(existing.startDate)
  const endISO = input.endDate !== undefined ? input.endDate : existing.endDate ? isoDayUTC(existing.endDate) : null
  assertDates(startISO, endISO)
  assertBudget(input.budgetPaise)

  const today = todayISO((await db.user.findUniqueOrThrow({ where: { id: userId } })).timezone)
  const trip = await db.trip.update({
    where: { id: tripId },
    data: {
      name: input.name !== undefined ? input.name.trim() : existing.name,
      emoji: input.emoji ?? existing.emoji,
      destination: input.destination !== undefined ? input.destination?.trim() || null : existing.destination,
      startDate: input.startDate ? parseISODate(input.startDate, 'startDate') : existing.startDate,
      endDate: input.endDate !== undefined ? (input.endDate ? parseISODate(input.endDate, 'endDate') : null) : existing.endDate,
      budgetPaise: input.budgetPaise !== undefined ? input.budgetPaise : existing.budgetPaise,
      notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
    },
    include: {
      transactions: { select: { amountPaise: true, direction: true } },
      _count: { select: { transactions: true } },
    },
  })
  return toSummary(trip, trip.transactions, today)
}

export async function deleteTrip(userId: string, tripId: string): Promise<void> {
  const existing = await db.trip.findFirst({ where: { id: tripId, userId } })
  if (!existing) throw new HttpError('Trip not found', 404)
  // Transaction.tripId is SetNull — linked expenses stay in the ledger.
  await db.trip.delete({ where: { id: tripId } })
}

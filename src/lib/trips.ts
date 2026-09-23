// Trip math (Phase 5.2) — pure functions on ISO calendar dates (UTC-midnight
// convention, same as the rest of Saarthi).
//
// Conventions (Decision #26):
//  - Trip phase is DERIVED from dates, never stored:
//      planned  start > today
//      ongoing  start ≤ today AND (end null OR end ≥ today)
//      past     end < today (end set and before today)
//    An open-ended trip (no end) stays ongoing once started.
//  - The daily spend series covers [max(start, first day we can know),
//    min(end, today)] — future days are never invented, days before start
//    never appear even if a transaction was mis-attributed there. Zero-spend
//    days inside the window ARE included (a bar chart needs them).
//  - Trip spend = sum of linked transactions with direction 'out'. Income
//    during a trip is not netted off the budget.

import { daysBetweenUTC, isoDayUTC, shiftISO, toUTC } from '@/lib/date'
import type { ISODate } from '@/lib/date'

export type TripPhase = 'planned' | 'ongoing' | 'past'

/** Phase derived from dates; `today` injected for testability. */
export function tripPhase(startISO: ISODate, endISO: ISODate | null, today: ISODate): TripPhase {
  if (startISO > today) return 'planned'
  if (endISO === null) return 'ongoing'
  return endISO >= today ? 'ongoing' : 'past'
}

/**
 * Inclusive duration in days. Planned trips: start..end (open-ended planned
 * trips show the start day only → 1). Ongoing: start..end when the end is
 * set (the planned length), start..today when open-ended. Past: start..end.
 */
export function tripDurationDays(startISO: ISODate, endISO: ISODate | null, today: ISODate): number {
  const effEnd = endISO ?? (startISO > today ? startISO : today)
  const d = daysBetweenUTC(toUTC(startISO), toUTC(effEnd)) + 1
  return Math.max(d, 0)
}

/** Days until an upcoming trip starts; null once the trip is ongoing (start day counts as ongoing). */
export function daysUntilStart(startISO: ISODate, today: ISODate): number | null {
  if (startISO <= today) return null
  return daysBetweenUTC(toUTC(today), toUTC(startISO))
}

/** Days left in an ongoing trip (inclusive of today); null when not ongoing. */
export function daysLeftInTrip(endISO: ISODate | null, today: ISODate): number | null {
  if (endISO === null) return null // open-ended: no countdown
  if (endISO < today) return null
  return daysBetweenUTC(toUTC(today), toUTC(endISO)) + 1
}

export interface TripDayPoint {
  iso: ISODate
  outPaise: number
}

/**
 * Per-day spend series over [start, min(end ?? today, today)], zero-filled
 * inside the window. Transactions dated outside the window (e.g. a backdated
 * entry before the trip) are EXCLUDED from the series but still count in the
 * trip total — the series is a visualisation of the trip window, the total is
 * the ledger truth. Ordering is ascending by date.
 */
export function tripDaySeries(
  txns: readonly { date: ISODate; amountPaise: number; direction: string }[],
  startISO: ISODate,
  endISO: ISODate | null,
  today: ISODate,
): TripDayPoint[] {
  if (startISO > today) return [] // hasn't started — no days exist yet
  const hardEnd = endISO !== null && endISO < today ? endISO : today
  if (startISO > hardEnd) return []

  const byDay = new Map<ISODate, number>()
  for (const t of txns) {
    if (t.direction !== 'out') continue
    if (!Number.isFinite(t.amountPaise)) continue
    if (t.date < startISO || t.date > hardEnd) continue
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amountPaise)
  }

  const points: TripDayPoint[] = []
  let cursor = startISO
  let guard = 0
  while (cursor <= hardEnd && guard < 3660) {
    points.push({ iso: cursor, outPaise: byDay.get(cursor) ?? 0 })
    cursor = shiftISO(cursor, 1)
    guard += 1
  }
  return points
}

/** Total 'out' spend across ALL linked transactions (ledger truth, unwindowed). */
export function tripTotalSpendPaise(txns: readonly { amountPaise: number; direction: string }[]): number {
  return txns.reduce((s, t) => (t.direction === 'out' && Number.isFinite(t.amountPaise) ? s + t.amountPaise : s), 0)
}

/** Peak day label for a series ("2026-10-14"), null for empty/all-zero series. */
export function tripPeakDay(series: readonly TripDayPoint[]): ISODate | null {
  let best: TripDayPoint | null = null
  for (const p of series) {
    if (p.outPaise > 0 && (best === null || p.outPaise > best.outPaise)) best = p
  }
  return best ? isoDayUTC(toUTC(best.iso)) : null
}

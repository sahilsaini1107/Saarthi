// Recurrence engine for bills & subscriptions.
// Correctness rules (Golden Rule 3):
//  - monthly/quarterly/annual recurrences preserve the anchor day-of-month
//    and clamp to shorter months WITHOUT drifting (Jan 31 -> Feb 29 -> Mar 31),
//  - custom frequency is every-N-days,
//  - all math is UTC-midnight calendar math.

import { addDaysUTC, addMonthsUTC, daysInMonthUTC, type ISODate } from './date'

export const FREQUENCIES = ['monthly', 'quarterly', 'annual', 'custom_days'] as const
export type Frequency = (typeof FREQUENCIES)[number]

export interface RecurOpts {
  customDays?: number | null
  /** Day-of-month anchor (1..31) preserved across clamped months. */
  anchorDay?: number
}

function monthsFor(freq: Frequency): number {
  switch (freq) {
    case 'monthly':
      return 1
    case 'quarterly':
      return 3
    case 'annual':
      return 12
    case 'custom_days':
      return 0
  }
}

/** Next due date strictly after `due`, per frequency. */
export function advanceDue(due: Date, freq: Frequency, opts: RecurOpts = {}): Date {
  if (freq === 'custom_days') {
    const n = Math.max(1, Math.floor(opts.customDays ?? 30))
    return addDaysUTC(due, n)
  }
  return addMonthsUTC(due, monthsFor(freq), opts.anchorDay ?? due.getUTCDate())
}

/** The next occurrence on/after a reference date, from a bill's stored nextDue. */
export function nextDueOnOrAfter(storedNextDue: Date, freq: Frequency, opts: RecurOpts = {}, today: Date = new Date()): Date {
  let d = storedNextDue
  // Guard against pathological loops (e.g. customDays=1 spanning years).
  for (let i = 0; i < 3660 && d.getTime() < today.getTime(); i++) {
    d = advanceDue(d, freq, opts)
  }
  return d
}

/** Upcoming occurrences starting at `due`, count `count` (for calendar previews). */
export function upcomingOccurrences(due: Date, freq: Frequency, opts: RecurOpts = {}, count = 6): Date[] {
  const out: Date[] = []
  let d = due
  for (let i = 0; i < count; i++) {
    out.push(d)
    d = advanceDue(d, freq, opts)
  }
  return out
}

/** Validate/derive the anchor day for a due date (clamped to month length). */
export function anchorDayFor(due: Date): number {
  return Math.min(due.getUTCDate(), daysInMonthUTC(due.getUTCFullYear(), due.getUTCMonth()))
}

export function isDueInMonth(due: Date, monthStart: Date, monthEndExclusive: Date): boolean {
  return due.getTime() >= monthStart.getTime() && due.getTime() < monthEndExclusive.getTime()
}

export function isoOf(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}

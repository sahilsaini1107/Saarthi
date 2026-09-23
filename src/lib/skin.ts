// Skincare math: PAO (period-after-opening) expiry warnings and the AM/PM
// check-in streak. Pure functions with an injectable "today" (ISO date).
//
// PAO convention (Decision #22): expiry = openedDate + paoMonths calendar
// months (month-end clamped, same drift-free rule as lib/date.addMonthsUTC).
// Warning ladder mirrors the FD reminder idea: expired (red) → ≤7 days
// "soon" → ≤30 days "expiring" → otherwise ok. Products without an open
// date or PAO never warn ('no_pao').
//
// AM/PM streak (Decision #23): a day counts when EITHER the AM or the PM
// checklist was completed. Grace rule as in habits: today not yet done
// doesn't break the streak — counting resumes from yesterday.

import { addMonthsUTC, isoDayUTC, shiftISO, toUTC, type ISODate } from './date'

export type PaoLevel = 'no_pao' | 'ok' | 'expiring' | 'soon' | 'expired'

export interface PaoStatus {
  level: PaoLevel
  /** whole days until expiry (negative = expired); null without PAO data */
  daysLeft: number | null
  /** ISO date the product expires; null without PAO data */
  expiryISO: ISODate | null
}

export function paoStatus(
  openedDate: ISODate | null,
  paoMonths: number | null,
  today: ISODate,
): PaoStatus {
  if (!openedDate || !paoMonths || paoMonths < 1) {
    return { level: 'no_pao', daysLeft: null, expiryISO: null }
  }
  const expiry = addMonthsUTC(toUTC(openedDate), paoMonths)
  const expiryISO = isoDayUTC(expiry)
  const daysLeft = Math.round((expiry.getTime() - toUTC(today).getTime()) / 86_400_000)
  if (daysLeft < 0) return { level: 'expired', daysLeft, expiryISO }
  if (daysLeft <= 7) return { level: 'soon', daysLeft, expiryISO }
  if (daysLeft <= 30) return { level: 'expiring', daysLeft, expiryISO }
  return { level: 'ok', daysLeft, expiryISO }
}

/**
 * Consecutive-day AM/PM streak as of `today`: a day counts when either
 * checklist was done. Today (if not yet done) never breaks the streak.
 */
export function skinStreak(doneDates: ReadonlySet<string>, today: ISODate): number {
  let cursor = today
  if (!doneDates.has(today)) cursor = shiftISO(today, -1)
  let streak = 0
  for (let i = 0; i < 3660; i++) {
    if (doneDates.has(cursor)) streak++
    else break
    cursor = shiftISO(cursor, -1)
  }
  return streak
}

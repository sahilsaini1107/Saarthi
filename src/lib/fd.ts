// Fixed Deposit math: maturity dates, maturity amounts (simple + compound),
// and the 30/15/7/1-day reminder ladder. All pure functions with an
// injectable clock so callers (and tests) control "now".

import { addMonthsUTC, daysBetweenUTC, subDaysUTC, toUTC, type ISODate } from './date'
import { toPaise } from './money'

export const COMPOUNDING_OPTIONS = ['simple', 'annual', 'half_yearly', 'quarterly', 'monthly'] as const
export type Compounding = (typeof COMPOUNDING_OPTIONS)[number]

const PERIODS_PER_YEAR: Record<Exclude<Compounding, 'simple'>, number> = {
  annual: 1,
  half_yearly: 2,
  quarterly: 4,
  monthly: 12,
}

export const FD_REMINDER_OFFSETS = [30, 15, 7, 1] as const

/** Maturity calendar date = start date advanced by tenure months (anchor day preserved). */
export function maturityDateUTC(startISO: ISODate, tenureMonths: number): Date {
  const start = toUTC(startISO)
  return addMonthsUTC(start, tenureMonths, start.getUTCDate())
}

/**
 * Maturity amount in paise, rounded to 2 decimals (half-up) at the final step only.
 *   simple:    A = P + P * r * t          (t = tenureMonths / 12)
 *   compound:  A = P * (1 + r/n)^(n * t)
 */
export function maturityAmountPaise(
  principalPaise: number,
  ratePct: number,
  tenureMonths: number,
  compounding: Compounding,
): number {
  if (principalPaise <= 0 || tenureMonths <= 0) return 0
  const P = principalPaise / 100
  const t = tenureMonths / 12
  let rupees: number
  if (compounding === 'simple') {
    rupees = P + (P * ratePct * t) / 100
  } else {
    const n = PERIODS_PER_YEAR[compounding]
    rupees = P * Math.pow(1 + ratePct / (100 * n), n * t)
  }
  return toPaise(rupees)
}

/** The four reminder dates (maturity − 30/15/7/1 days), soonest last. */
export function reminderDatesUTC(maturity: Date): Date[] {
  return FD_REMINDER_OFFSETS.map((d) => subDaysUTC(maturity, d))
}

export type FdReminderLevel = 'none' | 'd30' | 'd15' | 'd7' | 'd1' | 'matured'

/**
 * Which reminder window the FD is currently in, given an injected clock.
 * 'd30' means "30 days or fewer until maturity" etc. Once past the 7-day
 * marker only the tightest window ('d1') is reported; past maturity -> 'matured'.
 */
export function reminderStatus(maturity: Date, now: Date): { level: FdReminderLevel; daysLeft: number } {
  const daysLeft = daysBetweenUTC(now, maturity)
  if (daysLeft <= 0) return { level: 'matured', daysLeft }
  if (daysLeft <= 1) return { level: 'd1', daysLeft }
  if (daysLeft <= 7) return { level: 'd7', daysLeft }
  if (daysLeft <= 15) return { level: 'd15', daysLeft }
  if (daysLeft <= 30) return { level: 'd30', daysLeft }
  return { level: 'none', daysLeft }
}

/** Reminders whose date has arrived (<= now), ordered most-recent-first. */
export function firedReminders(maturity: Date, now: Date): number[] {
  return reminderDatesUTC(maturity)
    .map((d, i) => ({ offset: FD_REMINDER_OFFSETS[i], date: d }))
    .filter((r) => r.date.getTime() <= now.getTime())
    .sort((a, b) => a.offset - b.offset)
    .map((r) => r.offset)
}

/** Fraction of tenure elapsed, clamped to [0, 1]. */
export function elapsedProgress(startISO: ISODate, tenureMonths: number, maturity: Date, now: Date): number {
  const start = toUTC(startISO)
  const total = maturity.getTime() - start.getTime()
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / total))
}

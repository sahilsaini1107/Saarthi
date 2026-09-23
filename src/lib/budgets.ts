// Budget pace math (Phase 5.1) — pure + injectable-friendly (all inputs
// are plain numbers, no clock reads).
//
// Conventions (Decision #25):
//  - A budget RECURS monthly; there are no per-month overrides.
//  - Pace is compared linearly: by end of day D of an N-day month, the
//    "on-pace" spend fraction is D/N. Today counts as a full elapsed day —
//    the check happens against money already spent, not money planned for
//    the rest of the day.
//  - Bands, with exact boundaries (unit-tested):
//      over      spent% > 100                        (budget exceeded)
//      watch     spent% − expected% ≥ 10pp           (materially ahead of calendar)
//      on_track  everything else
//  - A missing/zero budget has no band ('none').

export type BudgetBand = 'over' | 'watch' | 'on_track' | 'none'

/**
 * Fraction (0..1) of the month expected to be spent by END of day `day`
 * (1-indexed). Day 31 of a 31-day month → 1; day 1 of 30 → 1/30.
 * Leap months fall out of `daysInMonth` naturally.
 */
export function monthElapsedFraction(day: number, daysInMonth: number): number {
  if (!Number.isFinite(day) || !Number.isFinite(daysInMonth) || daysInMonth <= 0 || day <= 0) return 0
  return Math.min(1, day / daysInMonth)
}

/** Band for a spend level vs budget at the given expected fraction. */
export function bandFor(spentPaise: number, budgetPaise: number, expectedFraction: number): BudgetBand {
  if (!Number.isFinite(spentPaise) || !Number.isFinite(budgetPaise) || budgetPaise <= 0) return 'none'
  const spentPct = (spentPaise / budgetPaise) * 100
  if (spentPct > 100) return 'over'
  const expectedPct = (Number.isFinite(expectedFraction) ? Math.max(0, expectedFraction) : 0) * 100
  if (spentPct - expectedPct >= 10) return 'watch'
  return 'on_track'
}

/**
 * Straight-line month-end projection: spent ÷ elapsed fraction, rounded to
 * whole paise. Null on day 0 / degenerate input — extrapolating from zero
 * elapsed days is meaningless.
 */
export function projectedMonthEndPaise(spentPaise: number, day: number, daysInMonth: number): number | null {
  const f = monthElapsedFraction(day, daysInMonth)
  if (f <= 0) return null
  return Math.round(spentPaise / f)
}

/** Days left in the month AFTER today (last day → 0). */
export function daysLeftInMonth(day: number, daysInMonth: number): number {
  if (day >= daysInMonth) return 0
  return daysInMonth - day
}

/**
 * "Safe to spend" per remaining day to land exactly on budget:
 * (budget − spent) ÷ remaining days, floored to whole paise. Negative when
 * already over (that overshoot is NOT spread onto remaining days).
 */
export function safeDailySpendPaise(budgetPaise: number, spentPaise: number, daysLeft: number): number {
  const remaining = budgetPaise - spentPaise
  if (remaining <= 0) return 0
  if (daysLeft <= 0) return remaining // last day: whatever is left is the target
  return Math.floor(remaining / daysLeft)
}

/** Share (0..1) of budgets that are NOT 'over' and NOT 'watch' — Life Score input. */
export function onTrackRatio(bands: readonly BudgetBand[]): number | null {
  const counted = bands.filter((b) => b !== 'none')
  if (counted.length === 0) return null
  const ok = counted.filter((b) => b === 'on_track').length
  return ok / counted.length
}

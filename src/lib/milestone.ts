// Milestone journal math (Phase 11) — pure functions, same injectable
// "today" pattern as lib/goals.ts (Decision #8).
//
// Rules (Decision #46):
//  - One journal log per milestone per day (exactly-once, upsert-replace —
//    same convention as GoalContribution and habit check-ins).
//  - The GOAL-level grid aggregates minutes across all of the goal's
//    milestones; intensity uses the study convention (nearest-rank quartiles
//    of nonzero days — no preset target) via effort-grid.levelsForValues.
//  - Time progress against a milestone's planned minutes is INFORMATIONAL:
//    capped at 100% and never drives completion — milestones stay done via
//    their task checklist or the manual toggle (Decision #18 unchanged).
//  - Streaks count days with any journal minutes > 0 and keep the habit
//    today-grace rule: an un-logged today does not break the current run.

import type { ISODate } from './date'
import { bestStreak, currentStreak, type ContributionDayInput } from './goals-grid'

/** Per-day journal ceiling: minutes worked in a day (24h). */
export const MAX_DAY_MINUTES = 1440
/** Planned-effort ceiling per milestone: 100_000 min ≈ 1 666 hours. */
export const MAX_TARGET_MINUTES = 100_000

export interface MilestoneDayLog {
  iso: ISODate
  minutes: number
}

/** Σ minutes per calendar day across milestones (journal → goal grid). */
export function sumMinutesByDay(logs: MilestoneDayLog[]): Map<ISODate, number> {
  const byDay = new Map<ISODate, number>()
  for (const l of logs) {
    if (!Number.isFinite(l.minutes) || l.minutes <= 0) continue
    byDay.set(l.iso, (byDay.get(l.iso) ?? 0) + l.minutes)
  }
  return byDay
}

/**
 * Informational time progress 0..1 against planned minutes; null without a
 * positive target. Capped at 1 — logging past the plan reads as done, not
 * as >100%.
 */
export function timeProgress(totalMinutes: number, targetMinutes: number | null | undefined): number | null {
  if (!targetMinutes || targetMinutes <= 0) return null
  if (totalMinutes <= 0) return 0
  return Math.min(1, totalMinutes / targetMinutes)
}

/** Journal day-totals → contribution-day inputs so streaks reuse lib/goals-grid. */
export function toContributionDays(byDay: ReadonlyMap<ISODate, number>): ContributionDayInput[] {
  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([iso, minutes]) => ({ iso, amountMilli: minutes, tasksDone: 0 }))
}

/** Current/best streak of journaled days (today-grace applies). */
export function journalStreaks(byDay: ReadonlyMap<ISODate, number>, today: ISODate): { current: number; best: number } {
  const days = toContributionDays(byDay)
  return {
    current: currentStreak(days, today, { hasMetric: true }),
    best: bestStreak(days, { hasMetric: true }),
  }
}

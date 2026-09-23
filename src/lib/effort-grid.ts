// Effort-grid math shared by goals (Phase 9), habits and study (Phase 10).
// Pure functions with an injectable "today" (ISO calendar date) — same
// pattern as lib/goals-grid.ts / lib/habits.ts (Decision #8).
//
// Rules (Decision #44):
//  - Habits and study grids show the entity's OWN window: from its start
//    date (or today when it has none) up to today, capped at the LAST
//    400 days — same cap as the goal grid so render cost stays bounded.
//  - Habit intensity is binary and honest: scheduled + done → L4 (full
//    block, GitHub's darkest), everything else → L0. Missed scheduled days
//    must read as empty, never as faint effort. Rest days are L0 too —
//    they are not misses (lib/habits grace rules).
//  - Study intensity = minutes/day with NO preset target: levels come from
//    nearest-rank quartiles of the nonzero days (GitHub's own trick,
//    reused from lib/goals-grid quartile fallback).
//  - Weekly/monthly roll-ups ALWAYS aggregate full history (never the
//    capped render window — Decision #43's lesson: stats must not hide
//    history). Weeks are Monday-anchored like the grid columns; the
//    current week/month is included and simply partial to date.

import { daysBetweenUTC, isoDayUTC, shiftISO, toUTC, type ISODate } from './date'
import { GRID_MAX_DAYS, levelForAmount, weekdayMon, type ContributionDayInput } from './goals-grid'

export interface EffortWindow {
  start: ISODate
  end: ISODate
}

/**
 * Display window for a habit/course: [startISO, today], capped at the last
 * `maxDays` days. Null start (or a future start) yields null — nothing to
 * render yet. `today` earlier than `startISO` is treated as "not started".
 */
export function trailingWindow(
  startISO: ISODate | null | undefined,
  today: ISODate,
  maxDays: number = GRID_MAX_DAYS,
): EffortWindow | null {
  if (!startISO || startISO > today) return null
  const span = daysBetweenUTC(toUTC(startISO), toUTC(today)) + 1
  if (span <= maxDays) return { start: startISO, end: today }
  return { start: shiftISO(today, -(maxDays - 1)), end: today }
}

/** Habit intensity: a done day is a full block; everything else is empty. */
export function levelForCheckIn(done: boolean): number {
  return done ? 4 : 0
}

/**
 * Intensity levels for value-per-day grids (study minutes) WITHOUT a target:
 * nearest-rank quartiles of the nonzero values; <4 nonzero days → any effort
 * shows L2 (same fallback as goals, Decision #43).
 */
export function levelsForValues(days: { iso: ISODate; value: number }[]): number[] {
  const inputs: ContributionDayInput[] = days.map((d) => ({ iso: d.iso, amountMilli: d.value, tasksDone: 0 }))
  // reuse the quartile fallback path of gridLevels: benchmark null ⇒ quartiles
  const values = days.map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b)
  let quartiles: [number, number, number] | null = null
  if (values.length >= 4) {
    const at = (p: number) => values[Math.min(values.length - 1, Math.max(0, Math.ceil(p * values.length) - 1))]
    quartiles = [at(0.25), at(0.5), at(0.75)]
  }
  return days.map((d) => levelForAmount(d.value, null, quartiles))
}

/* ------------------------------------------------------------------ */
/* Weekly / monthly roll-ups (full history, Monday-anchored weeks)     */
/* ------------------------------------------------------------------ */

export interface WeekRollup {
  /** Monday of the week */
  start: ISODate
  /** end of the rolled-up range: Sunday, or today for the current week */
  end: ISODate
  /** Σ of the day values inside the week */
  total: number
  /** days with a nonzero value */
  activeDays: number
  current: boolean
}

export interface MonthRollup {
  /** "YYYY-MM" */
  monthKey: string
  /** Σ of the day values inside the month (to date for the current month) */
  total: number
  /** days with a nonzero value */
  activeDays: number
  current: boolean
}

/** Monday of the week containing `iso`. */
export function weekStartISO(iso: ISODate): ISODate {
  return shiftISO(iso, -weekdayMon(iso))
}

/**
 * The last `count` Monday-anchored weeks ending with the current (partial)
 * week. Weeks with zero activity are still returned — the point is the
 * rhythm, and an empty recent week IS information.
 */
export function rollupWeeks(
  byDay: ReadonlyMap<ISODate, number>,
  today: ISODate,
  count = 4,
): WeekRollup[] {
  const currentStart = weekStartISO(today)
  const out: WeekRollup[] = []
  for (let w = count - 1; w >= 0; w--) {
    const start = shiftISO(currentStart, -7 * w)
    const naturalEnd = shiftISO(start, 6)
    const end = naturalEnd > today ? today : naturalEnd
    let total = 0
    let activeDays = 0
    const span = daysBetweenUTC(toUTC(start), toUTC(end)) + 1
    for (let i = 0; i < span; i++) {
      const v = byDay.get(shiftISO(start, i)) ?? 0
      total += v
      if (v > 0) activeDays++
    }
    out.push({ start, end, total, activeDays, current: w === 0 })
  }
  return out
}

/**
 * The last `count` calendar months ending with the current (partial) month,
 * ordered oldest → newest. Feb 29 leap days belong to February.
 */
export function rollupMonths(
  byDay: ReadonlyMap<ISODate, number>,
  today: ISODate,
  count = 4,
): MonthRollup[] {
  const out: MonthRollup[] = []
  for (let m = count - 1; m >= 0; m--) {
    const anchor = new Date(`${today}T00:00:00.000Z`)
    const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - m, 1))
    const monthKey = isoDayUTC(first).slice(0, 7)
    const nextMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1))
    const lastDay = isoDayUTC(new Date(nextMonth.getTime() - 86_400_000))
    const end = lastDay > today ? today : lastDay
    let total = 0
    let activeDays = 0
    // iterate the month's days up to `end` — days before the map's history
    // simply read 0 from the map
    const span = daysBetweenUTC(toUTC(isoDayUTC(first)), toUTC(end)) + 1
    for (let i = 0; i < span; i++) {
      const v = byDay.get(shiftISO(isoDayUTC(first), i)) ?? 0
      total += v
      if (v > 0) activeDays++
    }
    out.push({ monthKey, total, activeDays, current: m === 0 })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** "45m" · "1h" · "1h 15m" · "10h" — study-grid day/rollup labels. */
export function formatMinutes(mins: number): string {
  const m = Math.max(0, Math.round(mins))
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h === 0) return `${rem}m`
  if (rem === 0) return `${h}h`
  return `${h}h ${rem}m`
}

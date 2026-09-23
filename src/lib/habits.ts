// Habit & routine schedule + streak math. All pure functions with an
// injectable "today" (ISO calendar date) so callers and tests control time —
// same pattern as lib/fd.ts (Decision #8).
//
// Correctness rules (Golden Rule 3):
//  - weekdays is a 7-char bitstring Mon..Sun, e.g. "1111100" = weekdays only.
//    All comparisons run on UTC-midnight calendar dates (the stored convention).
//  - A streak counts consecutive *scheduled* days that were completed.
//    Unscheduled days never break a streak (rest days are not misses).
//  - GRACE RULE: if today is scheduled but not yet checked in, the streak is
//    still alive (the day isn't over) — counting resumes from yesterday.
//    A missed *past* scheduled day breaks it.
//  - "today" is always derived from the user's timezone by the caller.

import { addDaysUTC, daysBetweenUTC, isoDayUTC, shiftISO, toUTC, type ISODate } from './date'

export const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const
export const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Parse "1111100" -> [true,true,true,true,true,false,false] (Mon..Sun). */
export function parseWeekdays(weekdays: string): boolean[] {
  const pad = (weekdays + '1111111').slice(0, 7)
  return pad.split('').map((c) => c === '1')
}

/** Validate + normalise a weekdays bitstring; throws on garbage. */
export function normalizeWeekdays(weekdays: string): string {
  if (!/^[01]{7}$/.test(weekdays)) throw new Error('weekdays must be a 7-char 0/1 string (Mon..Sun)')
  return weekdays
}

/** UTC-midnight Date -> Mon..Sun index (0..6). */
function mondayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7
}

/** Is the habit scheduled on this calendar date? */
export function isScheduledOn(weekdays: string, iso: ISODate): boolean {
  return parseWeekdays(weekdays)[mondayIndex(toUTC(iso))]
}

/** Is the habit scheduled today-ish (any scheduled day at all)? */
export function hasAnyScheduledDay(weekdays: string): boolean {
  return weekdays.includes('1')
}

/**
 * Current streak as of `today`, in scheduled days completed.
 * Implements the grace rule: an un-done today doesn't break the streak.
 * Walks back day-by-day; unscheduled days are skipped, a missed scheduled
 * day stops the walk. Bounded at 10 years of lookback.
 */
export function currentStreak(
  doneDates: ReadonlySet<string>,
  weekdays: string,
  today: ISODate,
): number {
  let streak = 0
  let cursor = today
  // If today is scheduled but not done, start counting from yesterday —
  // the day isn't over yet, the streak is on the line but not broken.
  if (isScheduledOn(weekdays, today) && !doneDates.has(today)) {
    cursor = shiftISO(today, -1)
  }
  for (let i = 0; i < 3660; i++) {
    if (isScheduledOn(weekdays, cursor)) {
      if (doneDates.has(cursor)) streak++
      else break
    }
    if (cursor <= earliestBound(today)) break // hard stop, 10 years
    cursor = shiftISO(cursor, -1)
  }
  return streak
}

function earliestBound(today: ISODate): string {
  return shiftISO(today, -3660)
}

/**
 * Longest streak ever, across the full history of done dates.
 * Iterates from the earliest done day to the latest (bounded to the entry
 * range — no dependency on "today"), applying the same scheduled-day rules.
 */
export function longestStreak(doneDates: readonly string[], weekdays: string): number {
  if (doneDates.length === 0) return 0
  const sorted = [...new Set(doneDates)].sort()
  const first = toUTC(sorted[0])
  const last = toUTC(sorted[sorted.length - 1])
  const done = new Set(sorted)

  let best = 0
  let run = 0
  let cursor = first
  for (let i = 0; i <= daysBetweenUTC(first, last) && i < 36600; i++) {
    const iso = isoDayUTC(cursor)
    if (isScheduledOn(weekdays, iso)) {
      if (done.has(iso)) {
        run++
        best = Math.max(best, run)
      } else {
        run = 0
      }
    }
    cursor = addDaysUTC(cursor, 1)
  }
  return best
}

/**
 * Completion rate over [startISO, endISO] inclusive: completed scheduled days
 * / scheduled days. Days after `today` are excluded (not yet due).
 * Returns 0 when nothing was scheduled in the window.
 */
export function completionRate(
  doneDates: ReadonlySet<string>,
  weekdays: string,
  startISO: ISODate,
  endISO: ISODate,
  today?: ISODate,
): number {
  const effectiveEnd = today && endISO > today ? today : endISO
  const start = toUTC(startISO)
  const end = toUTC(effectiveEnd)
  if (end.getTime() < start.getTime()) return 0
  const totalDays = daysBetweenUTC(start, end) + 1
  let scheduled = 0
  let done = 0
  let cursor = start
  for (let i = 0; i < totalDays; i++) {
    const iso = isoDayUTC(cursor)
    if (isScheduledOn(weekdays, iso)) {
      scheduled++
      if (doneDates.has(iso)) done++
    }
    cursor = addDaysUTC(cursor, 1)
  }
  return scheduled === 0 ? 0 : done / scheduled
}

export interface BuildingProgress {
  /** 1-indexed day of the building window, clamped to [0, buildingDays] */
  day: number
  total: number
  pct: number
  /** true once the building window is complete */
  built: boolean
  /** days still left in the window (0 when built) */
  daysLeft: number
}

/**
 * 66-day building mode progress. `day` = full calendar days elapsed since
 * startDate + 1 (the start day counts as day 1), clamped to the window.
 */
export function buildingProgress(
  startISO: ISODate,
  buildingDays: number,
  today: ISODate,
): BuildingProgress {
  const total = Math.max(1, buildingDays)
  const elapsed = daysBetweenUTC(toUTC(startISO), toUTC(today)) + 1 // start day = day 1
  const day = Math.min(total, Math.max(0, elapsed))
  const built = elapsed >= total
  return {
    day,
    total,
    pct: Math.min(100, (day / total) * 100),
    built,
    daysLeft: Math.max(0, total - elapsed),
  }
}

export interface StreakDayPoint {
  iso: ISODate
  /** true = completed, false = scheduled & missed, null = not scheduled / future */
  done: boolean | null
}

/**
 * Heatmap for the StreakCalendar: `days` calendar days ending at `today`
 * (inclusive). Scheduled+done -> true, scheduled+missed -> false, everything
 * else -> null. Future days are always null.
 */
export function heatmapDays(
  doneDates: ReadonlySet<string>,
  weekdays: string,
  today: ISODate,
  days = 35,
): StreakDayPoint[] {
  const out: StreakDayPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const iso = shiftISO(today, -i)
    if (iso > today) {
      out.push({ iso, done: null })
      continue
    }
    if (!isScheduledOn(weekdays, iso)) out.push({ iso, done: null })
    else out.push({ iso, done: doneDates.has(iso) })
  }
  return out
}

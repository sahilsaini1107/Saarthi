// Life Principles (Phase 15) — adherence math. All pure functions with an
// injectable "today" (ISO calendar date) so callers and tests control time —
// same pattern as lib/habits.ts (Decision #8).
//
// Semantics (golden-rule aligned):
//  - Every (principle, day) is exactly one of: kept | broken | na | null
//    (null = not yet reviewed). `na` is an explicit skip (sickness, travel…)
//    and behaves like a rest day: it neither helps nor hurts.
//  - kept-streak: consecutive days that did NOT break the principle (kept or
//    na), walking back from today. Grace rule: an un-reviewed TODAY does not
//    break the streak (the day isn't over) — a broken past day does.
//  - adherence over a window: kept / (kept + broken). `na` and unmarked days
//    are excluded from the denominator (honest: only judged days count).
//    Returns null when nothing was judged — "no data" is not 0%.
//  - Dates are the stored convention: ISO calendar strings / UTC-midnight.

import { addDaysUTC, isoDayUTC, shiftISO, toUTC, type ISODate } from './date'

export const PRINCIPLE_STATUSES = ['kept', 'broken', 'na'] as const
export type PrincipleStatus = (typeof PRINCIPLE_STATUSES)[number]

export function isPrincipleStatus(s: string): s is PrincipleStatus {
  return (PRINCIPLE_STATUSES as readonly string[]).includes(s)
}

export const PRINCIPLE_CATEGORIES = [
  { key: 'character', label: 'Character', emoji: '🧭' },
  { key: 'discipline', label: 'Discipline', emoji: '⚡' },
  { key: 'money', label: 'Money', emoji: '💰' },
  { key: 'health', label: 'Health', emoji: '💪' },
  { key: 'relationships', label: 'Relationships', emoji: '🤝' },
  { key: 'work', label: 'Work', emoji: '💼' },
] as const

export type PrincipleCategoryKey = (typeof PRINCIPLE_CATEGORIES)[number]['key']

export function isPrincipleCategory(c: string): c is PrincipleCategoryKey {
  return PRINCIPLE_CATEGORIES.some((cat) => cat.key === c)
}

export function categoryMeta(key: string): { label: string; emoji: string } {
  return PRINCIPLE_CATEGORIES.find((cat) => cat.key === key) ?? PRINCIPLE_CATEGORIES[0]
}

/** A check as the pure layer sees it. */
export interface CheckLike {
  date: ISODate
  status: PrincipleStatus
}

/** Map raw check rows into the pure shape (defensive: unknown → dropped). */
export function toChecks(rows: readonly { date: Date; status: string }[]): CheckLike[] {
  return rows
    .filter((r) => isPrincipleStatus(r.status))
    .map((r) => ({ date: isoDayUTC(r.date), status: r.status as PrincipleStatus }))
}

/** The check recorded for a specific day, or null when un-reviewed. */
export function dayStatus(byDay: ReadonlyMap<ISODate, PrincipleStatus>, iso: ISODate): PrincipleStatus | null {
  return byDay.get(iso) ?? null
}

/** Convenience: build an iso→status lookup from checks. */
export function checksByDay(checks: readonly CheckLike[]): Map<ISODate, PrincipleStatus> {
  const map = new Map<ISODate, PrincipleStatus>()
  for (const c of checks) map.set(c.date, c.status)
  return map
}

/**
 * Adherence over [startISO, endISO] inclusive: kept / (kept + broken).
 * `na` days and unmarked days are excluded from the denominator; days after
 * `today` are excluded entirely (not yet due). null when nothing was judged.
 */
export function adherenceRate(
  checks: readonly CheckLike[],
  startISO: ISODate,
  endISO: ISODate,
  today?: ISODate,
): number | null {
  const effectiveEnd = today && endISO > today ? today : endISO
  if (effectiveEnd < startISO) return null
  const start = toUTC(startISO)
  const end = toUTC(effectiveEnd)
  const byDay = checksByDay(checks)
  let kept = 0
  let judged = 0
  for (let d = new Date(start); d.getTime() <= end.getTime(); d = addDaysUTC(d, 1)) {
    const status = byDay.get(isoDayUTC(d))
    if (status === 'kept') {
      kept++
      judged++
    } else if (status === 'broken') {
      judged++
    }
  }
  return judged === 0 ? null : kept / judged
}

/**
 * Current kept-streak as of `today`. Walks back day by day: kept or na keeps
 * the walk alive, broken stops it, un-reviewed past days stop it too (a rule
 * you forgot about is a rule you didn't keep). Grace rule: an un-reviewed
 * TODAY doesn't break the streak — the day isn't over. Bounded at 10 years.
 */
export function keptStreak(checks: readonly CheckLike[], today: ISODate): number {
  const byDay = checksByDay(checks)
  let streak = 0
  let cursor = today
  // Grace: today still open — start counting from yesterday.
  if (!byDay.has(today)) cursor = shiftISO(today, -1)
  for (let i = 0; i < 3660; i++) {
    const status = byDay.get(cursor)
    if (status === undefined || status === 'broken') break
    if (cursor <= shiftISO(today, -3660)) break // hard stop, 10 years
    if (status === 'kept') streak++
    cursor = shiftISO(cursor, -1)
  }
  return streak
}

/**
 * Longest kept-run across the full history (bounded by the entry range, no
 * dependency on today). broken resets the run; na continues it (explicit
 * skips are not failures); un-reviewed gaps INSIDE the checked history also
 * reset — an untracked stretch is not a kept stretch.
 */
export function longestKeptRun(checks: readonly CheckLike[]): number {
  if (checks.length === 0) return 0
  const sorted = [...checks].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const first = toUTC(sorted[0].date)
  const last = toUTC(sorted[sorted.length - 1].date)
  const byDay = checksByDay(checks)

  let best = 0
  let run = 0
  for (let d = new Date(first); d.getTime() <= last.getTime(); d = addDaysUTC(d, 1)) {
    const status = byDay.get(isoDayUTC(d))
    if (status === 'broken' || status === undefined) {
      run = 0
    } else if (status === 'kept') {
      run++
      best = Math.max(best, run)
    }
    // na: continues the run without adding to it
  }
  return best
}

/** Count of broken days in [startISO, endISO] inclusive (future excluded via today). */
export function breaksInWindow(checks: readonly CheckLike[], startISO: ISODate, endISO: ISODate, today?: ISODate): number {
  const effectiveEnd = today && endISO > today ? today : endISO
  if (effectiveEnd < startISO) return 0
  const start = toUTC(startISO)
  const end = toUTC(effectiveEnd)
  const byDay = checksByDay(checks)
  let broken = 0
  for (let d = new Date(start); d.getTime() <= end.getTime(); d = addDaysUTC(d, 1)) {
    if (byDay.get(isoDayUTC(d)) === 'broken') broken++
  }
  return broken
}

/** Most recent broken day, or null. */
export function lastBreak(checks: readonly CheckLike[]): ISODate | null {
  let latest: ISODate | null = null
  for (const c of checks) {
    if (c.status === 'broken' && (!latest || c.date > latest)) latest = c.date
  }
  return latest
}

export interface PrincipleDayCell {
  iso: ISODate
  status: PrincipleStatus | null
  future: boolean
}

/** Compact review strip for the UI: `days` calendar days ending at today. */
export function recentDayStrip(checks: readonly CheckLike[], today: ISODate, days = 14): PrincipleDayCell[] {
  const byDay = checksByDay(checks)
  const out: PrincipleDayCell[] = []
  for (let i = days - 1; i >= 0; i--) {
    const iso = shiftISO(today, -i)
    out.push({ iso, status: byDay.get(iso) ?? null, future: iso > today })
  }
  return out
}

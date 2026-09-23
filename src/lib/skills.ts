// Skill tracker (Phase 17) — XP, levels, streaks, pace and ETA math.
// All pure functions with an injectable "today" (ISO calendar date) so callers
// and tests control time — same pattern as lib/principles.ts (Decision #8).
//
// Semantics (simpler interpretation, documented in PROGRESS.md):
//  - XP = practice minutes, 1:1. No multipliers, no gamification drift —
//    the number you can verify is the minutes you actually spent.
//  - Levels come from a FIXED cumulative threshold curve shared by every
//    skill (level 1 at 0 XP → level 10 at 4,500 XP = 75 focused hours), so a
//    "level 4 guitar" and a "level 4 speaking" mean the same effort.
//  - practice-streak: consecutive days with ≥1 practice log ending at today.
//    Grace rule: an un-logged TODAY does not break the streak (the day isn't
//    over) — a missed past day does. Multiple logs on one day count once.
//  - pace = practice minutes ÷ elapsed calendar days in the window
//    (the window start counts as day 1 — same denominator rule as reading).
//  - ETA to target level = ceil(remaining XP ÷ daily pace). Returns 0 when
//    the target is already reached, null when pace is unknown/invalid.
//  - Dates are the stored convention: ISO calendar strings / UTC-midnight.

import { isoDayUTC, shiftISO, toUTC, type ISODate } from './date'

/** Cumulative XP needed to REACH level index+1 (LEVEL_XP[0] = reach level 1). */
export const LEVEL_XP: readonly number[] = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500]

export const MAX_LEVEL = LEVEL_XP.length

export const SKILL_CATEGORIES = [
  { key: 'technical', label: 'Technical', emoji: '💻' },
  { key: 'communication', label: 'Communication', emoji: '🗣️' },
  { key: 'creative', label: 'Creative', emoji: '🎨' },
  { key: 'physical', label: 'Physical', emoji: '🏋️' },
  { key: 'social', label: 'Social', emoji: '🤝' },
  { key: 'professional', label: 'Professional', emoji: '💼' },
  { key: 'other', label: 'Other', emoji: '✨' },
] as const

export type SkillCategoryKey = (typeof SKILL_CATEGORIES)[number]['key']

export function isSkillCategory(c: string): c is SkillCategoryKey {
  return SKILL_CATEGORIES.some((cat) => cat.key === c)
}

export function skillCategoryMeta(key: string): { label: string; emoji: string } {
  return SKILL_CATEGORIES.find((cat) => cat.key === key) ?? SKILL_CATEGORIES[SKILL_CATEGORIES.length - 1]
}

export const SKILL_STATUSES = ['active', 'paused', 'archived'] as const
export type SkillStatus = (typeof SKILL_STATUSES)[number]

export function isSkillStatus(s: string): s is SkillStatus {
  return (SKILL_STATUSES as readonly string[]).includes(s)
}

/** A practice row as the pure layer sees it. */
export interface PracticeLike {
  date: ISODate
  minutes: number
}

/** Map raw practice rows into the pure shape (defensive: non-positive dropped). */
export function toPractices(rows: readonly { date: Date; minutes: number }[]): PracticeLike[] {
  return rows
    .filter((r) => r.minutes > 0)
    .map((r) => ({ date: isoDayUTC(r.date), minutes: r.minutes }))
}

/** Cumulative XP required to reach `level` (clamped to 1..MAX_LEVEL). */
export function xpForLevel(level: number): number {
  const clamped = Math.min(Math.max(Math.round(level), 1), MAX_LEVEL)
  return LEVEL_XP[clamped - 1]
}

/** Current level for a total XP amount — always 1..MAX_LEVEL. */
export function levelForXp(xp: number): number {
  const safe = Math.max(0, Math.floor(xp))
  for (let i = LEVEL_XP.length - 1; i >= 0; i--) {
    if (safe >= LEVEL_XP[i]) return i + 1
  }
  return 1
}

export interface LevelProgress {
  level: number
  /** XP accumulated inside the current level band */
  into: number
  /** width of the current level band in XP (0 at max) */
  span: number
  /** 0..100, 2-decimal (repo Math.round convention); 100 at max */
  pct: number
  /** cumulative XP where the next level starts (null at max) */
  nextAt: number | null
  isMax: boolean
}

/** Position inside the current level band, for progress bars. */
export function levelProgress(xp: number): LevelProgress {
  const safe = Math.max(0, Math.floor(xp))
  const level = levelForXp(safe)
  if (level >= MAX_LEVEL) return { level, into: 0, span: 0, pct: 100, nextAt: null, isMax: true }
  const floorXp = LEVEL_XP[level - 1]
  const nextAt = LEVEL_XP[level]
  const into = safe - floorXp
  const span = nextAt - floorXp
  return { level, into, span, pct: Math.round((into / span) * 100 * 100) / 100, nextAt, isMax: false }
}

/** Days (ISO strings, deduped) on which at least one practice happened. */
export function practicedDays(practices: readonly PracticeLike[]): ISODate[] {
  return [...new Set(practices.filter((p) => p.minutes > 0).map((p) => p.date))].sort()
}

/**
 * Practice streak as of `today`: consecutive days with ≥1 practice, walking
 * back from today. Grace rule: an un-logged today doesn't break it (the day
 * isn't over); a missed past day does. Bounded at 10 years.
 */
export function practiceStreak(practices: readonly PracticeLike[], today: ISODate): number {
  const days = new Set(practicedDays(practices))
  let streak = 0
  let cursor = today
  if (!days.has(today)) cursor = shiftISO(today, -1) // grace: today still open
  for (let i = 0; i < 3660; i++) {
    if (!days.has(cursor)) break
    if (cursor <= shiftISO(today, -3660)) break // hard stop, 10 years
    streak++
    cursor = shiftISO(cursor, -1)
  }
  return streak
}

/** Sum of minutes within [startISO, endISO] inclusive. */
export function minutesInWindow(practices: readonly PracticeLike[], startISO: ISODate, endISO: ISODate): number {
  let sum = 0
  for (const p of practices) {
    if (p.minutes <= 0) continue
    if (p.date >= startISO && p.date <= endISO) sum += p.minutes
  }
  return sum
}

/**
 * Trailing-`days` window ending at `today` (inclusive): sum of minutes.
 * Calendar-day window — leaps and month lengths come from ISO arithmetic.
 */
export function minutesTrailing(practices: readonly PracticeLike[], today: ISODate, days: number): number {
  return minutesInWindow(practices, shiftISO(today, -(days - 1)), today)
}

/**
 * Daily practice pace over [startISO, endISO]: minutes ÷ elapsed days, where
 * the window start counts as day 1 (same denominator rule as reading pace).
 * Clamped to end at `today`; null when the window is empty or in the future.
 */
export function paceMinutes(
  practices: readonly PracticeLike[],
  startISO: ISODate,
  endISO: ISODate,
  today?: ISODate,
): number | null {
  const effectiveEnd = today && endISO > today ? today : endISO
  if (effectiveEnd < startISO) return null
  const elapsed = Math.round((toUTC(effectiveEnd).getTime() - toUTC(startISO).getTime()) / 86_400_000) + 1
  if (elapsed <= 0) return null
  return minutesInWindow(practices, startISO, effectiveEnd) / elapsed
}

/**
 * ETA in days to reach `targetLevel` at `paceMinutesPerDay` minutes/day.
 * Returns 0 when the target XP is already reached, null when the pace is
 * invalid (≤0) — "no data" is not "tomorrow". Otherwise ceil(remaining ÷ pace).
 */
export function etaDaysToLevel(xp: number, targetLevel: number, paceMinutesPerDay: number | null): number | null {
  if (paceMinutesPerDay == null || !Number.isFinite(paceMinutesPerDay) || paceMinutesPerDay <= 0) return null
  const targetXp = xpForLevel(targetLevel)
  const remaining = targetXp - Math.max(0, Math.floor(xp))
  if (remaining <= 0) return 0
  return Math.ceil(remaining / paceMinutesPerDay)
}

export interface PracticeDayCell {
  iso: ISODate
  minutes: number
}

/**
 * Compact day strip for the UI: `days` calendar days ending at today, with
 * the total minutes practiced on each day (0 = no practice).
 */
export function recentPracticeStrip(practices: readonly PracticeLike[], today: ISODate, days = 14): PracticeDayCell[] {
  const byDay = new Map<ISODate, number>()
  for (const p of practices) {
    if (p.minutes <= 0) continue
    byDay.set(p.date, (byDay.get(p.date) ?? 0) + p.minutes)
  }
  const out: PracticeDayCell[] = []
  for (let i = days - 1; i >= 0; i--) {
    const iso = shiftISO(today, -i)
    out.push({ iso, minutes: byDay.get(iso) ?? 0 })
  }
  return out
}

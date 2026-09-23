// People CRM (Phase 17) — the reconnect-due engine. All pure functions with
// an injectable "today" (ISO calendar date) so callers and tests control
// time — same pattern as lib/principles.ts (Decision #8).
//
// Semantics (simpler interpretation, documented in PROGRESS.md):
//  - Freshness is DERIVED from touchpoints (the last one wins); nothing stale
//    is stored on the person row, so back-dated logs immediately fix overdue
//    badges.
//  - Cadence: how often you want to touch this person. Default per importance
//    (3 = core → 14 days, 2 = regular → 30, 1 = extended → 90) with an
//    explicit per-person override in days.
//  - dueInDays = cadence − daysSince(last touch). status:
//      never    — no touchpoint exists (always worth a first message)
//      ok       — dueInDays > 0 (inside the window)
//      due      — dueInDays === 0 (today is the day)
//      overdue  — dueInDays < 0 (the window has slipped)
//  - Rank for Today/nudges: never and overdue first (most-overdue first),
//    then due, then ok (soonest-due first). Lower rank = more urgent.
//  - Dates are the stored convention: ISO calendar strings / UTC-midnight.

import { daysBetweenUTC, isoDayUTC, shiftISO, toUTC, type ISODate } from './date'

export const IMPORTANCE_CADENCE: Readonly<Record<number, number>> = { 3: 14, 2: 30, 1: 90 }

export const PERSON_CATEGORIES = [
  { key: 'friend', label: 'Friend', emoji: '🤝' },
  { key: 'family', label: 'Family', emoji: '🏡' },
  { key: 'mentor', label: 'Mentor', emoji: '🧭' },
  { key: 'colleague', label: 'Colleague', emoji: '💼' },
  { key: 'industry', label: 'Industry', emoji: '🌐' },
  { key: 'other', label: 'Other', emoji: '👤' },
] as const

export type PersonCategoryKey = (typeof PERSON_CATEGORIES)[number]['key']

export function isPersonCategory(c: string): c is PersonCategoryKey {
  return PERSON_CATEGORIES.some((cat) => cat.key === c)
}

export function personCategoryMeta(key: string): { label: string; emoji: string } {
  return PERSON_CATEGORIES.find((cat) => cat.key === key) ?? PERSON_CATEGORIES[PERSON_CATEGORIES.length - 1]
}

export const TOUCH_TYPES = ['meet', 'call', 'text', 'event', 'other'] as const
export type TouchType = (typeof TOUCH_TYPES)[number]

export const TOUCH_TYPE_META: Readonly<Record<TouchType, { label: string; emoji: string }>> = {
  meet: { label: 'Met up', emoji: '☕' },
  call: { label: 'Call', emoji: '📞' },
  text: { label: 'Text', emoji: '💬' },
  event: { label: 'Event', emoji: '🎤' },
  other: { label: 'Other', emoji: '✳️' },
}

export function isTouchType(t: string): t is TouchType {
  return (TOUCH_TYPES as readonly string[]).includes(t)
}

/** Resolved cadence in days: explicit override (clamped ≥1) or importance default. */
export function cadenceFor(importance: number, override?: number | null): number {
  if (override != null && Number.isFinite(override)) return Math.max(1, Math.round(override))
  return IMPORTANCE_CADENCE[importance] ?? IMPORTANCE_CADENCE[2]
}

/** Whole calendar days from `iso` to `today` (same-day = 0; UTC-based, leap-safe). */
export function daysSince(iso: ISODate, today: ISODate): number {
  return daysBetweenUTC(toUTC(iso), toUTC(today))
}

export type ReconnectStatus = 'never' | 'ok' | 'due' | 'overdue'

export interface ReconnectState {
  status: ReconnectStatus
  /** cadence − daysSince(last touch); negative = overdue by that many days; 0 for `never` */
  dueInDays: number
  /** calendar days since the last touch; null when never touched */
  daysSinceLast: number | null
}

export function reconnectState(lastTouchISO: ISODate | null, cadenceDays: number, today: ISODate): ReconnectState {
  if (!lastTouchISO) return { status: 'never', dueInDays: 0, daysSinceLast: null }
  const daysSinceLast = daysSince(lastTouchISO, today)
  const dueInDays = cadenceDays - daysSinceLast
  const status: ReconnectStatus = dueInDays < 0 ? 'overdue' : dueInDays === 0 ? 'due' : 'ok'
  return { status, dueInDays, daysSinceLast }
}

/** Urgency rank for sorting (lower = reach out sooner). */
export function reconnectRank(state: ReconnectState): number {
  switch (state.status) {
    case 'overdue':
      return 0
    case 'never':
      return 1
    case 'due':
      return 2
    case 'ok':
      return 3
  }
}

/**
 * Sort people for the CRM list: overdue (most-overdue first), never, due,
 * then ok (soonest-due first); ties fall back to name. Mutates nothing.
 */
export function sortForReconnect<T extends { name: string; reconnect: ReconnectState }>(rows: readonly T[]): T[] {
  return rows.slice().sort((a, b) => {
    const ra = reconnectRank(a.reconnect)
    const rb = reconnectRank(b.reconnect)
    if (ra !== rb) return ra - rb
    // inside overdue: the most negative dueInDays first; inside ok: smallest dueInDays first
    if (ra === 0) return a.reconnect.dueInDays - b.reconnect.dueInDays
    if (ra === 3) return a.reconnect.dueInDays - b.reconnect.dueInDays
    return a.name.localeCompare(b.name)
  })
}

/** A touchpoint as the pure layer sees it. */
export interface TouchLike {
  date: ISODate
  type: string
}

/** Map raw touch rows into the pure shape (defensive: unknown type → 'other'). */
export function toTouches(rows: readonly { date: Date; type: string }[]): TouchLike[] {
  return rows.map((r) => ({ date: isoDayUTC(r.date), type: isTouchType(r.type) ? r.type : 'other' }))
}

/** Most recent touch date, or null. */
export function lastTouchDate(touches: readonly TouchLike[]): ISODate | null {
  let latest: ISODate | null = null
  for (const t of touches) {
    if (!latest || t.date > latest) latest = t.date
  }
  return latest
}

/** Count of touches within [startISO, endISO] inclusive. */
export function touchesInWindow(touches: readonly TouchLike[], startISO: ISODate, endISO: ISODate): number {
  let n = 0
  for (const t of touches) {
    if (t.date >= startISO && t.date <= endISO) n++
  }
  return n
}

export interface TouchDayCell {
  iso: ISODate
  count: number
}

/** Compact day strip for the UI: `days` calendar days ending at today. */
export function recentTouchStrip(touches: readonly TouchLike[], today: ISODate, days = 14): TouchDayCell[] {
  const byDay = new Map<ISODate, number>()
  for (const t of touches) byDay.set(t.date, (byDay.get(t.date) ?? 0) + 1)
  const out: TouchDayCell[] = []
  for (let i = days - 1; i >= 0; i--) {
    const iso = shiftISO(today, -i)
    out.push({ iso, count: byDay.get(iso) ?? 0 })
  }
  return out
}

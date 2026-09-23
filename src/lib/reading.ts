// Books, Reader & Quotes (Phase 16) — reading math. All pure functions with
// an injectable "today" (ISO calendar date) so callers and tests control
// time — same pattern as lib/principles.ts (Decision #8).
//
// Semantics (golden-rule aligned):
//  - Two progress systems: page-based books (physical/pdf) track
//    currentPage/totalPages; EPUBs (no true pages) track a CFI position plus
//    a percent 0..100. progressPct() returns the right one, or null.
//  - Reading streak: consecutive days with at least one session, walking
//    back from today. Grace rule (same as habits/principles): an un-logged
//    TODAY does not break the streak — the day isn't over. Sessions with 0
//    minutes do not count as reading days.
//  - Pace: pages read over the trailing window / elapsed calendar days in
//    that window (a book started 2 days ago doesn't get diluted by 14). ETA
//    = remaining pages / pace, rounded UP (promising 4.2 days is a lie).
//  - Daily quote: a deterministic rotation so the whole vault cycles over
//    time — same day → same quote, no RNG, no server state. Favorites get
//    their own cycle first.
//  - Dates are the stored convention: ISO calendar strings / UTC-midnight.

import { isoDayUTC, shiftISO, toUTC, addDaysUTC, type ISODate } from './date'

/* ---------- guards & vocab ---------- */

export const BOOK_FORMATS = ['physical', 'epub', 'pdf'] as const
export type BookFormat = (typeof BOOK_FORMATS)[number]

export function isBookFormat(f: string): f is BookFormat {
  return (BOOK_FORMATS as readonly string[]).includes(f)
}

export const BOOK_STATUSES = ['to_read', 'reading', 'finished', 'abandoned'] as const
export type BookStatus = (typeof BOOK_STATUSES)[number]

export function isBookStatus(s: string): s is BookStatus {
  return (BOOK_STATUSES as readonly string[]).includes(s)
}

export const BOOK_STATUS_META: Record<BookStatus, { label: string; emoji: string }> = {
  to_read: { label: 'To read', emoji: '📦' },
  reading: { label: 'Reading', emoji: '📖' },
  finished: { label: 'Finished', emoji: '✅' },
  abandoned: { label: 'Abandoned', emoji: '🚫' },
}

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]

export function isHighlightColor(c: string): c is HighlightColor {
  return (HIGHLIGHT_COLORS as readonly string[]).includes(c)
}

/** Tailwind classes for the highlight pen chips (light+dark friendly). */
export const HIGHLIGHT_COLOR_CLASSES: Record<HighlightColor, string> = {
  yellow: 'bg-yellow-300/70 dark:bg-yellow-300/40',
  green: 'bg-green-300/70 dark:bg-green-300/40',
  blue: 'bg-sky-300/70 dark:bg-sky-300/40',
  pink: 'bg-pink-300/70 dark:bg-pink-300/40',
  purple: 'bg-purple-300/70 dark:bg-purple-300/40',
}

export const BOOK_FORMAT_META: Record<BookFormat, { label: string; emoji: string }> = {
  physical: { label: 'Physical', emoji: '📗' },
  epub: { label: 'EPUB', emoji: '📱' },
  pdf: { label: 'PDF', emoji: '📄' },
}

/** A reading session as the pure layer sees it. */
export interface SessionLike {
  date: ISODate
  minutes: number
  pages: number
}

/** Map raw session rows into the pure shape. */
export function toSessions(rows: readonly { date: Date; minutes: number; pages: number }[]): SessionLike[] {
  return rows.map((r) => ({ date: isoDayUTC(r.date), minutes: r.minutes, pages: r.pages }))
}

/** True when the book tracks progress in pages (vs CFI percent). */
export function isPageBased(format: BookFormat): boolean {
  return format === 'physical' || format === 'pdf'
}

/* ---------- progress ---------- */

/**
 * Page progress 0..100, 2-decimal. null when totalPages ≤ 0 (unknown) —
 * "no page count" is not 0%. currentPage may exceed totalPages (sloppy
 * entry); progress clamps at 100.
 */
export function pageProgressPct(currentPage: number, totalPages: number): number | null {
  if (!Number.isFinite(currentPage) || !Number.isFinite(totalPages) || totalPages <= 0) return null
  const pct = (Math.max(0, currentPage) / totalPages) * 100
  return Math.round(Math.min(100, pct) * 100) / 100
}

/**
 * Unified progress for any book: page-based → pages; epub → stored percent;
 * null when unknowable (epub never opened, no page count).
 */
export function progressPct(
  format: BookFormat,
  opts: { currentPage: number; totalPages: number; percent: number | null },
): number | null {
  if (!isPageBased(format)) {
    if (opts.percent === null || !Number.isFinite(opts.percent)) return null
    return Math.round(Math.max(0, Math.min(100, opts.percent)) * 100) / 100
  }
  return pageProgressPct(opts.currentPage, opts.totalPages)
}

/** Remaining pages for page-based books (never negative), else null. */
export function remainingPages(currentPage: number, totalPages: number): number | null {
  if (!Number.isFinite(totalPages) || totalPages <= 0) return null
  return Math.max(0, totalPages - Math.max(0, currentPage))
}

/* ---------- streak ---------- */

function sessionsByDay(sessions: readonly SessionLike[]): Map<ISODate, number> {
  const map = new Map<ISODate, number>()
  for (const s of sessions) map.set(s.date, (map.get(s.date) ?? 0) + s.minutes)
  return map
}

/**
 * Current reading streak as of `today`: consecutive days with >0 minutes
 * walked back from today. Grace: today with no session yet doesn't break it
 * (the day isn't over) — a past gap does. A 0-minute session doesn't count
 * as a reading day. Bounded at 10 years.
 */
export function readingStreak(sessions: readonly SessionLike[], today: ISODate): number {
  const byDay = sessionsByDay(sessions)
  let streak = 0
  let cursor = today
  if ((byDay.get(today) ?? 0) <= 0) cursor = shiftISO(today, -1)
  for (let i = 0; i < 3660; i++) {
    const minutes = byDay.get(cursor) ?? 0
    if (minutes <= 0) break
    if (cursor <= shiftISO(today, -3660)) break // hard stop, 10 years
    streak++
    cursor = shiftISO(cursor, -1)
  }
  return streak
}

/** Distinct reading days (>0 minutes) in [startISO, endISO] inclusive, future-clamped. */
export function readingDaysInWindow(sessions: readonly SessionLike[], startISO: ISODate, endISO: ISODate, today?: ISODate): number {
  const effectiveEnd = today && endISO > today ? today : endISO
  if (effectiveEnd < startISO) return 0
  const start = toUTC(startISO)
  const end = toUTC(effectiveEnd)
  const byDay = sessionsByDay(sessions)
  let days = 0
  for (let d = new Date(start); d.getTime() <= end.getTime(); d = addDaysUTC(d, 1)) {
    if ((byDay.get(isoDayUTC(d)) ?? 0) > 0) days++
  }
  return days
}

/** Sum of minutes in [startISO, endISO] inclusive, future-clamped. */
export function minutesInWindow(sessions: readonly SessionLike[], startISO: ISODate, endISO: ISODate, today?: ISODate): number {
  const effectiveEnd = today && endISO > today ? today : endISO
  if (effectiveEnd < startISO) return 0
  let total = 0
  for (const s of sessions) {
    if (s.date >= startISO && s.date <= effectiveEnd) total += Math.max(0, s.minutes)
  }
  return total
}

/** Sum of pages in [startISO, endISO] inclusive, future-clamped. */
export function pagesInWindow(sessions: readonly SessionLike[], startISO: ISODate, endISO: ISODate, today?: ISODate): number {
  const effectiveEnd = today && endISO > today ? today : endISO
  if (effectiveEnd < startISO) return 0
  let total = 0
  for (const s of sessions) {
    if (s.date >= startISO && s.date <= effectiveEnd) total += Math.max(0, s.pages)
  }
  return total
}

/** Mean minutes per calendar day over the trailing `days` window (2-decimal). */
export function minutesPerDay(sessions: readonly SessionLike[], today: ISODate, days = 7): number {
  if (days <= 0) return 0
  const start = shiftISO(today, -(days - 1))
  return Math.round((minutesInWindow(sessions, start, today, today) / days) * 100) / 100
}

/* ---------- pace & ETA (page-based books) ---------- */

/**
 * Reading pace in pages/day over the trailing `days` window. The denominator
 * is the calendar days actually elapsed since `startedISO` (a book started
 * yesterday isn't punished by a 14-day window). 2-decimal; null when there
 * are no pages in the window or the book hasn't started.
 */
export function pagesPace(sessions: readonly SessionLike[], today: ISODate, startedISO: ISODate | null, days = 14): number | null {
  const windowStart = shiftISO(today, -(days - 1))
  const effectiveStart = startedISO && startedISO > windowStart ? startedISO : windowStart
  if (effectiveStart > today) return null
  const elapsedDays = Math.round((toUTC(today).getTime() - toUTC(effectiveStart).getTime()) / 86_400_000) + 1
  const pages = pagesInWindow(sessions, effectiveStart, today, today)
  if (pages <= 0 || elapsedDays <= 0) return null
  return Math.round((pages / elapsedDays) * 100) / 100
}

/**
 * Days to finish at the current pace, rounded UP. null when not page-based,
 * page count unknown, already finished, or pace ≤ 0.
 */
export function etaDays(
  format: BookFormat,
  opts: { currentPage: number; totalPages: number; status: BookStatus },
  pace: number | null,
): number | null {
  if (!isPageBased(format)) return null
  if (opts.status === 'finished') return null
  const remaining = remainingPages(opts.currentPage, opts.totalPages)
  if (remaining === null || remaining === 0) return remaining === 0 ? 0 : null
  if (pace === null || !Number.isFinite(pace) || pace <= 0) return null
  return Math.ceil(remaining / pace)
}

/* ---------- tags ---------- */

/** Parse a comma-separated tag string → clean array (trim, dedupe, ≤6 × ≤24 chars). */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(',')) {
    const tag = part.trim().slice(0, 24)
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    out.push(tag)
    if (out.length >= 6) break
  }
  return out
}

/** Serialize tags back to the stored comma-separated form. */
export function serializeTags(tags: readonly string[]): string {
  return parseTags(tags.join(',')).join(', ')
}

/* ---------- daily quote rotation ---------- */

/** FNV-1a 32-bit hash of a string — stable across runs, no deps. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Deterministic index for the day: hash(date) % count. Same day → same
 * quote; every day moves the pick. count ≤ 0 → null.
 */
export function dailyQuoteIndex(count: number, iso: ISODate): number | null {
  if (!Number.isInteger(count) || count <= 0) return null
  return hashString(iso) % count
}

/** A quote as the pure rotation layer sees it (already deterministically sorted). */
export interface QuoteLike {
  id: string
  favorite: boolean
}

/**
 * Deterministic sort for quote rotation: favorites first, then creation
 * order (id as tiebreaker so two fetches can never disagree).
 */
export function sortQuotesForRotation<T extends QuoteLike>(quotes: readonly T[]): T[] {
  return [...quotes].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * Today's quote: rotate through favorites first (their own cycle), falling
 * back to the whole vault when there are no favorites. null for an empty
 * vault. `pick` lets the caller extract from the sorted pool.
 */
export function pickDailyQuote<T extends QuoteLike>(
  quotes: readonly T[],
  iso: ISODate,
): T | null {
  if (quotes.length === 0) return null
  const sorted = sortQuotesForRotation(quotes)
  const pool = sorted.some((q) => q.favorite) ? sorted.filter((q) => q.favorite) : sorted
  const idx = dailyQuoteIndex(pool.length, iso)
  return idx === null ? null : pool[idx]
}

/* ---------- finishing ---------- */

/** Validate a 1..5 rating (null allowed = unrated). */
export function normalizeRating(rating: number | null | undefined): number | null {
  if (rating === null || rating === undefined) return null
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null
  return rating
}

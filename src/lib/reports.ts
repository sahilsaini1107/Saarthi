// Reports engine (Phase F / task 20) — pure math for the per-domain report
// hub and the monthly Life Report. No clock reads, no DB, no formatting of
// user-facing strings beyond labels: callers pass measured inputs, the UI
// renders the shapes produced here. Everything is unit-tested in
// tests/reports.test.ts.
//
// Design (Decision #71):
//  - Reports are READ-ONLY aggregation over existing indexed columns — zero
//    new tables, nothing stored, so a report can never go stale.
//  - Every domain report shares one shape (stats / series / rows / notes) so
//    the UI renders all 13 domains + the Life Report with one component set.
//  - Series auto-bucket: daily bars for windows ≤ 31 days, weekly bars above.

import { addDaysUTC, daysBetweenUTC, daysInMonthUTC, formatDayLabel, isoDayUTC, toUTC } from './date'
import type { ISODate } from './date'

/* ---------------- domain meta ---------------- */

export const REPORT_DOMAINS = [
  { key: 'money', label: 'Money', emoji: '💰', blurb: 'Income, spending, savings rate, net worth' },
  { key: 'fitness', label: 'Fitness', emoji: '🏋️', blurb: 'Sessions, volume, body weight' },
  { key: 'fuel', label: 'Fuel', emoji: '🍽️', blurb: 'Meals, calories, protein' },
  { key: 'study', label: 'Study', emoji: '📚', blurb: 'Sessions, minutes, courses' },
  { key: 'habits', label: 'Habits', emoji: '🔥', blurb: 'Completion rates, streaks' },
  { key: 'goals', label: 'Goals', emoji: '🎯', blurb: 'Progress, milestones, effort' },
  { key: 'journal', label: 'Journal', emoji: '📓', blurb: 'Entries, mood, streaks' },
  { key: 'skin', label: 'Skin', emoji: '🧴', blurb: 'AM/PM adherence' },
  { key: 'reading', label: 'Reading', emoji: '📖', blurb: 'Minutes, pages, books finished' },
  { key: 'skills', label: 'Skills', emoji: '⚡', blurb: 'Practice minutes, XP' },
  { key: 'people', label: 'People', emoji: '🤝', blurb: 'Touchpoints, reconnects' },
  { key: 'content', label: 'Content', emoji: '🎬', blurb: 'Saved vs completed' },
  { key: 'ideas', label: 'Ideas', emoji: '💡', blurb: 'Pipeline, launches' },
] as const

export type ReportDomain = (typeof REPORT_DOMAINS)[number]['key']

export function isReportDomain(s: string): s is ReportDomain {
  return REPORT_DOMAINS.some((d) => d.key === s)
}

export function reportDomainMeta(key: ReportDomain): { label: string; emoji: string; blurb: string } {
  return REPORT_DOMAINS.find((d) => d.key === key) as { label: string; emoji: string; blurb: string }
}

/* ---------------- window math ---------------- */

/** Strict YYYY-MM-DD calendar date (rejects 2026-02-30, 2026-13-01, junk). */
export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (m < 1 || m > 12) return false
  return d >= 1 && d <= daysInMonthUTC(y, m - 1)
}

/** Strict "YYYY-MM". */
export function isValidMonthKey(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

/** Inclusive [from, to] window of month "YYYY-MM". */
export function monthWindow(key: string): { from: ISODate; to: ISODate } {
  const [y, m] = key.split('-').map(Number)
  const last = daysInMonthUTC(y, m - 1)
  const mm = String(m).padStart(2, '0')
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}` }
}

/** Day count of an inclusive window (0 when to < from). */
export function daysInclusive(from: ISODate, to: ISODate): number {
  const n = daysBetweenUTC(toUTC(from), toUTC(to)) + 1
  return n > 0 ? n : 0
}

/** The same-length window immediately before [from, to]. */
export function shiftWindowBack(from: ISODate, to: ISODate): { from: ISODate; to: ISODate } {
  const span = daysInclusive(from, to)
  return { from: shiftISOBy(from, -span), to: shiftISOBy(from, -1) }
}

function shiftISOBy(iso: ISODate, n: number): ISODate {
  return isoDayUTC(addDaysUTC(toUTC(iso), n))
}

/* ---------------- number math ---------------- */

/**
 * Round to 2 decimals, half-away-from-zero at the boundary (matches the
 * money rule). Math.round alone is half-toward-+∞, which wrongs negatives,
 * so the sign is applied outside.
 */
export function round2(n: number): number {
  const scaled = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100
  return n < 0 ? -scaled : scaled
}

/**
 * Percent change vs the previous window. prev ≤ 0 → null (no fair baseline —
 * a 0-minute month says nothing about a 40-minute one).
 */
export function deltaPct(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null
  return round2(((cur - prev) / prev) * 100)
}

/** part/whole as a percent, 2dp; null when there is no whole. */
export function pctPart(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  return round2((part / whole) * 100)
}

/* ---------------- series building ---------------- */

export interface ReportPoint {
  /** "2026-09-03" for day buckets, week-start ISO for week buckets */
  label: ISODate
  value: number
}

export interface ReportSeries {
  label: string
  /** day | week */
  bucket: 'day' | 'week'
  /** display hint for the UI: 'minutes' | 'rupees' | 'count' | 'percent' | 'pages' | 'kcal' | 'kg' */
  unit: string
  points: ReportPoint[]
}

/** Windows up to this many days render as daily bars; longer ones as weekly. */
export const DAY_BUCKET_MAX_DAYS = 31

export function chooseBucket(from: ISODate, to: ISODate): 'day' | 'week' {
  return daysInclusive(from, to) <= DAY_BUCKET_MAX_DAYS ? 'day' : 'week'
}

/**
 * Fill missing days with 0 so bars align day-by-day. `daily` maps ISO day →
 * measured value; days after `todayISO` (if provided) are omitted so a
 * partially-elapsed month doesn't render empty future bars.
 */
export function buildDailySeries(
  daily: ReadonlyMap<ISODate, number>,
  from: ISODate,
  to: ISODate,
  today?: ISODate,
): ReportPoint[] {
  const points: ReportPoint[] = []
  const effectiveTo = today && to > today ? today : to
  const start = toUTC(from)
  const end = toUTC(effectiveTo)
  if (end.getTime() < start.getTime()) return points
  const span = daysBetweenUTC(start, end)
  for (let i = 0; i <= span; i++) {
    const iso = isoDayUTC(addDaysUTC(start, i))
    points.push({ label: iso, value: daily.get(iso) ?? 0 })
  }
  return points
}

/**
 * Group daily values into 7-day chunks anchored at `from` (the last chunk may
 * be short). Chunk label = the chunk's first day. Empty days count as 0.
 */
export function buildWeeklySeries(
  daily: ReadonlyMap<ISODate, number>,
  from: ISODate,
  to: ISODate,
  today?: ISODate,
): ReportPoint[] {
  const effectiveTo = today && to > today ? today : to
  const start = toUTC(from)
  const end = toUTC(effectiveTo)
  if (end.getTime() < start.getTime()) return []
  const span = daysBetweenUTC(start, end)
  const points: ReportPoint[] = []
  for (let i = 0; i <= span; i += 7) {
    const chunkEnd = Math.min(i + 6, span)
    let value = 0
    for (let j = i; j <= chunkEnd; j++) {
      value += daily.get(isoDayUTC(addDaysUTC(start, j))) ?? 0
    }
    points.push({ label: isoDayUTC(addDaysUTC(start, i)), value })
  }
  return points
}

/** Daily or weekly series for a window, zero-filled, future days clipped. */
export function buildSeries(
  daily: ReadonlyMap<ISODate, number>,
  from: ISODate,
  to: ISODate,
  label: string,
  unit: string,
  today?: ISODate,
): ReportSeries {
  const bucket = chooseBucket(from, to)
  const points = bucket === 'day' ? buildDailySeries(daily, from, to, today) : buildWeeklySeries(daily, from, to, today)
  return { label, bucket, unit, points }
}

/** Sum of a series' values (total over the window). */
export function seriesTotal(points: readonly ReportPoint[]): number {
  return points.reduce((s, p) => s + p.value, 0)
}

/** Largest value in a series (0 for empty). */
export function seriesMax(points: readonly ReportPoint[]): number {
  return points.reduce((m, p) => (p.value > m ? p.value : m), 0)
}

/** Bar-chart height percent (0..100) for a value against a max. */
export function barPct(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
}

/* ---------------- label helpers ---------------- */

/** "Wed, 3 Sep" — the stored label is an ISO date in both buckets. */
export function pointLabel(point: ReportPoint): string {
  return formatDayLabel(point.label)
}

/** "vs Feb 1 – Feb 28" style previous-window caption. */
export function prevWindowLabel(from: ISODate, to: ISODate): string {
  return `${from} – ${to}`
}

/** "3 Sep – 20 Sep" compact window caption for headers. */
export function windowLabel(from: ISODate, to: ISODate): string {
  const [, mF, dF] = from.split('-')
  const [, mT, dT] = to.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const miF = Number(mF) - 1
  const miT = Number(mT) - 1
  if (mF === mT) return `${Number(dF)} – ${Number(dT)} ${months[miT]}`
  return `${Number(dF)} ${months[miF]} – ${Number(dT)} ${months[miT]}`
}

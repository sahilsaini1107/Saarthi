// Goal contribution grid math (Phase 9) — pure functions with an injectable
// "today" (ISO calendar date), same pattern as lib/goals.ts / lib/habits.ts.
//
// Rules (Decision #43):
//  - A goal MAY carry a quantified metric: 'money' (₹) or 'count' (unitLabel).
//    Contributions are one row per goal per day (exactly-once, upsert-replace).
//  - Effort window = [first contribution day, targetDate || today], capped at
//    the LAST 400 days. Before the first contribution there is no window —
//    pace math simply doesn't run yet (tracking starts when you start).
//  - Intensity levels 0..4 are target-relative when a target exists:
//    benchmark = target / window days; r = amount / benchmark →
//    0 → empty · 0<r<0.5 → L1 · 0.5≤r<1 → L2 · 1≤r<2 → L3 · r≥2 → L4
//    Without a target the levels fall back to quartiles of nonzero amounts
//    (GitHub's own trick); with <4 nonzero days any contribution shows L2.
//  - Metric-less goals still get a grid from task completions:
//    1 task → L2 · 2 tasks → L3 · ≥3 tasks → L4 (never L1 — no half credit).
//  - Pace bands mirror study pacing (Decision #19): delta = actual% −
//    expected% in pp → ≥+10 ahead · ≤−25 at_risk · ≤−10 behind · else
//    on_track; past the deadline with target unmet is always at_risk.
//  - Streaks count days with amount > 0; an un-done TODAY does not break the
//    current streak (grace rule — the day isn't over, same as habits).

import { daysBetweenUTC, shiftISO, toUTC, type ISODate } from '@/lib/date'
import { formatINR } from '@/lib/money'

export type GoalMetric = 'money' | 'count'
export type PaceBand = 'ahead' | 'on_track' | 'behind' | 'at_risk'

export interface ContributionDayInput {
  iso: ISODate
  amountMilli: number
  tasksDone: number
}

/** Hard cap on rendered grid days (a 1-year goal ≈ 366; extra headroom). */
export const GRID_MAX_DAYS = 400

/* ---------- unit conversions (milli-units, Decision #21 convention) ---------- */

/** ₹ (2-decimal) → milli-rupees. 123.45 → 123450 (exact via +EPS guard). */
export function rupeesToMilli(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0
  return Math.round((rupees + Number.EPSILON) * 1000)
}

/** Count value → milli-units. 12.5 → 12500. */
export function countToMilli(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 1000)
}

/** Money goal: "₹1,23,456.78" (integer paise = milli / 10, exact). */
export function formatMilliMoney(milli: number): string {
  return formatINR(Math.round(milli / 10))
}

/** Count goal: trimmed value string ("12.5", "1") — unit appended by the caller. */
export function formatMilliCount(milli: number): string {
  const v = milli / 1000
  const s = Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) < 1 ? 3 : 2).replace(/\.?0+$/, '')
  return s
}

/** Display string for either metric. */
export function formatMilliAmount(metric: GoalMetric, unitLabel: string | null, milli: number): string {
  return metric === 'money' ? formatMilliMoney(milli) : `${formatMilliCount(milli)}${unitLabel ? ` ${unitLabel}` : ''}`
}

/* ---------- window ---------- */

export interface GridWindow {
  start: ISODate
  end: ISODate
}

/**
 * Display + pace window: from the first contribution day (or today when the
 * goal has none yet) to the later of targetDate/today. Capped at the last
 * `maxDays` days — pass a larger cap for the UNTRUNCATED pace window (stats
 * must never hide history just because the visual grid does, Decision #43).
 */
export function contributionWindow(firstDate: ISODate | null, targetDate: ISODate | null, today: ISODate, maxDays: number = GRID_MAX_DAYS): GridWindow | null {
  const start = firstDate ?? today
  const end = targetDate && targetDate > today ? targetDate : today
  if (start > end) return null
  const span = daysBetweenUTC(toUTC(start), toUTC(end)) + 1
  if (span <= maxDays) return { start, end }
  return { start: shiftISO(end, -(maxDays - 1)), end }
}

/* ---------- benchmark & levels ---------- */

/**
 * Milli per day implied by the target over the window (null without a
 * positive target). Comparisons only — float is fine here.
 */
export function dailyBenchmarkMilli(targetValueMilli: number | null, window: GridWindow): number | null {
  if (!targetValueMilli || targetValueMilli <= 0) return null
  const days = Math.max(1, daysBetweenUTC(toUTC(window.start), toUTC(window.end)) + 1)
  return targetValueMilli / days
}

/** Nearest-rank quartiles of nonzero amounts ([q1, q2, q3]); null under 4 days. */
export function quartilesOfNonzero(days: ContributionDayInput[]): [number, number, number] | null {
  const v = days.map((d) => d.amountMilli).filter((a) => a > 0).sort((a, b) => a - b)
  if (v.length < 4) return null
  const at = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))]
  return [at(0.25), at(0.5), at(0.75)]
}

/** Intensity 0..4 for one day's amount (Decision #43 thresholds). */
export function levelForAmount(amountMilli: number, benchmark: number | null, quartiles: [number, number, number] | null): number {
  if (amountMilli <= 0) return 0
  if (benchmark != null && benchmark > 0) {
    const r = amountMilli / benchmark
    if (r < 0.5) return 1
    if (r < 1) return 2
    if (r < 2) return 3
    return 4
  }
  if (quartiles) {
    const [q1, q2, q3] = quartiles
    if (amountMilli < q1) return 1
    if (amountMilli < q2) return 2
    if (amountMilli < q3) return 3
    return 4
  }
  return 2 // some effort, no yardstick yet
}

/** Task-effort level for metric-less goals: 1→L2, 2→L3, ≥3→L4. */
export function levelForTasks(tasksDone: number): number {
  if (tasksDone <= 0) return 0
  return Math.min(4, tasksDone + 1)
}

/**
 * Levels for the whole grid: metric goals use the target benchmark (quartile
 * fallback), metric-less goals count task completions.
 */
export function gridLevels(
  days: ContributionDayInput[],
  opts: { hasMetric: boolean; benchmark: number | null },
): number[] {
  if (!opts.hasMetric) return days.map((d) => levelForTasks(d.tasksDone))
  const quartiles = opts.benchmark == null ? quartilesOfNonzero(days) : null
  return days.map((d) => levelForAmount(d.amountMilli, opts.benchmark, quartiles))
}

/* ---------- streaks ---------- */

/** Longest run of consecutive active days (metric goals: amount > 0; task goals: any activity). */
export function bestStreak(days: ContributionDayInput[], opts?: { hasMetric?: boolean }): number {
  const hasMetric = opts?.hasMetric ?? true
  const isActive = (d: ContributionDayInput) => (hasMetric ? d.amountMilli > 0 : d.amountMilli > 0 || d.tasksDone > 0)
  let best = 0
  let run = 0
  let prev: ISODate | null = null
  for (const d of [...days].sort((a, b) => a.iso.localeCompare(b.iso))) {
    if (!isActive(d)) {
      run = 0
      prev = d.iso
      continue
    }
    run = prev && daysBetweenUTC(toUTC(prev), toUTC(d.iso)) === 1 ? run + 1 : 1
    if (run > best) best = run
    prev = d.iso
  }
  return best
}

/**
 * Current streak of active days ending today — with the habit grace rule:
 * an un-logged today does not break it (yesterday still anchors the run).
 * Metric goals count money/count days only; task goals count task days.
 */
export function currentStreak(days: ContributionDayInput[], today: ISODate, opts?: { hasMetric?: boolean }): number {
  const hasMetric = opts?.hasMetric ?? true
  const byIso = new Map(days.map((d) => [d.iso, d]))
  const active = (iso: ISODate) => {
    const d = byIso.get(iso)
    if (!d) return false
    return hasMetric ? d.amountMilli > 0 : d.amountMilli > 0 || d.tasksDone > 0
  }
  let cursor = active(today) ? today : shiftISO(today, -1)
  if (!active(cursor)) return 0
  let n = 0
  while (active(cursor)) {
    n += 1
    cursor = shiftISO(cursor, -1)
  }
  return n
}

/* ---------- pace ---------- */

export interface PaceInfo {
  actualPct: number
  expectedPct: number | null
  deltaPp: number | null
  band: PaceBand | null
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * Actual vs expected % of the target, with Decision #19 health bands.
 * Needs target + targetDate; without a deadline only actualPct is known.
 */
export function paceInfo(args: {
  totalMilli: number
  targetValueMilli: number | null
  windowStart: ISODate
  targetDate: ISODate | null
  today: ISODate
}): PaceInfo | null {
  const { totalMilli, targetValueMilli, windowStart, targetDate, today } = args
  if (!targetValueMilli || targetValueMilli <= 0) return null
  const actualPct = round6((totalMilli / targetValueMilli) * 100)
  if (!targetDate) return { actualPct, expectedPct: null, deltaPp: null, band: null }
  const totalWindowDays = daysBetweenUTC(toUTC(windowStart), toUTC(targetDate)) + 1 // inclusive, matches the benchmark
  if (totalWindowDays <= 0) {
    // one-day / past window: the deadline has arrived
    return { actualPct, expectedPct: 100, deltaPp: round6(actualPct - 100), band: actualPct >= 100 ? 'on_track' : 'at_risk' }
  }
  const elapsed = Math.min(totalWindowDays, Math.max(0, daysBetweenUTC(toUTC(windowStart), toUTC(today)) + 1))
  const expectedPct = round6((elapsed / totalWindowDays) * 100)
  const deltaPp = round6(actualPct - expectedPct)
  let band: PaceBand
  if (today > targetDate && totalMilli < targetValueMilli) band = 'at_risk'
  else if (deltaPp >= 10) band = 'ahead'
  else if (deltaPp <= -25) band = 'at_risk'
  else if (deltaPp <= -10) band = 'behind'
  else band = 'on_track'
  return { actualPct, expectedPct, deltaPp, band }
}

/** Milli still needed per remaining day (ceil); everything left when due. */
export function neededPerDayMilli(targetValueMilli: number | null, totalMilli: number, targetDate: ISODate | null, today: ISODate): number | null {
  if (!targetValueMilli || targetValueMilli <= 0) return null
  const remaining = Math.max(0, targetValueMilli - totalMilli)
  if (remaining === 0) return 0
  if (!targetDate) return remaining // no deadline → all of it, any pace
  const daysLeft = Math.max(0, Math.round((toUTC(targetDate).getTime() - toUTC(today).getTime()) / 86_400_000))
  if (daysLeft === 0) return remaining
  return Math.ceil(remaining / daysLeft)
}

/** Projected completion date from observed pace; null without data. */
export function projectedFinish(totalMilli: number, targetValueMilli: number | null, windowStart: ISODate, today: ISODate): ISODate | null {
  if (!targetValueMilli || targetValueMilli <= 0 || totalMilli <= 0) return null
  const elapsedDays = Math.max(1, daysBetweenUTC(toUTC(windowStart), toUTC(today)) + 1)
  const ratePerDay = totalMilli / elapsedDays
  if (ratePerDay <= 0) return null
  const totalDaysNeeded = Math.ceil(targetValueMilli / ratePerDay)
  return shiftISO(windowStart, totalDaysNeeded - 1)
}

/* ---------- grid layout helpers ---------- */

export interface GridCell {
  iso: ISODate
  /** first day of the window, or of a new calendar month → label anchor */
  monthStart: boolean
  future: boolean
}

export interface MonthLabel {
  label: string
  /** how many week-columns this month spans */
  span: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Monday index (0..6) of an ISO date. */
export function weekdayMon(iso: ISODate): number {
  return (toUTC(iso).getUTCDay() + 6) % 7
}

/**
 * Flat cells for the window plus per-month label spans (in week columns).
 * Week columns are Monday-anchored; `pad` leading blanks align row 0.
 */
export function buildGrid(window: GridWindow, today: ISODate): { pad: number; cells: GridCell[]; labels: MonthLabel[] } {
  const cells: GridCell[] = []
  let prevMonth = -1
  const total = daysBetweenUTC(toUTC(window.start), toUTC(window.end)) + 1
  for (let i = 0; i < total; i++) {
    const iso = shiftISO(window.start, i)
    const month = toUTC(iso).getUTCMonth()
    const monthStart = i === 0 || month !== prevMonth
    prevMonth = month
    cells.push({ iso, monthStart, future: iso > today })
  }
  const pad = weekdayMon(window.start)
  // month labels: span in week-columns from the label anchor to the next one
  const labels: MonthLabel[] = []
  const anchors = cells.filter((c) => c.monthStart)
  for (let a = 0; a < anchors.length; a++) {
    const startIdx = cells.indexOf(anchors[a])
    const endIdx = a + 1 < anchors.length ? cells.indexOf(anchors[a + 1]) - 1 : cells.length - 1
    const colStart = Math.floor((pad + startIdx) / 7)
    const colEnd = Math.floor((pad + endIdx) / 7)
    const d = toUTC(anchors[a].iso)
    labels.push({ label: MONTHS[d.getUTCMonth()], span: Math.max(1, colEnd - colStart + 1) })
  }
  return { pad, cells, labels }
}

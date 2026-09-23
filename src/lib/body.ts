// Body-metric math: weight trend, moving average, measurement deltas.
// Pure functions with an injectable "today" — same pattern as lib/habits.ts.
//
// Conventions (Decision #21):
//  - Values are stored as integer milli-units (72.5 kg = 72500; 81.2 cm =
//    81200) so no floats ever touch the DB; formatting happens at the edge.
//  - One measurement per kind per day (DB-unique); a series is therefore
//    strictly increasing in dates with at most one point per day.

import { shiftISO } from './date'

export interface MetricPoint {
  iso: string
  valueMilli: number
}

/** Integer milli-units → "72.5" style string (≤3 decimals, no trailing zeros). */
export function formatMilli(valueMilli: number): string {
  return (valueMilli / 1000)
    .toFixed(3)
    .replace(/\.?0+$/, '')
}

/** Simple moving average with a trailing `window` of calendar points. */
export function movingAverage(points: readonly MetricPoint[], window: number): MetricPoint[] {
  const w = Math.max(1, window)
  const out: MetricPoint[] = []
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    sum += points[i].valueMilli
    if (i >= w) sum -= points[i - w].valueMilli
    const count = Math.min(i + 1, w)
    out.push({ iso: points[i].iso, valueMilli: Math.round(sum / count) })
  }
  return out
}

export interface WeightTrend {
  latest: MetricPoint | null
  /** value change vs the point closest to 7 days before the latest */
  delta7dMilli: number | null
  /** value change vs the point closest to 30 days before the latest */
  delta30dMilli: number | null
  minMilli: number | null
  maxMilli: number | null
  /** 7-point moving average over the whole series (for the chart line) */
  avg7: MetricPoint[]
}

/**
 * Value at (or before) `cutoff` days before the last entry; null when the
 * series doesn't reach back that far. Compares by calendar distance so
 * gaps (missed days) degrade gracefully.
 */
function deltaOver(series: readonly MetricPoint[], days: number): number | null {
  if (series.length === 0) return null
  const last = series[series.length - 1]
  const cutoff = shiftISO(last.iso, -days)
  let best: MetricPoint | null = null
  for (const p of series) {
    if (p.iso <= cutoff) best = p // latest point on/before the cutoff
  }
  if (!best) return null
  return last.valueMilli - best.valueMilli
}

export function weightTrend(series: readonly MetricPoint[]): WeightTrend {
  if (series.length === 0) {
    return { latest: null, delta7dMilli: null, delta30dMilli: null, minMilli: null, maxMilli: null, avg7: [] }
  }
  const values = series.map((p) => p.valueMilli)
  return {
    latest: series[series.length - 1],
    delta7dMilli: deltaOver(series, 7),
    delta30dMilli: deltaOver(series, 30),
    minMilli: Math.min(...values),
    maxMilli: Math.max(...values),
    avg7: movingAverage(series, 7),
  }
}

/* ---------- workouts ---------- */

export interface WorkoutLike {
  date: string
  minutes: number
  type: string
}

export interface WeekStats {
  minutes: number
  count: number
  byType: Record<string, number>
}

/** Totals for workouts within [weekStartISO, weekStartISO + 7) days. */
export function weekWorkoutStats(workouts: readonly WorkoutLike[], weekStartISO: string): WeekStats {
  const endISO = shiftISO(weekStartISO, 7) // exclusive
  const stats: WeekStats = { minutes: 0, count: 0, byType: {} }
  for (const w of workouts) {
    if (w.date < weekStartISO || w.date >= endISO) continue
    stats.minutes += w.minutes
    stats.count += 1
    stats.byType[w.type] = (stats.byType[w.type] ?? 0) + w.minutes
  }
  return stats
}

/* ================= body composition (Phase 22) ================= */
//
// Derived figures and health bands. Pure — no clock, no DB. Everything stays
// in milli-units (Decision #21): 72.5 kg = 72500 g, 19.8 BMI = 19800,
// 178.0 cm = 178000.
//
// Rule throughout: a figure we cannot compute honestly returns null. A band we
// have no defensible reference for returns null too — showing "normal" with no
// basis is worse than showing nothing.

export type Sex = 'male' | 'female' | 'other'

export function isSex(s: string): s is Sex {
  return s === 'male' || s === 'female' || s === 'other'
}

/** Age in whole years from a birth year and the current ISO date. */
export function ageFromBirthYear(birthYear: number | null | undefined, todayISO: string): number | null {
  if (birthYear == null || !Number.isInteger(birthYear)) return null
  const year = Number(todayISO.slice(0, 4))
  if (!Number.isFinite(year)) return null
  const age = year - birthYear
  return age >= 0 && age <= 130 ? age : null
}

/**
 * BMI × 1000 from weight (grams) and height (milli-cm).
 * BMI = kg / m². Null when either input is missing or non-positive.
 */
export function bmiMilli(weightG: number | null, heightMilliCm: number | null): number | null {
  if (!weightG || weightG <= 0 || !heightMilliCm || heightMilliCm <= 0) return null
  const kg = weightG / 1000
  const metres = heightMilliCm / 1000 / 100
  return Math.round((kg / (metres * metres)) * 1000)
}

/**
 * Lean (fat-free) mass in grams from weight and body-fat percent (milli-%).
 * Null when either is missing; a body fat ≥ 100 % is nonsense and also nulls.
 */
export function leanMassG(weightG: number | null, bodyFatMilliPct: number | null): number | null {
  if (!weightG || weightG <= 0 || bodyFatMilliPct == null || bodyFatMilliPct < 0) return null
  const pct = bodyFatMilliPct / 1000
  if (pct >= 100) return null
  return Math.round(weightG * (1 - pct / 100))
}

/** Fat mass in grams — the complement of lean mass. */
export function fatMassG(weightG: number | null, bodyFatMilliPct: number | null): number | null {
  const lean = leanMassG(weightG, bodyFatMilliPct)
  if (lean == null || weightG == null) return null
  return weightG - lean
}

/**
 * Basal metabolic rate, kcal/day (Mifflin-St Jeor — the modern default):
 *   10×kg + 6.25×cm − 5×age + (male ? +5 : −161)
 * Sex 'other' has no published constant, so it returns null rather than
 * silently picking one.
 */
export function mifflinStJeorBMR(
  weightG: number | null,
  heightMilliCm: number | null,
  age: number | null,
  sex: Sex | null,
): number | null {
  if (!weightG || weightG <= 0 || !heightMilliCm || heightMilliCm <= 0) return null
  if (age == null || age < 0) return null
  if (sex !== 'male' && sex !== 'female') return null
  const kg = weightG / 1000
  const cm = heightMilliCm / 1000
  const base = 10 * kg + 6.25 * cm - 5 * age
  return Math.round(base + (sex === 'male' ? 5 : -161))
}

/**
 * Ideal body weight in grams, taken as the midpoint of the healthy BMI range
 * (BMI 22 — documented interpretation; a scale's own "ideal weight" readout
 * uses the manufacturer's formula and is stored separately if logged).
 */
export function idealWeightG(heightMilliCm: number | null): number | null {
  if (!heightMilliCm || heightMilliCm <= 0) return null
  const metres = heightMilliCm / 1000 / 100
  return Math.round(22 * metres * metres * 1000)
}

/**
 * Display rounding for a composition readout. `formatMilli` keeps up to three
 * decimals because a stored measurement deserves that precision, but a panel
 * showing "BMI 19.808" or "ideal weight 69.705 kg" is false precision — the
 * derived figure is only as good as the height it came from.
 *
 * Counts (kcal, years, points) show none; everything else shows one.
 */
export function formatMetricDisplay(valueMilli: number, unit: string): string {
  const whole = unit === 'kcal' || unit === 'yrs' || unit === 'pts'
  const n = valueMilli / 1000
  return whole ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '')
}

/* ---------------- health bands ---------------- */

export type BandLevel = 'low' | 'optimal' | 'healthy' | 'elevated' | 'high'

export interface MetricBand {
  level: BandLevel
  label: string
  tone: 'income' | 'warn' | 'expense' | 'muted'
}

const BAND: Record<BandLevel, Omit<MetricBand, 'label'>> = {
  low: { level: 'low', tone: 'warn' },
  optimal: { level: 'optimal', tone: 'income' },
  healthy: { level: 'healthy', tone: 'income' },
  elevated: { level: 'elevated', tone: 'warn' },
  high: { level: 'high', tone: 'expense' },
}

const band = (level: BandLevel, label: string): MetricBand => ({ ...BAND[level], label })

/** WHO adult BMI bands. Input is milli-BMI. */
export function bmiBand(bmiMilliValue: number | null): MetricBand | null {
  if (bmiMilliValue == null || bmiMilliValue <= 0) return null
  const v = bmiMilliValue / 1000
  if (v < 18.5) return band('low', 'underweight')
  if (v < 25) return band('healthy', 'healthy range')
  if (v < 30) return band('elevated', 'overweight')
  return band('high', 'obese')
}

/**
 * Body-fat bands, ACE reference ranges (milli-%). Sex-specific — 'other' and
 * unknown return null rather than applying a range that doesn't describe you.
 */
export function bodyFatBand(milliPct: number | null, sex: Sex | null): MetricBand | null {
  if (milliPct == null || milliPct < 0) return null
  if (sex !== 'male' && sex !== 'female') return null
  const v = milliPct / 1000
  if (sex === 'male') {
    if (v < 6) return band('low', 'essential fat only')
    if (v < 14) return band('optimal', 'athletic')
    if (v < 18) return band('healthy', 'fitness')
    if (v < 25) return band('elevated', 'average')
    return band('high', 'above healthy')
  }
  if (v < 14) return band('low', 'essential fat only')
  if (v < 21) return band('optimal', 'athletic')
  if (v < 25) return band('healthy', 'fitness')
  if (v < 32) return band('elevated', 'average')
  return band('high', 'above healthy')
}

/** Visceral fat index as bio-impedance scales report it (1–59). */
export function visceralFatBand(milliValue: number | null): MetricBand | null {
  if (milliValue == null || milliValue <= 0) return null
  const v = milliValue / 1000
  if (v < 10) return band('healthy', 'normal')
  if (v < 15) return band('elevated', 'high')
  return band('high', 'very high')
}

/** Total body water as a percentage of body weight. */
export function bodyWaterBand(milliPct: number | null, sex: Sex | null): MetricBand | null {
  if (milliPct == null || milliPct <= 0) return null
  if (sex !== 'male' && sex !== 'female') return null
  const v = milliPct / 1000
  const [lo, hi] = sex === 'male' ? [50, 65] : [45, 60]
  if (v < lo) return band('low', 'below typical')
  if (v <= hi) return band('healthy', 'typical')
  return band('elevated', 'above typical')
}

/**
 * The band for any metric kind, or null when we have no defensible reference.
 * Most kinds legitimately have none — a scale's "body score" is a vendor
 * number, and muscle mass in kg only means something next to your height.
 */
export function metricBand(kind: string, valueMilli: number | null, sex: Sex | null): MetricBand | null {
  switch (kind) {
    case 'bmi':
      return bmiBand(valueMilli)
    case 'body_fat':
      return bodyFatBand(valueMilli, sex)
    case 'visceral_fat':
      return visceralFatBand(valueMilli)
    case 'body_water':
      return bodyWaterBand(valueMilli, sex)
    default:
      return null
  }
}

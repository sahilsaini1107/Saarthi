// Strength-coach math (Phase 13). Pure functions, injectable dates — same
// pattern as lib/habits.ts / lib/body.ts. NOTHING here reads the clock.
//
// Conventions:
//  - Loads are carried as integer GRAMS (10 kg = 10000) per Decision #21
//    (integer milli-units; 1 kg = 1000 g keeps every 2-decimal kg exact).
//  - Reps are integers; timed sets carry durationSeconds instead of reps.
//  - Volume/1RM math returns grams (BigInt-scale Ints are fine in JS doubles
//    up to ~9e15 — a lifter will never hit that).
//  - All kg-facing outputs are rounded half-up to 2 decimals at the edge.

/** Round half-up to 2 decimals (positive domain — weights/protein). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** grams → kg, 2 decimals. */
export function gramsToKg(g: number): number {
  return round2(g / 1000)
}

/** Epley cap: estimated 1RM is only sensible up to ~20 reps. */
export const EPLEY_MAX_REPS = 20

/**
 * Estimated one-rep max (Epley): w × (1 + reps/30), in grams.
 * reps null or ≤ 1 → the weight itself. reps > EPLEY_MAX_REPS is clamped
 * to the cap (light sets otherwise inflate the estimate). Weight null
 * (bodyweight) → 0 (unknown load contributes no 1RM signal).
 */
export function est1RMGrams(weightGrams: number | null, reps: number | null | undefined): number {
  if (!weightGrams || weightGrams <= 0) return 0
  const r = reps ?? 1
  if (r <= 1) return weightGrams
  const clamped = Math.min(r, EPLEY_MAX_REPS)
  return Math.round(weightGrams * (1 + clamped / 30))
}

/**
 * Working-set volume in grams: weight × reps. Bodyweight sets (weight null)
 * and timed sets contribute 0 load volume — their value is tracked through
 * reps/progression, not fabricated numbers (documented interpretation).
 * Warm-ups are excluded by the callers that pass only working sets.
 */
export function setVolumeGrams(weightGrams: number | null, reps: number | null | undefined): number {
  if (!weightGrams || weightGrams <= 0 || !reps || reps <= 0) return 0
  return weightGrams * reps
}

export interface SetLike {
  weightGrams: number | null
  reps: number | null
  durationSeconds?: number | null
  isWarmup?: boolean
  order?: number
  setNumber?: number
}

/** Best working set of an exercise within a session: by est-1RM, tiebreak heavier weight. */
export function topSet<T extends SetLike>(sets: readonly T[]): T | null {
  const working = sets.filter((s) => !s.isWarmup)
  if (working.length === 0) return null
  return working.reduce((best, s) => {
    const sRM = est1RMGrams(s.weightGrams, s.reps)
    const bRM = est1RMGrams(best.weightGrams, best.reps)
    if (sRM !== bRM) return sRM > bRM ? s : best
    return (s.weightGrams ?? 0) > (best.weightGrams ?? 0) ? s : best
  })
}

/** Total load volume of a session's sets, in grams (warm-ups excluded). */
export function sessionVolumeGrams(sets: readonly SetLike[]): number {
  return sets
    .filter((s) => !s.isWarmup)
    .reduce((sum, s) => sum + setVolumeGrams(s.weightGrams, s.reps), 0)
}

/** Timed seconds of a set (plank etc.) — reps-sets carry 0. */
export function setSeconds(s: SetLike): number {
  return s.durationSeconds && s.durationSeconds > 0 ? s.durationSeconds : 0
}

/* ---------------- progression ---------------- */

export type ProgressDirection = 'up' | 'flat' | 'down'

export interface Progression {
  direction: ProgressDirection
  /** top-set est-1RM delta in grams (current − previous) */
  est1RMDeltaG: number
  /** top-set weight delta in grams */
  weightDeltaG: number
  /** top-set reps delta (null when either side is a timed set) */
  repsDelta: number | null
}

/** est-1RM must move by more than 0.5% to count as real progress (noise band). */
const PROGRESSION_BAND = 0.005

/**
 * Compare the same exercise's top sets across two consecutive sessions.
 * up   → est-1RM improves by >0.5%
 * down → est-1RM drops by >0.5%
 * flat → inside the noise band (holding a weight is maintaining, not failing)
 */
export function progressionDelta(current: SetLike | null, previous: SetLike | null): Progression | null {
  if (!current || !previous) return null
  const cRM = est1RMGrams(current.weightGrams, current.reps)
  const pRM = est1RMGrams(previous.weightGrams, previous.reps)
  if (pRM <= 0 || cRM <= 0) return null
  const rel = (cRM - pRM) / pRM
  const direction: ProgressDirection = rel > PROGRESSION_BAND ? 'up' : rel < -PROGRESSION_BAND ? 'down' : 'flat'
  return {
    direction,
    est1RMDeltaG: cRM - pRM,
    weightDeltaG: (current.weightGrams ?? 0) - (previous.weightGrams ?? 0),
    repsDelta: current.reps != null && previous.reps != null ? current.reps - previous.reps : null,
  }
}

/* ---------------- plan rotation ---------------- */

export interface PlanDayLike {
  id: string
  order: number
  label: string
}

/**
 * "What's today's workout?" — the next day in rotation AFTER the day of the
 * most recent session on this plan. Alternating A/B emerges naturally:
 * after A comes B, after B wraps to A. Missed days don't matter — the cycle
 * never skips ahead. No sessions (or a session not tied to this plan's days)
 * → the first day by order (then id, for determinism).
 */
export function nextPlanDay(days: readonly PlanDayLike[], lastSessionPlanDayId: string | null): PlanDayLike {
  if (days.length === 0) throw new Error('plan has no days')
  const sorted = [...days].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  if (!lastSessionPlanDayId) return sorted[0]
  const lastIdx = sorted.findIndex((d) => d.id === lastSessionPlanDayId)
  if (lastIdx === -1) return sorted[0]
  return sorted[(lastIdx + 1) % sorted.length]
}

/* ---------------- bulk-pace trend ---------------- */

export interface WeightPoint {
  iso: string
  /** grams (kg × 1000) — BodyMetric.valueMilli is already g for weight */
  g: number
}

export type PaceVerdict = 'on_track' | 'slow' | 'fast' | 'insufficient'

export interface BulkPace {
  /** kg/week over the observed span, 2 decimals — null when < 2 points or < 7 days apart */
  kgPerWeek: number | null
  verdict: PaceVerdict
  spanDays: number
}

/**
 * Weight trend as pace (kg/week) from the first → last weigh-in of a series.
 * Verdict vs the user's signed weight-change target: on-track inside ±50%
 * of target. Positive targets mean gain, negative targets mean loss, and zero
 * means maintain within ±125 g/week. Needs ≥ 2 points and ≥ 7 days of span.
 */
export function bulkPace(points: readonly WeightPoint[], weeklyTargetG: number): BulkPace {
  if (points.length < 2) return { kgPerWeek: null, verdict: 'insufficient', spanDays: 0 }
  const sorted = [...points].sort((a, b) => a.iso.localeCompare(b.iso))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const spanDays = Math.round((Date.parse(`${last.iso}T00:00:00Z`) - Date.parse(`${first.iso}T00:00:00Z`)) / 86_400_000)
  if (spanDays < 7) return { kgPerWeek: null, verdict: 'insufficient', spanDays }
  const kgPerWeek = round2(((last.g - first.g) / 1000 / spanDays) * 7)
  const weeklyG = kgPerWeek * 1000
  let verdict: PaceVerdict
  if (weeklyTargetG === 0) {
    verdict = Math.abs(weeklyG) <= 125 ? 'on_track' : 'fast'
  } else if (weeklyTargetG > 0) {
    verdict = weeklyG < weeklyTargetG / 2 ? 'slow' : weeklyG > weeklyTargetG * 1.5 ? 'fast' : 'on_track'
  } else {
    // Example: a -400 g/week target is on-track from -200 to -600.
    verdict = weeklyG > weeklyTargetG / 2 ? 'slow' : weeklyG < weeklyTargetG * 1.5 ? 'fast' : 'on_track'
  }
  return { kgPerWeek, verdict, spanDays }
}

/* ---------------- nutrition ---------------- */

/**
 * Suggested starting targets from body weight (coach defaults, Decision #51):
 * protein 1.8 g/kg, calories 40 kcal/kg (a moderately active young adult
 * lean-bulking — 62.8 kg → 113 g protein, ~2512 kcal). Always editable;
 * not a medical prescription.
 */
export function suggestNutrition(weightKg: number, proteinPerKg = 1.8, kcalPerKg = 40): { proteinTargetG: number; calorieTarget: number } {
  const w = Math.max(0, weightKg)
  return {
    proteinTargetG: Math.round(w * proteinPerKg),
    calorieTarget: Math.round(w * kcalPerKg),
  }
}

export interface NutritionDayLike {
  iso: string
  proteinG: number | null
  caloriesKcal: number | null
}

export interface ProteinAdherence {
  /** days with a logged protein ≥ target */
  hitDays: number
  /** days with any protein logged */
  loggedDays: number
  /** mean protein across LOGGED days only, 2 decimals */
  avgG: number
  /** hitDays / loggedDays, 0..1 (null when nothing logged) */
  hitRate: number | null
}

/** Protein adherence over a window of days (logged days only average). */
export function proteinAdherence(days: readonly NutritionDayLike[], targetG: number): ProteinAdherence {
  const logged = days.filter((d) => d.proteinG != null && d.proteinG > 0)
  const hitDays = logged.filter((d) => (d.proteinG ?? 0) >= targetG).length
  const total = logged.reduce((s, d) => s + (d.proteinG ?? 0), 0)
  return {
    hitDays,
    loggedDays: logged.length,
    avgG: logged.length > 0 ? round2(total / logged.length) : 0,
    hitRate: logged.length > 0 ? round2(hitDays / logged.length) : null,
  }
}

/* ---------------- weekly training stats ---------------- */

export interface SessionLike {
  date: string // ISO
  durationMin: number
}

/** Sessions in the trailing `days` window [today − days + 1 … today]. */
export function sessionsInWindow(sessions: readonly SessionLike[], today: string, days = 7): SessionLike[] {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10)
  return sessions.filter((s) => s.date >= from && s.date <= today)
}

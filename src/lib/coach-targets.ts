// Coach target tables (Phase 22). Deterministic lookups by body weight — the
// same bracketed tables a coach hands a client, encoded so the app can suggest
// a starting point without an AI call and without hiding its reasoning.
//
// Pure: no clock, no DB, no network. Everything is a documented band, and the
// UI always shows which bracket produced the number so the user can disagree.
//
// These are STARTING POINTS for a healthy adult, not medical advice. Real
// targets move with training age, activity, sleep and bloodwork.

export interface WeightBracket {
  /** inclusive lower bound, kg */
  minKg: number
  /** exclusive upper bound, kg */
  maxKg: number
  value: number
}

/**
 * Daily calorie budget for fat loss, by body weight.
 * Roughly 22 kcal/kg at the top of the table easing to 26 kcal/kg at the
 * bottom — a moderate deficit that scales with body size.
 */
export const FAT_LOSS_CALORIE_TABLE: readonly WeightBracket[] = [
  { minKg: 50, maxKg: 55, value: 1300 },
  { minKg: 55, maxKg: 60, value: 1400 },
  { minKg: 60, maxKg: 65, value: 1500 },
  { minKg: 65, maxKg: 70, value: 1600 },
  { minKg: 70, maxKg: 75, value: 1700 },
  { minKg: 75, maxKg: 80, value: 1800 },
  { minKg: 80, maxKg: 85, value: 1900 },
  { minKg: 85, maxKg: 90, value: 2000 },
  { minKg: 90, maxKg: 95, value: 2100 },
  { minKg: 95, maxKg: 100, value: 2200 },
]

/**
 * Daily protein goal while strength training, by body weight.
 * Tracks ~1.8 g/kg across the table — the well-supported range for building
 * muscle is 1.6–2.2 g/kg.
 */
export const STRENGTH_PROTEIN_TABLE: readonly WeightBracket[] = [
  { minKg: 50, maxKg: 55, value: 90 },
  { minKg: 55, maxKg: 60, value: 100 },
  { minKg: 60, maxKg: 65, value: 110 },
  { minKg: 65, maxKg: 70, value: 120 },
  { minKg: 70, maxKg: 75, value: 130 },
  { minKg: 75, maxKg: 80, value: 140 },
  { minKg: 80, maxKg: 85, value: 150 },
  { minKg: 85, maxKg: 90, value: 160 },
  { minKg: 90, maxKg: 95, value: 170 },
  { minKg: 95, maxKg: 100, value: 180 },
]

export interface BracketHit {
  value: number
  /** "70–75 kg" — shown next to the number so the source is never a mystery */
  bracketLabel: string
  /** true when the weight fell outside the table and the nearest row was used */
  extrapolated: boolean
}

/**
 * Look a weight up in a bracket table. Weights below the first row or above
 * the last clamp to the nearest bracket and are flagged `extrapolated`, so the
 * UI can say the table doesn't really cover them rather than pretending.
 */
export function lookupBracket(table: readonly WeightBracket[], weightKg: number): BracketHit | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || table.length === 0) return null
  const first = table[0]
  const last = table[table.length - 1]
  const label = (b: WeightBracket) => `${b.minKg}–${b.maxKg} kg`

  if (weightKg < first.minKg) return { value: first.value, bracketLabel: label(first), extrapolated: true }
  if (weightKg >= last.maxKg) return { value: last.value, bracketLabel: label(last), extrapolated: true }

  const hit = table.find((b) => weightKg >= b.minKg && weightKg < b.maxKg)
  return hit ? { value: hit.value, bracketLabel: label(hit), extrapolated: false } : null
}

/** Daily calories for fat loss at this body weight. */
export function fatLossCalories(weightKg: number): BracketHit | null {
  return lookupBracket(FAT_LOSS_CALORIE_TABLE, weightKg)
}

/** Daily protein while strength training at this body weight. */
export function strengthProtein(weightKg: number): BracketHit | null {
  return lookupBracket(STRENGTH_PROTEIN_TABLE, weightKg)
}

/* ---------------- goal-aware suggestion ---------------- */

export type BodyGoal = 'fat_loss' | 'maintain' | 'lean_bulk'

export const BODY_GOALS: readonly { key: BodyGoal; label: string; emoji: string; hint: string }[] = [
  { key: 'fat_loss', label: 'Lose fat', emoji: '📉', hint: 'Moderate deficit, protein held high' },
  { key: 'maintain', label: 'Maintain', emoji: '⚖️', hint: 'Hold weight, keep training' },
  { key: 'lean_bulk', label: 'Lean bulk', emoji: '📈', hint: 'Small surplus, ~0.25 kg/week' },
]

export function isBodyGoal(s: string): s is BodyGoal {
  return BODY_GOALS.some((g) => g.key === s)
}

export interface CoachSuggestion {
  calorieTarget: number
  proteinTargetG: number
  /** g/week of body weight to expect — negative for fat loss, 0 to maintain */
  weeklyChangeG: number
  /** plain-English account of exactly how these numbers were produced */
  rationale: string
  bracketLabel: string
  extrapolated: boolean
}

/**
 * Starting calorie and protein targets for a body weight and a goal.
 *
 * Fat loss reads the bracket table directly. Maintenance adds ~15 % back onto
 * the deficit figure, and a lean bulk adds ~30 % — both documented
 * interpretations of the same table, so all three goals stay consistent with
 * each other instead of coming from three unrelated formulas.
 *
 * Protein is the strength-training figure in every case: it is held high while
 * cutting precisely because that is when muscle is at risk.
 */
export function suggestTargets(weightKg: number, goal: BodyGoal): CoachSuggestion | null {
  const kcal = fatLossCalories(weightKg)
  const protein = strengthProtein(weightKg)
  if (!kcal || !protein) return null

  // Integer percent, not a float multiplier: 1700 × 1.15 is 1954.9999999999998
  // in binary floating point, which rounds DOWN to 1950 instead of up to 1960.
  const percent = goal === 'fat_loss' ? 100 : goal === 'maintain' ? 115 : 130
  const weeklyChangeG = goal === 'fat_loss' ? -400 : goal === 'maintain' ? 0 : 250
  // round to the nearest 10 kcal — false precision helps nobody
  const calorieTarget = Math.round((kcal.value * percent) / 1000) * 10

  const rationale =
    goal === 'fat_loss'
      ? `${kcal.bracketLabel} bracket → ${kcal.value} kcal for fat loss, protein held at ${protein.value} g to protect muscle.`
      : goal === 'maintain'
        ? `${kcal.bracketLabel} bracket → ${kcal.value} kcal fat-loss budget, +15 % to hold weight.`
        : `${kcal.bracketLabel} bracket → ${kcal.value} kcal fat-loss budget, +30 % for a lean bulk of about 0.25 kg/week.`

  return {
    calorieTarget,
    proteinTargetG: protein.value,
    weeklyChangeG,
    rationale,
    bracketLabel: kcal.bracketLabel,
    extrapolated: kcal.extrapolated || protein.extrapolated,
  }
}

// Meal-level food logging (Phase 19). Pure helpers — sums, the combined day
// total, per-meal breakdowns and the macro split. No clock, no DB.
//
// Semantics (Decision #70, documented in PROGRESS.md):
//  - Meal entries are granular rows ("Paneer bhurji · 100 g") living BESIDE
//    the manual NutritionDay row that the quick-add chips feed.
//  - The combined day total = meal sums + manual quick-adds, with each source
//    labeled in the UI so nothing is silently double-counted.
//  - Entries are delete-only (no edit): on mobile, delete + re-add is faster
//    than an edit sheet, and there is no in-place-total drift to manage.

export const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { key: 'lunch', label: 'Lunch', emoji: '☀️' },
  { key: 'dinner', label: 'Dinner', emoji: '🌙' },
  { key: 'snack', label: 'Snack', emoji: '🍿' },
] as const

export type MealType = (typeof MEAL_TYPES)[number]['key']

export function isMealType(s: string): s is MealType {
  return MEAL_TYPES.some((m) => m.key === s)
}

export function mealTypeMeta(key: string): { label: string; emoji: string } {
  return MEAL_TYPES.find((m) => m.key === key) ?? MEAL_TYPES[MEAL_TYPES.length - 1]
}

export interface MealEntryLike {
  mealType: string
  caloriesKcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
}

export interface MacroTotals {
  caloriesKcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

/** Sum entries into int totals (nulls count as 0; negative inputs ignored). */
export function sumMealEntries(entries: readonly MealEntryLike[]): MacroTotals {
  const out: MacroTotals = { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  for (const e of entries) {
    out.caloriesKcal += e.caloriesKcal != null && e.caloriesKcal > 0 ? e.caloriesKcal : 0
    out.proteinG += e.proteinG != null && e.proteinG > 0 ? e.proteinG : 0
    out.carbsG += e.carbsG != null && e.carbsG > 0 ? e.carbsG : 0
    out.fatG += e.fatG != null && e.fatG > 0 ? e.fatG : 0
  }
  return out
}

export interface ManualDayLike {
  caloriesKcal: number | null
  proteinG: number | null
}

/** Combined day total = meal sums + the manual quick-add row (2-dec safe ints). */
export function combinedDayTotals(manual: ManualDayLike | null, meals: MacroTotals): { caloriesKcal: number; proteinG: number } {
  return {
    caloriesKcal: (manual?.caloriesKcal ?? 0) + meals.caloriesKcal,
    proteinG: (manual?.proteinG ?? 0) + meals.proteinG,
  }
}

export interface MealTypeTotal {
  mealType: MealType
  caloriesKcal: number
  proteinG: number
  entryCount: number
}

/** Per-meal-type sums in breakfast → lunch → dinner → snack order, non-empty only. */
export function mealTypeBreakdown(entries: readonly MealEntryLike[]): MealTypeTotal[] {
  const order = MEAL_TYPES.map((m) => m.key)
  const byType = new Map<MealType, { kcal: number; protein: number; count: number }>()
  for (const e of entries) {
    const t = (isMealType(e.mealType) ? e.mealType : 'snack') as MealType
    const cur = byType.get(t) ?? { kcal: 0, protein: 0, count: 0 }
    cur.kcal += e.caloriesKcal != null && e.caloriesKcal > 0 ? e.caloriesKcal : 0
    cur.protein += e.proteinG != null && e.proteinG > 0 ? e.proteinG : 0
    cur.count += 1
    byType.set(t, cur)
  }
  return order
    .filter((t) => byType.has(t))
    .map((t) => {
      const v = byType.get(t)!
      return { mealType: t, caloriesKcal: v.kcal, proteinG: v.protein, entryCount: v.count }
    })
}

/* ---------------- daily merge (meals + manual quick-adds) ---------------- */

export interface ManualDaySumLike {
  iso: string
  proteinG: number | null
  caloriesKcal: number | null
}

export interface MealDaySumLike {
  iso: string
  proteinG: number
  caloriesKcal: number
}

/**
 * One calendar day of nutrition, with both sources kept visible.
 *
 * `proteinG` / `caloriesKcal` are the COMBINED truth (Decision #70) — every
 * consumer that ranks, averages or charts a day reads these. The `manual*`
 * fields carry the NutritionDay row on its own, which the quick-add handlers
 * must use as their base: adding a chip to the combined total would fold the
 * meal log into the manual row and double-count it from then on.
 */
export interface DailyNutritionRow {
  iso: string
  proteinG: number | null
  caloriesKcal: number | null
  manualProteinG: number | null
  manualCaloriesKcal: number | null
  mealProteinG: number
  mealCaloriesKcal: number
}

/**
 * Union-merge the manual NutritionDay rows with per-day meal sums, sorted by
 * date. A combined field is null only when NEITHER source carried a value for
 * that day — "not logged" never collapses into a 0 that would drag an average
 * down (same rule as proteinAdherence, which counts logged days only).
 */
export function mergeDailyNutrition(
  manual: readonly ManualDaySumLike[],
  mealSums: readonly MealDaySumLike[],
): DailyNutritionRow[] {
  const rows = new Map<string, DailyNutritionRow>()
  const blank = (iso: string): DailyNutritionRow => ({
    iso,
    proteinG: null,
    caloriesKcal: null,
    manualProteinG: null,
    manualCaloriesKcal: null,
    mealProteinG: 0,
    mealCaloriesKcal: 0,
  })

  for (const m of manual) {
    const row = rows.get(m.iso) ?? blank(m.iso)
    row.manualProteinG = m.proteinG
    row.manualCaloriesKcal = m.caloriesKcal
    rows.set(m.iso, row)
  }
  for (const m of mealSums) {
    const row = rows.get(m.iso) ?? blank(m.iso)
    row.mealProteinG = m.proteinG > 0 ? m.proteinG : 0
    row.mealCaloriesKcal = m.caloriesKcal > 0 ? m.caloriesKcal : 0
    rows.set(m.iso, row)
  }
  for (const row of rows.values()) {
    row.proteinG =
      row.manualProteinG == null && row.mealProteinG === 0 ? null : (row.manualProteinG ?? 0) + row.mealProteinG
    row.caloriesKcal =
      row.manualCaloriesKcal == null && row.mealCaloriesKcal === 0
        ? null
        : (row.manualCaloriesKcal ?? 0) + row.mealCaloriesKcal
  }
  return [...rows.values()].sort((a, b) => a.iso.localeCompare(b.iso))
}

export interface MacroSplit {
  proteinPct: number | null
  carbsPct: number | null
  fatPct: number | null
}

/**
 * Macro energy split using 4/4/9 kcal-per-gram, 2-decimal. Null when no
 * calories can be derived (all macros 0/absent) — "no data" is never 0%.
 */
export function macroSplit(totals: { proteinG: number; carbsG: number; fatG: number }): MacroSplit {
  const pKcal = Math.max(0, totals.proteinG) * 4
  const cKcal = Math.max(0, totals.carbsG) * 4
  const fKcal = Math.max(0, totals.fatG) * 9
  const total = pKcal + cKcal + fKcal
  if (total <= 0) return { proteinPct: null, carbsPct: null, fatPct: null }
  const pct = (x: number) => Math.round((x / total) * 100 * 100) / 100
  return { proteinPct: pct(pKcal), carbsPct: pct(cKcal), fatPct: pct(fKcal) }
}

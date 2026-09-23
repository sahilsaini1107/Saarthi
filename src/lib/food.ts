// Food library & thali math (Phase 21). Pure functions — nothing here reads
// the clock or the DB, same contract as lib/fitness.ts and lib/body.ts.
//
// Conventions (Decision #21, milli-units):
//  - A FoodItem describes its macros for `basisQty` of `unit` — by default
//    per 100 g. Values are integer MILLI-grams / milli-kcal, so "100 g chana
//    = 20.5 g protein" is exact and a half portion stays exact.
//  - A quantity is milli-units of the food's own unit: 50 g = 50_000,
//    2 pieces = 2_000, 250 ml = 250_000.
//  - Scaling factor = quantityMilli / (basisQty × 1000). Everything rounds
//    half-up once, at the end of each scale — never twice.
//  - The grams the rest of the app stores (MealEntry.proteinG, Int) are
//    produced only at the save boundary via toWholeGrams().

export const FOOD_UNITS = [
  { key: 'g', label: 'grams', short: 'g', defaultBasis: 100 },
  { key: 'ml', label: 'millilitres', short: 'ml', defaultBasis: 100 },
  { key: 'piece', label: 'pieces', short: 'pc', defaultBasis: 1 },
] as const

export type FoodUnit = (typeof FOOD_UNITS)[number]['key']

export function isFoodUnit(s: string): s is FoodUnit {
  return FOOD_UNITS.some((u) => u.key === s)
}

export function foodUnitMeta(key: string): (typeof FOOD_UNITS)[number] {
  return FOOD_UNITS.find((u) => u.key === key) ?? FOOD_UNITS[0]
}

export const FOOD_CATEGORIES = [
  { key: 'dal', label: 'Dal & legumes', emoji: '🫘' },
  { key: 'dairy', label: 'Dairy', emoji: '🥛' },
  { key: 'soy', label: 'Soy', emoji: '🌱' },
  { key: 'grain', label: 'Grains', emoji: '🌾' },
  { key: 'veg', label: 'Vegetables', emoji: '🥦' },
  { key: 'fruit', label: 'Fruit', emoji: '🍎' },
  { key: 'nut_seed', label: 'Nuts & seeds', emoji: '🥜' },
  { key: 'supplement', label: 'Supplements', emoji: '💊' },
  { key: 'egg', label: 'Egg', emoji: '🥚' },
  { key: 'meat', label: 'Meat & fish', emoji: '🍗' },
  { key: 'other', label: 'Other', emoji: '🍽️' },
] as const

export type FoodCategory = (typeof FOOD_CATEGORIES)[number]['key']

export function isFoodCategory(s: string): s is FoodCategory {
  return FOOD_CATEGORIES.some((c) => c.key === s)
}

export function foodCategoryMeta(key: string): { label: string; emoji: string } {
  return FOOD_CATEGORIES.find((c) => c.key === key) ?? FOOD_CATEGORIES[FOOD_CATEGORIES.length - 1]
}

/** Protein-source tiers, best first. S is "build the diet on these". */
export const PROTEIN_TIERS = ['S', 'A', 'B', 'C'] as const
export type ProteinTier = (typeof PROTEIN_TIERS)[number]

export function isProteinTier(s: string): s is ProteinTier {
  return (PROTEIN_TIERS as readonly string[]).includes(s)
}

/* ---------------- macro totals ---------------- */

/** Every macro figure in integer milli-units (milli-kcal / milli-grams). */
export interface MacroMilli {
  caloriesMilliKcal: number
  proteinMilliG: number
  carbsMilliG: number
  fatMilliG: number
  fiberMilliG: number
}

export const ZERO_MACROS: MacroMilli = {
  caloriesMilliKcal: 0,
  proteinMilliG: 0,
  carbsMilliG: 0,
  fatMilliG: 0,
  fiberMilliG: 0,
}

/** The shape lib/food.ts needs from a food row — DTO and Prisma row both fit. */
export interface FoodLike {
  unit: string
  /** the quantity the macros describe: 100 for per-100 g, 1 for per-piece */
  basisQty: number
  caloriesMilliKcal: number
  proteinMilliG: number
  carbsMilliG: number
  fatMilliG: number
  fiberMilliG?: number | null
}

/** Round half-up, integer domain (all inputs are non-negative milli-units). */
function roundHalfUp(n: number): number {
  return Math.round(n + Number.EPSILON)
}

/**
 * How much of a food's basis one quantity represents.
 * 50 g of a per-100 g food → 0.5. 2 pieces of a per-piece food → 2.
 * A non-positive basis is meaningless, so it yields 0 rather than Infinity.
 */
export function scaleFactor(food: Pick<FoodLike, 'basisQty'>, quantityMilli: number): number {
  const basisMilli = food.basisQty * 1000
  if (!(basisMilli > 0) || !Number.isFinite(quantityMilli) || quantityMilli <= 0) return 0
  return quantityMilli / basisMilli
}

/** A food scaled to an actual portion. Negative or zero quantity → all zeros. */
export function scaleFood(food: FoodLike, quantityMilli: number): MacroMilli {
  const f = scaleFactor(food, quantityMilli)
  if (f === 0) return { ...ZERO_MACROS }
  return {
    caloriesMilliKcal: roundHalfUp(food.caloriesMilliKcal * f),
    proteinMilliG: roundHalfUp(food.proteinMilliG * f),
    carbsMilliG: roundHalfUp(food.carbsMilliG * f),
    fatMilliG: roundHalfUp(food.fatMilliG * f),
    fiberMilliG: roundHalfUp((food.fiberMilliG ?? 0) * f),
  }
}

/** Add up any number of scaled portions. */
export function sumMacros(parts: readonly MacroMilli[]): MacroMilli {
  const out: MacroMilli = { ...ZERO_MACROS }
  for (const p of parts) {
    out.caloriesMilliKcal += p.caloriesMilliKcal
    out.proteinMilliG += p.proteinMilliG
    out.carbsMilliG += p.carbsMilliG
    out.fatMilliG += p.fatMilliG
    out.fiberMilliG += p.fiberMilliG
  }
  return out
}

/** Divide a total across servings (≥1). Used for per-plate figures. */
export function perServing(total: MacroMilli, servings: number): MacroMilli {
  const n = Number.isFinite(servings) && servings >= 1 ? Math.floor(servings) : 1
  if (n === 1) return { ...total }
  return {
    caloriesMilliKcal: roundHalfUp(total.caloriesMilliKcal / n),
    proteinMilliG: roundHalfUp(total.proteinMilliG / n),
    carbsMilliG: roundHalfUp(total.carbsMilliG / n),
    fatMilliG: roundHalfUp(total.fatMilliG / n),
    fiberMilliG: roundHalfUp(total.fiberMilliG / n),
  }
}

/* ---------------- composing a plate ---------------- */

export interface CompositionInput<T extends FoodLike = FoodLike> {
  food: T
  quantityMilli: number
}

export interface CompositionPart<T extends FoodLike = FoodLike> {
  food: T
  quantityMilli: number
  macros: MacroMilli
  /** this part's share of the plate's calories, 0–100 (null when the plate has no calories) */
  caloriePct: number | null
}

export interface Composition<T extends FoodLike = FoodLike> {
  parts: CompositionPart<T>[]
  total: MacroMilli
  perServing: MacroMilli
  servings: number
}

/**
 * The thali calculation: scale every ingredient, sum them, and report each
 * one's share of the plate. `servings` splits the total for the per-plate
 * figures — the total itself is always what was actually cooked.
 */
export function composePlate<T extends FoodLike>(
  items: readonly CompositionInput<T>[],
  servings = 1,
): Composition<T> {
  const parts = items.map((i) => ({
    food: i.food,
    quantityMilli: i.quantityMilli,
    macros: scaleFood(i.food, i.quantityMilli),
    caloriePct: null as number | null,
  }))
  const total = sumMacros(parts.map((p) => p.macros))
  for (const p of parts) {
    p.caloriePct =
      total.caloriesMilliKcal > 0
        ? Math.round((p.macros.caloriesMilliKcal / total.caloriesMilliKcal) * 100 * 10) / 10
        : null
  }
  const n = Number.isFinite(servings) && servings >= 1 ? Math.floor(servings) : 1
  return { parts, total, perServing: perServing(total, n), servings: n }
}

/* ---------------- formatting & boundaries ---------------- */

/**
 * Milli-units → whole grams/kcal for the Int columns the rest of the app uses
 * (MealEntry.proteinG and friends). Rounds half-up; sub-gram precision is
 * deliberately dropped only here, at the save boundary.
 */
export function toWholeGrams(macros: MacroMilli): {
  caloriesKcal: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number
} {
  return {
    caloriesKcal: roundHalfUp(macros.caloriesMilliKcal / 1000),
    proteinG: roundHalfUp(macros.proteinMilliG / 1000),
    carbsG: roundHalfUp(macros.carbsMilliG / 1000),
    fatG: roundHalfUp(macros.fatMilliG / 1000),
    fiberG: roundHalfUp(macros.fiberMilliG / 1000),
  }
}

/** Integer milli-units → "20.5" (≤2 decimals, no trailing zeros). */
export function formatMilli(valueMilli: number): string {
  const s = (valueMilli / 1000).toFixed(2)
  return s.replace(/\.?0+$/, '') || '0'
}

/** "50 g" / "2 pc" — a quantity in the food's own unit. */
export function formatQuantity(quantityMilli: number, unit: string): string {
  return `${formatMilli(quantityMilli)} ${foodUnitMeta(unit).short}`
}

/**
 * Parse a typed quantity ("50", "1.5") into milli-units. Returns null for
 * anything that isn't a positive finite number, so callers can refuse to save.
 */
export function parseQuantityMilli(input: string): number | null {
  const n = Number(input.trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 1000)
}

/**
 * Sanity check on a food definition: the macros must not claim far more energy
 * than 4/4/9 can explain. Returns a warning string, or null when it checks out.
 * Advisory only — labels round, and alcohol/polyols genuinely break 4/4/9.
 */
export function energyMismatch(food: FoodLike): string | null {
  const fromMacros = (food.proteinMilliG * 4 + food.carbsMilliG * 4 + food.fatMilliG * 9) / 1000
  const stated = food.caloriesMilliKcal / 1000
  if (stated <= 0 && fromMacros <= 0) return null
  if (stated <= 0) return `Macros suggest about ${Math.round(fromMacros)} kcal — calories are set to 0.`
  const drift = Math.abs(fromMacros - stated) / stated
  if (drift <= 0.25) return null
  return `Macros work out to about ${Math.round(fromMacros)} kcal, but ${Math.round(stated)} kcal is set — worth a re-check.`
}

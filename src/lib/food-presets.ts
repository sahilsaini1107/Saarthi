// Starter food library (Phase 21). Seeded as ordinary user rows — every entry
// is editable and deletable once added, and the library is meant to grow with
// whatever the user actually eats.
//
// Tiers follow the coach's protein-source chart (S = build the diet on these,
// A = excellent supporting sources). Values are TYPICAL published figures per
// 100 g / 100 ml / piece and will differ by brand, cut and how something is
// cooked — the UI always says to check the label and lets you correct any row.
//
// Stored as integer milli-units (Decision #21): 20.5 g protein = 20_500.

import type { FoodCategory, FoodUnit, ProteinTier } from './food'

export interface FoodPreset {
  name: string
  unit: FoodUnit
  basisQty: number
  caloriesMilliKcal: number
  proteinMilliG: number
  carbsMilliG: number
  fatMilliG: number
  fiberMilliG: number
  category: FoodCategory
  isVeg: boolean
  tier?: ProteinTier
  note?: string
}

/** Grams-per-100 g helper so the table below reads like a nutrition label. */
function per100(
  name: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
  category: FoodCategory,
  isVeg: boolean,
  tier?: ProteinTier,
  note?: string,
): FoodPreset {
  return {
    name,
    unit: 'g',
    basisQty: 100,
    caloriesMilliKcal: Math.round(kcal * 1000),
    proteinMilliG: Math.round(protein * 1000),
    carbsMilliG: Math.round(carbs * 1000),
    fatMilliG: Math.round(fat * 1000),
    fiberMilliG: Math.round(fiber * 1000),
    category,
    isVeg,
    ...(tier ? { tier } : {}),
    ...(note ? { note } : {}),
  }
}

/** Per-piece foods (roti, egg, banana) — basis is 1 piece. */
function perPiece(
  name: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
  category: FoodCategory,
  isVeg: boolean,
  tier?: ProteinTier,
  note?: string,
): FoodPreset {
  return { ...per100(name, kcal, protein, carbs, fat, fiber, category, isVeg, tier, note), unit: 'piece', basisQty: 1 }
}

function perMl100(
  name: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  category: FoodCategory,
  isVeg: boolean,
  tier?: ProteinTier,
): FoodPreset {
  return { ...per100(name, kcal, protein, carbs, fat, 0, category, isVeg, tier), unit: 'ml', basisQty: 100 }
}

/* ---------------- S tier — build a vegetarian diet on these ---------------- */

export const S_TIER: readonly FoodPreset[] = [
  per100('Whey protein powder', 400, 80, 8, 6, 0, 'supplement', true, 'S', 'Per 100 g of powder — a 30 g scoop is roughly 24 g protein.'),
  per100('Plant protein (pea + rice)', 380, 75, 7, 5, 3, 'supplement', true, 'S', 'Pea and rice together cover the full amino profile.'),
  per100('Low-fat paneer', 160, 18, 4, 8, 0, 'dairy', true, 'S'),
  per100('Greek yogurt / hung curd', 59, 10, 3.6, 0.4, 0, 'dairy', true, 'S'),
  per100('Soya chunks (dry)', 345, 52, 33, 0.5, 13, 'soy', true, 'S', 'Dry weight — they roughly triple after soaking.'),
  per100('Seitan', 143, 25, 14, 2, 1, 'dal', true, 'S', 'Wheat gluten; skip if gluten does not suit you.'),
]

/* ---------------- A tier — excellent support ---------------- */

export const A_TIER: readonly FoodPreset[] = [
  per100('Tofu (firm)', 76, 12, 1.9, 4.8, 0.3, 'soy', true, 'A'),
  per100('Tempeh', 193, 19, 9, 11, 0, 'soy', true, 'A'),
  per100('Edamame (boiled)', 121, 11, 9, 5, 5, 'soy', true, 'A'),
  perMl100('Skimmed milk', 34, 3.4, 5, 0.1, 'dairy', true, 'A'),
  per100('Sprouted moong', 30, 3, 6, 0.2, 1.8, 'dal', true, 'A'),
  per100('Besan / gram flour', 387, 22, 58, 7, 11, 'dal', true, 'A'),
]

/* ---------------- everyday Indian vegetarian staples ---------------- */

export const STAPLES: readonly FoodPreset[] = [
  per100('Paneer (full fat)', 265, 18, 1.2, 21, 0, 'dairy', true, 'A'),
  per100('Curd / dahi', 60, 3.5, 4.7, 3.3, 0, 'dairy', true, 'B'),
  perMl100('Milk (whole)', 62, 3.4, 4.8, 3.3, 'dairy', true, 'B'),
  per100('Roasted chana', 364, 20, 61, 5, 17, 'dal', true, 'B'),
  per100('Dal (cooked)', 116, 9, 20, 0.4, 8, 'dal', true, 'B'),
  per100('Rajma (cooked)', 127, 9, 23, 0.5, 6, 'dal', true, 'B'),
  per100('Moong sprouts', 30, 3, 6, 0.2, 1.8, 'dal', true, 'B'),
  per100('Chia seeds', 486, 17, 42, 31, 34, 'nut_seed', true, 'C', 'Omega-3 support; calorie-dense, use measured portions.'),
  per100('Flaxseed', 534, 18, 29, 42, 27, 'nut_seed', true, 'C', 'Grind before eating for better use of the fats.'),
  per100('Walnuts', 654, 15, 14, 65, 7, 'nut_seed', true, 'C', 'Omega-3 support; calorie-dense.'),
  per100('Peanut butter', 588, 25, 20, 50, 6, 'nut_seed', true, 'C', 'Calorie-dense — easy to overshoot, weigh it.'),
  per100('Almonds', 579, 21, 22, 50, 12, 'nut_seed', true, 'C'),
  per100('Oats (dry)', 380, 13, 67, 7, 10, 'grain', true, 'C'),
  per100('Poha (dry)', 350, 7, 77, 1, 2, 'grain', true, 'C'),
  per100('Rice (cooked)', 130, 2.7, 28, 0.3, 0.4, 'grain', true, 'C'),
  perPiece('Roti (medium)', 104, 3.1, 18, 2.4, 2, 'grain', true, 'C'),
  perPiece('Idli', 58, 2, 12, 0.4, 0.6, 'grain', true, 'C'),
  perPiece('Bread slice', 79, 2.7, 14, 1, 0.8, 'grain', true, 'C'),
  perPiece('Banana (medium)', 105, 1.3, 27, 0.4, 3, 'fruit', true),
  per100('Guava', 68, 2.6, 14, 1, 5, 'fruit', true),
  per100('Mixed vegetables (cooked)', 50, 2.5, 9, 0.5, 3.5, 'veg', true),
  per100('Creatine monohydrate', 0, 0, 0, 0, 0, 'supplement', true, undefined, '3–5 g daily. No calories — logged for the habit, not the macros.'),
]

export const FOOD_PRESETS: readonly FoodPreset[] = [...S_TIER, ...A_TIER, ...STAPLES]

/** Preset groups for the "add starter foods" picker. */
export const FOOD_PRESET_GROUPS: readonly { id: string; label: string; hint: string; items: readonly FoodPreset[] }[] = [
  { id: 's_tier', label: 'S tier protein', hint: 'Build the diet on these', items: S_TIER },
  { id: 'a_tier', label: 'A tier protein', hint: 'Excellent support', items: A_TIER },
  { id: 'staples', label: 'Everyday staples', hint: 'Indian vegetarian basics', items: STAPLES },
]

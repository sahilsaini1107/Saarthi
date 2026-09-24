// Food library & thali service (Phase 21). Every query is user-scoped; the
// macro math lives in lib/food.ts and is exercised by tests/food.test.ts.
//
// Two rules this file exists to enforce:
//  1. Recipe totals are NEVER stored — they are recomputed from the items on
//     every read, so correcting a food's macros fixes every plate built on it.
//  2. A logged MealEntry IS a snapshot. Editing a food later must not rewrite
//     what you ate last Tuesday, so the macros are frozen into the entry and
//     foodItemId/recipeId is kept only for provenance.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { toUTC } from '@/lib/date'
import {
  composePlate,
  isFoodCategory,
  isFoodUnit,
  isProteinTier,
  scaleFood,
  toWholeGrams,
  type FoodLike,
} from '@/lib/food'
import { FOOD_PRESET_GROUPS } from '@/lib/food-presets'
import type { FoodItemDTO, FoodLibraryPayloadDTO, MacroMilliDTO, RecipeDTO, RecipeItemDTO } from '@/lib/types'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/** Generous per-100 g ceilings — enough for pure oil/protein isolate, no more. */
const LIMITS = {
  caloriesMilliKcal: 1_000_000, // 1000 kcal per 100 g
  proteinMilliG: 100_000, // 100 g per 100 g
  carbsMilliG: 100_000,
  fatMilliG: 100_000,
  fiberMilliG: 100_000,
} as const

const MAX_QUANTITY_MILLI = 10_000_000 // 10 kg / 10 L / 10 000 pieces
const MAX_ITEMS_PER_RECIPE = 40

export interface FoodInput {
  name: string
  brand?: string | null
  unit?: string
  basisQty?: number
  caloriesMilliKcal: number
  proteinMilliG: number
  carbsMilliG: number
  fatMilliG: number
  fiberMilliG?: number | null
  category?: string
  isVeg?: boolean
  tier?: string | null
  note?: string | null
}

function validateFood(input: FoodInput): void {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 80) throw new HttpError('Food name must be 1–80 characters', 422)
  if (input.brand != null && input.brand.length > 60) throw new HttpError('Brand must be 60 characters or fewer', 422)
  if (input.unit != null && !isFoodUnit(input.unit)) throw new HttpError('Unit must be g, ml or piece', 422)
  if (input.category != null && !isFoodCategory(input.category)) throw new HttpError('Unknown food category', 422)
  if (input.tier != null && input.tier !== '' && !isProteinTier(input.tier)) {
    throw new HttpError('Tier must be S, A, B or C', 422)
  }
  if (input.basisQty != null && (!Number.isInteger(input.basisQty) || input.basisQty < 1 || input.basisQty > 1000)) {
    throw new HttpError('Basis quantity must be a whole number 1–1000', 422)
  }
  for (const [key, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    const v = input[key]
    if (v == null) continue
    if (!Number.isInteger(v) || v < 0 || v > max) {
      throw new HttpError(`${key} must be a whole milli-unit between 0 and ${max}`, 422)
    }
  }
  if (input.note != null && input.note.length > 300) throw new HttpError('Note must be 300 characters or fewer', 422)
}

function shapeFood(f: {
  id: string
  name: string
  brand: string | null
  unit: string
  basisQty: number
  caloriesMilliKcal: number
  proteinMilliG: number
  carbsMilliG: number
  fatMilliG: number
  fiberMilliG: number | null
  category: string
  isVeg: boolean
  tier: string | null
  note: string | null
  createdAt: Date
  _count?: { recipeItems: number }
}): FoodItemDTO {
  return {
    id: f.id,
    name: f.name,
    brand: f.brand,
    unit: f.unit,
    basisQty: f.basisQty,
    caloriesMilliKcal: f.caloriesMilliKcal,
    proteinMilliG: f.proteinMilliG,
    carbsMilliG: f.carbsMilliG,
    fatMilliG: f.fatMilliG,
    fiberMilliG: f.fiberMilliG,
    category: f.category,
    isVeg: f.isVeg,
    tier: f.tier,
    note: f.note,
    usageCount: f._count?.recipeItems ?? 0,
    createdAt: f.createdAt.toISOString(),
  }
}

/* ======================= foods ======================= */

export async function listFoods(
  userId: string,
  opts: { q?: string; category?: string; vegOnly?: boolean } = {},
): Promise<{ foods: FoodItemDTO[] }> {
  const rows = await db.foodItem.findMany({
    where: {
      userId,
      // SQLite's LIKE is case-insensitive for ASCII (Postgres would need
      // `mode: 'insensitive'` here).
      ...(opts.q ? { name: { contains: opts.q } } : {}),
      ...(opts.category && isFoodCategory(opts.category) ? { category: opts.category } : {}),
      ...(opts.vegOnly ? { isVeg: true } : {}),
    },
    orderBy: [{ name: 'asc' }],
    include: { _count: { select: { recipeItems: true } } },
  })
  return { foods: rows.map(shapeFood) }
}

export async function createFood(userId: string, input: FoodInput): Promise<FoodItemDTO> {
  validateFood(input)
  const name = input.name.trim()
  const clash = await db.foodItem.findUnique({ where: { userId_name: { userId, name } } })
  if (clash) throw new HttpError(`"${name}" is already in your food library`, 409)
  const row = await db.foodItem.create({
    data: {
      userId,
      name,
      brand: input.brand?.trim() || null,
      unit: input.unit ?? 'g',
      basisQty: input.basisQty ?? (input.unit === 'piece' ? 1 : 100),
      caloriesMilliKcal: input.caloriesMilliKcal,
      proteinMilliG: input.proteinMilliG,
      carbsMilliG: input.carbsMilliG,
      fatMilliG: input.fatMilliG,
      fiberMilliG: input.fiberMilliG ?? null,
      category: input.category ?? 'other',
      isVeg: input.isVeg ?? true,
      tier: input.tier || null,
      note: input.note?.trim() || null,
    },
    include: { _count: { select: { recipeItems: true } } },
  })
  return shapeFood(row)
}

export async function updateFood(userId: string, foodId: string, input: Partial<FoodInput>): Promise<FoodItemDTO> {
  const existing = await db.foodItem.findFirst({ where: { id: foodId, userId } })
  if (!existing) throw new HttpError('Food not found', 404)
  validateFood({ ...existing, ...input } as FoodInput)
  const name = input.name?.trim()
  if (name && name !== existing.name) {
    const clash = await db.foodItem.findUnique({ where: { userId_name: { userId, name } } })
    if (clash) throw new HttpError(`"${name}" is already in your food library`, 409)
  }
  const row = await db.foodItem.update({
    where: { id: foodId },
    data: {
      ...(name ? { name } : {}),
      ...(input.brand !== undefined ? { brand: input.brand?.trim() || null } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.basisQty !== undefined ? { basisQty: input.basisQty } : {}),
      ...(input.caloriesMilliKcal !== undefined ? { caloriesMilliKcal: input.caloriesMilliKcal } : {}),
      ...(input.proteinMilliG !== undefined ? { proteinMilliG: input.proteinMilliG } : {}),
      ...(input.carbsMilliG !== undefined ? { carbsMilliG: input.carbsMilliG } : {}),
      ...(input.fatMilliG !== undefined ? { fatMilliG: input.fatMilliG } : {}),
      ...(input.fiberMilliG !== undefined ? { fiberMilliG: input.fiberMilliG } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.isVeg !== undefined ? { isVeg: input.isVeg } : {}),
      ...(input.tier !== undefined ? { tier: input.tier || null } : {}),
      ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
    },
    include: { _count: { select: { recipeItems: true } } },
  })
  return shapeFood(row)
}

/**
 * Deleting a food removes it from every recipe that used it (the RecipeItem
 * cascade), which silently changes those plates' totals — so the caller must
 * pass `force` once it has shown the usage count.
 */
export async function deleteFood(userId: string, foodId: string, force = false): Promise<void> {
  const existing = await db.foodItem.findFirst({
    where: { id: foodId, userId },
    include: { _count: { select: { recipeItems: true } } },
  })
  if (!existing) throw new HttpError('Food not found', 404)
  if (existing._count.recipeItems > 0 && !force) {
    throw new HttpError(
      `"${existing.name}" is used in ${existing._count.recipeItems} recipe item(s) — deleting it changes those totals.`,
      409,
    )
  }
  await db.foodItem.delete({ where: { id: foodId } })
}

/** Add a preset group to the library, skipping any name the user already has. */
export async function seedPresetGroup(userId: string, groupId: string): Promise<{ added: number; skipped: number }> {
  const group = FOOD_PRESET_GROUPS.find((g) => g.id === groupId)
  if (!group) throw new HttpError('Unknown preset group', 422)
  const existing = await db.foodItem.findMany({
    where: { userId, name: { in: group.items.map((i) => i.name) } },
    select: { name: true },
  })
  const taken = new Set(existing.map((e) => e.name))
  const fresh = group.items.filter((i) => !taken.has(i.name))
  if (fresh.length > 0) {
    await db.foodItem.createMany({
      data: fresh.map((i) => ({
        userId,
        name: i.name,
        unit: i.unit,
        basisQty: i.basisQty,
        caloriesMilliKcal: i.caloriesMilliKcal,
        proteinMilliG: i.proteinMilliG,
        carbsMilliG: i.carbsMilliG,
        fatMilliG: i.fatMilliG,
        fiberMilliG: i.fiberMilliG,
        category: i.category,
        isVeg: i.isVeg,
        tier: i.tier ?? null,
        note: i.note ?? null,
      })),
    })
  }
  return { added: fresh.length, skipped: group.items.length - fresh.length }
}

/* ======================= recipes ======================= */

const RECIPE_INCLUDE = {
  items: { orderBy: { order: 'asc' }, include: { foodItem: true } },
} as const

type RecipeRow = {
  id: string
  name: string
  emoji: string
  note: string | null
  servings: number
  createdAt: Date
  items: {
    id: string
    foodItemId: string
    order: number
    quantityMilli: number
    foodItem: FoodLike & { name: string; unit: string }
  }[]
}

function shapeRecipe(r: RecipeRow): RecipeDTO {
  const plate = composePlate(
    r.items.map((i) => ({ food: i.foodItem, quantityMilli: i.quantityMilli })),
    r.servings,
  )
  const items: RecipeItemDTO[] = r.items.map((i, idx) => {
    const part = plate.parts[idx]
    return {
      id: i.id,
      foodItemId: i.foodItemId,
      name: i.foodItem.name,
      unit: i.foodItem.unit,
      order: i.order,
      quantityMilli: i.quantityMilli,
      caloriesMilliKcal: part.macros.caloriesMilliKcal,
      proteinMilliG: part.macros.proteinMilliG,
      carbsMilliG: part.macros.carbsMilliG,
      fatMilliG: part.macros.fatMilliG,
      fiberMilliG: part.macros.fiberMilliG,
      caloriePct: part.caloriePct,
    }
  })
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    note: r.note,
    servings: plate.servings,
    items,
    total: plate.total as MacroMilliDTO,
    perServing: plate.perServing as MacroMilliDTO,
    createdAt: r.createdAt.toISOString(),
  }
}

export interface RecipeItemInput {
  foodItemId: string
  quantityMilli: number
}

export interface RecipeInput {
  name: string
  emoji?: string
  note?: string | null
  servings?: number
  items: RecipeItemInput[]
}

function validateRecipe(input: RecipeInput): void {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 80) throw new HttpError('Recipe name must be 1–80 characters', 422)
  if (input.servings != null && (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > 50)) {
    throw new HttpError('Servings must be a whole number 1–50', 422)
  }
  if (input.items.length === 0) throw new HttpError('A recipe needs at least one ingredient', 422)
  if (input.items.length > MAX_ITEMS_PER_RECIPE) {
    throw new HttpError(`A recipe can hold at most ${MAX_ITEMS_PER_RECIPE} ingredients`, 422)
  }
  for (const i of input.items) {
    if (!Number.isInteger(i.quantityMilli) || i.quantityMilli <= 0 || i.quantityMilli > MAX_QUANTITY_MILLI) {
      throw new HttpError('Each quantity must be greater than 0', 422)
    }
  }
}

/** Every referenced food must belong to this user — no cross-account reads. */
async function assertOwnedFoods(userId: string, items: readonly RecipeItemInput[]): Promise<void> {
  const ids = [...new Set(items.map((i) => i.foodItemId))]
  const owned = await db.foodItem.count({ where: { userId, id: { in: ids } } })
  if (owned !== ids.length) throw new HttpError('One of those foods is not in your library', 404)
}

export async function listRecipes(userId: string): Promise<{ recipes: RecipeDTO[] }> {
  const rows = await db.recipe.findMany({ where: { userId }, orderBy: { name: 'asc' }, include: RECIPE_INCLUDE })
  return { recipes: rows.map((r) => shapeRecipe(r as RecipeRow)) }
}

export async function getRecipe(userId: string, recipeId: string): Promise<RecipeDTO> {
  const row = await db.recipe.findFirst({ where: { id: recipeId, userId }, include: RECIPE_INCLUDE })
  if (!row) throw new HttpError('Recipe not found', 404)
  return shapeRecipe(row as RecipeRow)
}

export async function createRecipe(userId: string, input: RecipeInput): Promise<RecipeDTO> {
  validateRecipe(input)
  await assertOwnedFoods(userId, input.items)
  const name = input.name.trim()
  const clash = await db.recipe.findUnique({ where: { userId_name: { userId, name } } })
  if (clash) throw new HttpError(`"${name}" already exists`, 409)
  const row = await db.recipe.create({
    data: {
      userId,
      name,
      emoji: input.emoji || '🍛',
      note: input.note?.trim() || null,
      servings: input.servings ?? 1,
      items: {
        create: input.items.map((i, idx) => ({ foodItemId: i.foodItemId, order: idx, quantityMilli: i.quantityMilli })),
      },
    },
    include: RECIPE_INCLUDE,
  })
  return shapeRecipe(row as RecipeRow)
}

/** Items are replace-all — simpler than diffing, and the plate is small. */
export async function updateRecipe(userId: string, recipeId: string, input: RecipeInput): Promise<RecipeDTO> {
  const existing = await db.recipe.findFirst({ where: { id: recipeId, userId } })
  if (!existing) throw new HttpError('Recipe not found', 404)
  validateRecipe(input)
  await assertOwnedFoods(userId, input.items)
  const name = input.name.trim()
  if (name !== existing.name) {
    const clash = await db.recipe.findUnique({ where: { userId_name: { userId, name } } })
    if (clash) throw new HttpError(`"${name}" already exists`, 409)
  }
  await db.$transaction([
    db.recipeItem.deleteMany({ where: { recipeId } }),
    db.recipe.update({
      where: { id: recipeId },
      data: {
        name,
        emoji: input.emoji || existing.emoji,
        note: input.note?.trim() || null,
        servings: input.servings ?? existing.servings,
        items: {
          create: input.items.map((i, idx) => ({
            foodItemId: i.foodItemId,
            order: idx,
            quantityMilli: i.quantityMilli,
          })),
        },
      },
    }),
  ])
  return getRecipe(userId, recipeId)
}

export async function deleteRecipe(userId: string, recipeId: string): Promise<void> {
  const existing = await db.recipe.findFirst({ where: { id: recipeId, userId } })
  if (!existing) throw new HttpError('Recipe not found', 404)
  await db.recipe.delete({ where: { id: recipeId } })
}

/* ======================= logging to the day ======================= */

export interface LogFoodInput {
  date: string
  mealType?: string
  foodItemId?: string
  recipeId?: string
  /** portion for a food, or number of servings × 1000 for a recipe */
  quantityMilli: number
}

/**
 * Log a library food or a saved recipe as a MealEntry. The macros are computed
 * here and FROZEN into the row — provenance ids are kept so the UI can show
 * where it came from, but a later edit to the food never rewrites history.
 */
export async function logFoodAsMeal(userId: string, input: LogFoodInput, today: string): Promise<void> {
  if (!ISO_RE.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (input.date > today) throw new HttpError('Cannot log a meal for a future day', 422)
  if (!Number.isInteger(input.quantityMilli) || input.quantityMilli <= 0 || input.quantityMilli > MAX_QUANTITY_MILLI) {
    throw new HttpError('Quantity must be greater than 0', 422)
  }
  const mealType = input.mealType ?? 'snack'
  if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType)) throw new HttpError('Unknown meal type', 422)

  if (input.recipeId) {
    const recipe = await getRecipe(userId, input.recipeId)
    // quantityMilli counts SERVINGS for a recipe (1 serving = 1000)
    const servings = input.quantityMilli / 1000
    const grams = toWholeGrams({
      caloriesMilliKcal: Math.round(recipe.perServing.caloriesMilliKcal * servings),
      proteinMilliG: Math.round(recipe.perServing.proteinMilliG * servings),
      carbsMilliG: Math.round(recipe.perServing.carbsMilliG * servings),
      fatMilliG: Math.round(recipe.perServing.fatMilliG * servings),
      fiberMilliG: Math.round(recipe.perServing.fiberMilliG * servings),
    })
    await db.mealEntry.create({
      data: {
        userId,
        date: toUTC(input.date),
        mealType,
        name: servings === 1 ? recipe.name : `${recipe.name} × ${servings}`,
        caloriesKcal: grams.caloriesKcal,
        proteinG: grams.proteinG,
        carbsG: grams.carbsG,
        fatG: grams.fatG,
        recipeId: recipe.id,
        quantityMilli: input.quantityMilli,
      },
    })
    return
  }

  if (!input.foodItemId) throw new HttpError('Pass a foodItemId or a recipeId', 422)
  const food = await db.foodItem.findFirst({ where: { id: input.foodItemId, userId } })
  if (!food) throw new HttpError('Food not found', 404)
  const grams = toWholeGrams(scaleFood(food, input.quantityMilli))
  await db.mealEntry.create({
    data: {
      userId,
      date: toUTC(input.date),
      mealType,
      name: `${food.name} · ${input.quantityMilli / 1000} ${food.unit === 'piece' ? 'pc' : food.unit}`.slice(0, 120),
      caloriesKcal: grams.caloriesKcal,
      proteinG: grams.proteinG,
      carbsG: grams.carbsG,
      fatG: grams.fatG,
      foodItemId: food.id,
      quantityMilli: input.quantityMilli,
    },
  })
}

/* ======================= library payload ======================= */

export async function foodLibrary(userId: string): Promise<FoodLibraryPayloadDTO> {
  const [{ foods }, { recipes }] = await Promise.all([listFoods(userId), listRecipes(userId)])
  const names = new Set(foods.map((f) => f.name))
  const seededGroups = FOOD_PRESET_GROUPS.filter((g) => g.items.every((i) => names.has(i.name))).map((g) => g.id)
  return { foods, recipes, seededGroups }
}

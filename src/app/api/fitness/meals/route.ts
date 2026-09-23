// Meal-level food log (Phase 19). GET ?date=YYYY-MM-DD (default today);
// POST adds a granular entry. Entries are delete-only (Decision #70).

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addMealEntry, getNutrition } from '@/services/fitness'

const mealSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // breakfast | lunch | dinner | snack
  mealType: z.string().max(20).optional(),
  name: z.string().min(1).max(120),
  caloriesKcal: z.number().int().min(0).max(5000).nullable().optional(),
  proteinG: z.number().int().min(0).max(500).nullable().optional(),
  carbsG: z.number().int().min(0).max(1000).nullable().optional(),
  fatG: z.number().int().min(0).max(500).nullable().optional(),
})

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get('date') ?? undefined
  return withUser(async (user) => getNutrition(user.id, user.timezone, date ?? undefined))
}

export async function POST(req: Request) {
  return withUser(async (user) => addMealEntry(user.id, await parseBody(req, mealSchema), user.timezone))
}

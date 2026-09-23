// Log a library food or a saved plate into the day's meal log. The macros are
// computed server-side and frozen into the MealEntry (Decision #71 snapshot).

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { todayISO } from '@/lib/date'
import { getNutrition } from '@/services/fitness'
import { logFoodAsMeal } from '@/services/food'

const schema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
    foodItemId: z.string().min(1).optional(),
    recipeId: z.string().min(1).optional(),
    /** portion in milli-units for a food; servings × 1000 for a recipe */
    quantityMilli: z.number().int().min(1).max(10_000_000),
  })
  .refine((v) => !!v.foodItemId !== !!v.recipeId, { message: 'Pass exactly one of foodItemId or recipeId' })

export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = await parseBody(req, schema)
    await logFoodAsMeal(user.id, body, todayISO(user.timezone))
    // hand back the refreshed day so the Fuel screen updates in one round trip
    return getNutrition(user.id, user.timezone, body.date)
  })
}

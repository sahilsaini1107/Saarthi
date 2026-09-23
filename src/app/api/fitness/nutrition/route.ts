import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { getNutrition, saveNutritionDay } from '@/services/fitness'

const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  proteinG: z.number().int().min(0).max(500).nullable().optional(),
  caloriesKcal: z.number().int().min(0).max(10_000).nullable().optional(),
})

export async function GET() {
  return withUser(async (user) => getNutrition(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => saveNutritionDay(user.id, await parseBody(req, daySchema), user.timezone))
}

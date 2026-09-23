import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { updateNutritionProfile } from '@/services/fitness'

const profileSchema = z.object({
  calorieTarget: z.number().int().min(1200).max(6000).optional(),
  proteinTargetG: z.number().int().min(30).max(400).optional(),
  proteinPerKgMilli: z.number().int().min(800).max(3000).optional(),
  weeklyGainTargetG: z.number().int().min(50).max(2000).optional(),
})

export async function PATCH(req: Request) {
  return withUser(async (user) => updateNutritionProfile(user.id, await parseBody(req, profileSchema), user.timezone))
}

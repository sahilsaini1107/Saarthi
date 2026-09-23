import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addPlanExercise } from '@/services/fitness'

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  muscleGroup: z.enum(['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full_body', 'cardio', 'other']).optional(),
  equipment: z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other']).optional(),
  sets: z.number().int().min(1).max(20),
  repMin: z.number().int().min(1).max(200).nullable().optional(),
  repMax: z.number().int().min(1).max(200).nullable().optional(),
  secondsMin: z.number().int().min(1).max(3600).nullable().optional(),
  secondsMax: z.number().int().min(1).max(3600).nullable().optional(),
  restSeconds: z.number().int().min(0).max(1200).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => addPlanExercise(user.id, id, await parseBody(req, schema)))
}

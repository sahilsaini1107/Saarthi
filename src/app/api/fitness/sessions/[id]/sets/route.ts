import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addSet } from '@/services/fitness'

const setSchema = z
  .object({
    exerciseId: z.string().min(1).optional(),
    name: z.string().trim().max(80).optional(),
    muscleGroup: z.enum(['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full_body', 'cardio', 'other']).optional(),
    equipment: z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other']).optional(),
    weightGrams: z.number().int().min(0).max(500_000).nullable().optional(),
    reps: z.number().int().min(0).max(200).nullable().optional(),
    durationSeconds: z.number().int().min(0).max(3600).nullable().optional(),
    isWarmup: z.boolean().optional(),
  })
  .refine((s) => s.exerciseId != null || (s.name != null && s.name.trim().length > 0), {
    message: 'Provide exerciseId or name',
  })

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => addSet(user.id, id, await parseBody(req, setSchema), user.timezone))
}

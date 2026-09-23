import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { listExercises, upsertExercise } from '@/services/fitness'

const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(80),
  muscleGroup: z.enum(['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full_body', 'cardio', 'other']).optional(),
  equipment: z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other']).optional(),
})

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? undefined
  return withUser(async (user) => listExercises(user.id, q || undefined))
}

export async function POST(req: Request) {
  return withUser(async (user) => upsertExercise(user.id, await parseBody(req, exerciseSchema)))
}

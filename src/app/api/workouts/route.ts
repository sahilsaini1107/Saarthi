import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addWorkout, listWorkouts } from '@/services/body'

export const workoutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['strength', 'cardio', 'yoga', 'sports', 'walk', 'hiit', 'other']),
  minutes: z.number().int().min(1).max(1440),
  intensity: z.enum(['light', 'moderate', 'hard']).optional(),
  note: z.string().max(500).nullable().optional(),
})

export async function GET() {
  return withUser(async (user) => listWorkouts(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => addWorkout(user.id, await parseBody(req, workoutSchema), user.timezone))
}

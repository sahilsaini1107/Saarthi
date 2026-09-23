import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createPlan, listPlans } from '@/services/fitness'

const prescriptionSchema = z.object({
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

const planSchema = z.object({
  name: z.string().trim().min(1).max(60),
  emoji: z.string().max(8).optional(),
  note: z.string().max(500).nullable().optional(),
  activate: z.boolean().optional(),
  days: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        focus: z.string().max(80).nullable().optional(),
        exercises: z.array(prescriptionSchema).min(1).max(15),
      }),
    )
    .min(1)
    .max(10),
})

export async function GET() {
  return withUser(async (user) => listPlans(user.id))
}

export async function POST(req: Request) {
  return withUser(async (user) => createPlan(user.id, await parseBody(req, planSchema)))
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createRoutine, listRoutines } from '@/services/routines'

export const routineSchema = z.object({
  name: z.string().min(1).max(60),
  emoji: z.string().min(1).max(8).optional(),
  weekdays: z.string().regex(/^[01]{7}$/).optional(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  active: z.boolean().optional(),
  steps: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        minutes: z.number().int().min(0).max(240).nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
})

export async function GET() {
  return withUser(async (user) => listRoutines(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    await createRoutine(user.id, await parseBody(req, routineSchema))
    return { ok: true }
  })
}

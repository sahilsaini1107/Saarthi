import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { recordRun } from '@/services/routines'
import { todayISO } from '@/lib/date'

const playSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completedSteps: z.number().int().min(0),
  totalSteps: z.number().int().min(0),
  secondsSpent: z.number().int().min(0),
})

type Ctx = { params: Promise<{ id: string }> }

/** Record (or replace) a play-mode run. Defaults to today. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    const body = await parseBody(req, playSchema)
    return recordRun(user.id, id, {
      date: body.date ?? todayISO(user.timezone),
      completedSteps: body.completedSteps,
      totalSteps: body.totalSteps,
      secondsSpent: body.secondsSpent,
    })
  })
}

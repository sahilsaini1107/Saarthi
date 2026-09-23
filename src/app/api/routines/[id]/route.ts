import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteRoutine, updateRoutine } from '@/services/routines'

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
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
    .max(20)
    .optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await updateRoutine(user.id, id, await parseBody(req, updateSchema))
    return { ok: true }
  })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteRoutine(user.id, id)
    return { ok: true }
  })
}

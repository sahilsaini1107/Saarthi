import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteHabit, updateHabit } from '@/services/habits'

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  emoji: z.string().min(1).max(8).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  weekdays: z.string().regex(/^[01]{7}$/).optional(),
  buildingDays: z.number().int().min(1).max(365).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  archived: z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateHabit(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteHabit(user.id, id)
    return { ok: true }
  })
}

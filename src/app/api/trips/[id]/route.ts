import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteTrip, getTrip, updateTrip } from '@/services/trips'

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  emoji: z.string().max(8).optional(),
  destination: z.string().max(80).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  budgetPaise: z.number().int().positive().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => getTrip(user.id, id, user.timezone))
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateTrip(user.id, id, await parseBody(req, updateSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteTrip(user.id, id)
    return { ok: true }
  })
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deletePlanDay, updatePlanDay } from '@/services/fitness'

const patchSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  focus: z.string().max(80).nullable().optional(),
  order: z.number().int().min(0).max(9).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await updatePlanDay(user.id, id, await parseBody(req, patchSchema))
    return { ok: true }
  })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deletePlanDay(user.id, id)
    return { ok: true }
  })
}

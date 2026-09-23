import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deletePlan, updatePlan } from '@/services/fitness'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  emoji: z.string().max(8).optional(),
  note: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updatePlan(user.id, id, await parseBody(req, patchSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deletePlan(user.id, id)
    return { ok: true }
  })
}

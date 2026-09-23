import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deletePrinciple, updatePrinciple } from '@/services/principles'

const updateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  detail: z.string().max(500).nullable().optional(),
  category: z.string().max(20).optional(),
  active: z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updatePrinciple(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deletePrinciple(user.id, id)
    return { ok: true }
  })
}

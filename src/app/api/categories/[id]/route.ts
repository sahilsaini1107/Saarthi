import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteCategory, updateCategory } from '@/services/categories'

const updateSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  emoji: z.string().max(8).optional(),
  color: z.string().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateCategory(user.id, id, await parseBody(req, updateSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteCategory(user.id, id)
    return { ok: true }
  })
}

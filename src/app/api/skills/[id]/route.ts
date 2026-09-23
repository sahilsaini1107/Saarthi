import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteSkill, updateSkill } from '@/services/skills'

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  category: z.string().max(20).optional(),
  targetLevel: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(500).nullable().optional(),
  // active | paused | archived
  status: z.string().max(20).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateSkill(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteSkill(user.id, id)
    return { ok: true }
  })
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteTopic, updateTopic } from '@/services/study'

const updateSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  estMinutes: z.number().int().min(1).max(600).nullable().optional(),
  status: z.enum(['todo', 'learning', 'done']).optional(),
  order: z.number().int().min(0).max(9999).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateTopic(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => deleteTopic(user.id, id, user.timezone))
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteIdea, updateIdea } from '@/services/ideas'
import { ideaSchema } from '../route'

const updateSchema = ideaSchema.partial()

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateIdea(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteIdea(user.id, id)
    return { ok: true }
  })
}

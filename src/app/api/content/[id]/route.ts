import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteContent, updateContent } from '@/services/content'
import { contentSchema } from '../route'

const updateSchema = contentSchema.partial()

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateContent(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteContent(user.id, id)
    return { ok: true }
  })
}

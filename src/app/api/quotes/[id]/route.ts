import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteQuote, updateQuote } from '@/services/reading'

const updateSchema = z.object({
  text: z.string().min(1).max(1000).optional(),
  author: z.string().max(120).nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  bookId: z.string().max(40).nullable().optional(),
  tags: z.string().max(200).nullable().optional(),
  favorite: z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateQuote(user.id, id, await parseBody(req, updateSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteQuote(user.id, id)
    return { ok: true }
  })
}

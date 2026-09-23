import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteBook, getBook, updateBook } from '@/services/reading'

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  author: z.string().max(120).nullable().optional(),
  format: z.string().max(10).optional(),
  status: z.string().max(12).optional(),
  totalPages: z.number().int().min(0).max(20000).optional(),
  currentPage: z.number().int().min(0).max(20000).optional(),
  tags: z.string().max(200).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  takeaway: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => getBook(user.id, id, user.timezone))
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateBook(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteBook(user.id, id)
    return { ok: true }
  })
}

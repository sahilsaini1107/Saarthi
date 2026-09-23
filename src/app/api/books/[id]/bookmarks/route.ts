import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addBookmark } from '@/services/reading'

const bookmarkSchema = z.object({
  cfi: z.string().max(2000).nullable().optional(),
  page: z.number().int().min(1).max(200000).nullable().optional(),
  label: z.string().max(80).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => addBookmark(user.id, id, await parseBody(req, bookmarkSchema)))
}

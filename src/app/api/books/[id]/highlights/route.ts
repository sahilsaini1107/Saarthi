import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addHighlight } from '@/services/reading'

const highlightSchema = z.object({
  cfi: z.string().max(2000).nullable().optional(),
  page: z.number().int().min(1).max(200000).nullable().optional(),
  text: z.string().min(1).max(2000),
  note: z.string().max(1000).nullable().optional(),
  color: z.string().max(10).optional(),
  chapter: z.string().max(200).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => addHighlight(user.id, id, await parseBody(req, highlightSchema)))
}

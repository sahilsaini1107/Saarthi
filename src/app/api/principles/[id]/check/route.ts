import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { setCheck } from '@/services/principles'

const checkSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['kept', 'broken', 'na']),
  note: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => setCheck(user.id, id, await parseBody(req, checkSchema), user.timezone))
}

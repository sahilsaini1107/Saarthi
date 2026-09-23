import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { logTouchpoint } from '@/services/people'

const touchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // meet | call | text | event | other
  type: z.string().max(20),
  note: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => logTouchpoint(user.id, id, await parseBody(req, touchSchema), user.timezone))
}

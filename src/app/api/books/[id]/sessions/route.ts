import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { logSession } from '@/services/reading'

const sessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutes: z.number().int().min(0).max(1440),
  pages: z.number().int().min(0).max(5000).optional(),
  currentPage: z.number().int().min(0).max(20000).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => logSession(user.id, id, await parseBody(req, sessionSchema), user.timezone))
}

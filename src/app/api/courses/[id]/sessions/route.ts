import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { logSession } from '@/services/study'

const sessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutes: z.number().int().min(1).max(1440),
  topicId: z.string().min(1).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => logSession(user.id, id, await parseBody(req, sessionSchema), user.timezone))
}

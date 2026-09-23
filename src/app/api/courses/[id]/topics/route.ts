import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addTopic } from '@/services/study'

const topicSchema = z.object({
  title: z.string().min(1).max(160),
  estMinutes: z.number().int().min(1).max(600).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => addTopic(user.id, id, await parseBody(req, topicSchema), user.timezone))
}

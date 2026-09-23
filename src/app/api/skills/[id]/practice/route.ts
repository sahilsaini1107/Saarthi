import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { logPractice } from '@/services/skills'

const practiceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutes: z.number().int().min(1).max(1440),
  note: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => logPractice(user.id, id, await parseBody(req, practiceSchema), user.timezone))
}

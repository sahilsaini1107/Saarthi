import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { updateProgress } from '@/services/reading'

const progressSchema = z.object({
  currentPage: z.number().int().min(0).max(20000).optional(),
  percent: z.number().min(0).max(100).optional(),
  position: z.string().max(2000).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateProgress(user.id, id, await parseBody(req, progressSchema), user.timezone))
}

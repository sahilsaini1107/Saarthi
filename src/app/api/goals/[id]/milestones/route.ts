import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addMilestone } from '@/services/goals'

const milestoneSchema = z.object({
  title: z.string().min(1).max(120),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  // Phase 11 — optional planned effort in minutes (0 clears)
  targetMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => addMilestone(user.id, id, await parseBody(req, milestoneSchema), user.timezone))
}

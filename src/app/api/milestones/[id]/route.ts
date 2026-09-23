import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteMilestone, updateMilestone } from '@/services/goals'

const updateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  done: z.boolean().optional(),
  order: z.number().int().min(0).max(999).optional(),
  // Phase 11 — optional planned effort in minutes (0 clears)
  targetMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateMilestone(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => deleteMilestone(user.id, id, user.timezone))
}

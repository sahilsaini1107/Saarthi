import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteGoal, updateGoal } from '@/services/goals'

const updateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  emoji: z.string().min(1).max(8).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['active', 'achieved', 'archived']).optional(),
  // Phase 9 — daily contribution tracking (null clears it)
  metric: z.enum(['money', 'count']).nullable().optional(),
  unitLabel: z.string().max(16).nullable().optional(),
  targetValueMilli: z.number().int().min(0).max(1_000_000_000_000).nullable().optional(),
  // Phase 10 — portfolio job funding this money goal (money goals only; null clears)
  job: z.string().nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateGoal(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteGoal(user.id, id)
    return { ok: true }
  })
}

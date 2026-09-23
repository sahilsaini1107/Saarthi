import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createGoal, listGoals } from '@/services/goals'

export const goalSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  emoji: z.string().min(1).max(8).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['active', 'achieved', 'archived']).optional(),
  // Phase 9 — daily contribution tracking (null = plain milestone/task goal)
  metric: z.enum(['money', 'count']).nullable().optional(),
  unitLabel: z.string().max(16).nullable().optional(),
  // milli-units (₹1 = 1000, 1 unit = 1000) — safe-integer JSON
  targetValueMilli: z.number().int().min(0).max(1_000_000_000_000).nullable().optional(),
  // Phase 10 — portfolio job funding this money goal (money goals only)
  job: z.string().nullable().optional(),
})

export async function GET() {
  return withUser(async (user) => listGoals(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => createGoal(user.id, await parseBody(req, goalSchema), user.timezone))
}

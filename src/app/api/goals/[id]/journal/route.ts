import { withUser } from '@/lib/api-helpers'
import { goalJournal } from '@/services/milestone-logs'

// Phase 11 — the goal journal payload: per-milestone summaries + recent
// entries, and the goal-level effort grid aggregating minutes across
// milestones, with streaks and full-history roll-ups.

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => goalJournal(user.id, id, user.timezone))
}

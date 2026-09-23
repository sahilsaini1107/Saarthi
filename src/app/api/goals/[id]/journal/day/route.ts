import { withUser } from '@/lib/api-helpers'
import { goalDayLogs } from '@/services/milestone-logs'

// Phase 11 — one day's journal entries across ALL of the goal's milestones
// (grid tap → edit day). Milestones without an entry that day come back
// with nulls so the editor can create them in place. Date validation lives
// in the service so errors flow through the standard error envelope.

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const date = new URL(req.url).searchParams.get('date') ?? ''
  return withUser(async (user) => goalDayLogs(user.id, id, date))
}

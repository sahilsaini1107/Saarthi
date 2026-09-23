import { withUser } from '@/lib/api-helpers'
import { habitGrid } from '@/services/habits'

// Phase 10 — habit effort grid: GitHub-style check-in calendar + roll-ups.
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser((user) => habitGrid(user.id, id, user.timezone))
}

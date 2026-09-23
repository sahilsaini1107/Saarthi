import { withUser } from '@/lib/api-helpers'
import { courseGrid } from '@/services/study'

// Phase 10 — course effort grid: GitHub-style minutes calendar + roll-ups.
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser((user) => courseGrid(user.id, id, user.timezone))
}

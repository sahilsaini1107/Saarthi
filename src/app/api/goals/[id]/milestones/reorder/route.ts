import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { reorderMilestones } from '@/services/goals'

// Phase 12 — drag-and-drop milestone reordering: the client sends the goal's
// milestone ids in their NEW order; the service validates it is an exact
// permutation of what exists and rewrites order 0..n-1.
const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  // parse INSIDE withUser so a malformed body becomes 422 JSON, not 500 HTML
  // (same lesson as the Phase 11 day-route bug)
  return withUser(async (user) => {
    const { ids } = await parseBody(req, reorderSchema)
    return reorderMilestones(user.id, id, ids, user.timezone)
  })
}

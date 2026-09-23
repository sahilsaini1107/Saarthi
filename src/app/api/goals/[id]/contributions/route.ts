import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { goalContributions, logContribution, removeContribution } from '@/services/goals'

// Phase 9 — daily goal contributions + effort grid.
// GET    → the grid payload (window, per-day levels, streaks, pace stats)
// POST   → upsert one day's contribution (exactly-once per goal+day)
// DELETE → remove one day's contribution (?date=YYYY-MM-DD)

const logSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // milli-units of the goal metric (₹1 = 1000, 1 unit = 1000)
  amountMilli: z.number().int().min(1).max(100_000_000_000),
  note: z.string().max(280).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => goalContributions(user.id, id, user.timezone))
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => logContribution(user.id, id, await parseBody(req, logSchema), user.timezone))
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const date = new URL(req.url).searchParams.get('date') ?? ''
  return withUser(async (user) => {
    await removeContribution(user.id, id, date)
    return { ok: true }
  })
}

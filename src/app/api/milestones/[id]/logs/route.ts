import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { listMilestoneLogs, logMilestoneProgress, removeMilestoneLog } from '@/services/milestone-logs'

// Phase 11 — milestone daily journal.
// GET    → the milestone's full journal, newest first
// POST   → upsert one day's entry (exactly-once per milestone+day)
// DELETE → remove one day's entry (?date=YYYY-MM-DD)

const logSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutes: z.number().int().min(1).max(1440),
  did: z.string().max(500).nullable().optional(),
  learned: z.string().max(500).nullable().optional(),
  keyLearning: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => listMilestoneLogs(user.id, id))
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => logMilestoneProgress(user.id, id, await parseBody(req, logSchema), user.timezone))
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const date = new URL(req.url).searchParams.get('date') ?? ''
  return withUser(async (user) => {
    await removeMilestoneLog(user.id, id, date)
    return { ok: true }
  })
}

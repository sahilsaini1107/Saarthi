import { withUser } from '@/lib/api-helpers'
import { netWorthTrend } from '@/services/networth'

// Net-worth trend (Phase 4): upserts today's snapshot, then returns the
// forward-filled per-day series (default window 90 days) with deltas.
export async function GET(req: Request) {
  return withUser(async (user) => {
    const raw = new URL(req.url).searchParams.get('days')
    const parsed = raw === null ? undefined : Number(raw)
    const days = Number.isInteger(parsed) && parsed! >= 7 && parsed! <= 365 ? parsed! : 90
    return netWorthTrend(user.id, user.timezone, days)
  })
}

import { withUser } from '@/lib/api-helpers'
import { currentMonthKey } from '@/lib/date'
import { monthlyLearnings } from '@/services/milestone-logs'

// Phase 12 — "💡 Key learnings this month" digest for the Journal tab.
// GET /api/journal/learnings?month=YYYY-MM (defaults to the user's current
// month; the UI's month stepper passes explicit keys to browse history).
export async function GET(req: Request) {
  return withUser(async (user) => {
    const params = Object.fromEntries(new URL(req.url).searchParams)
    const month = typeof params.month === 'string' && params.month !== '' ? params.month : currentMonthKey(user.timezone)
    return monthlyLearnings(user.id, user.timezone, month)
  })
}

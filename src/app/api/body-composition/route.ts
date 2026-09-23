// Body composition panel (Phase 22): logged readings + honestly-derived
// figures + health bands + the coach's starting targets for the chosen goal.

import { withUser } from '@/lib/api-helpers'
import { bodyComposition } from '@/services/body'
import { isBodyGoal } from '@/lib/coach-targets'

export async function GET(req: Request) {
  const goal = new URL(req.url).searchParams.get('goal')
  return withUser(async (user) =>
    bodyComposition(user.id, user.timezone, goal && isBodyGoal(goal) ? goal : undefined),
  )
}

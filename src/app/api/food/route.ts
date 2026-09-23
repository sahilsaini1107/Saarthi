// Food library payload (Phase 21): configurable foods + saved plates.

import { withUser } from '@/lib/api-helpers'
import { foodLibrary } from '@/services/food'

export async function GET() {
  return withUser(async (user) => foodLibrary(user.id))
}

import { withUser } from '@/lib/api-helpers'
import { fitnessSummary } from '@/services/fitness'

export async function GET() {
  return withUser(async (user) => fitnessSummary(user.id, user.timezone))
}

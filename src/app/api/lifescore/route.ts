import { withUser } from '@/lib/api-helpers'
import { lifeScore } from '@/services/lifescore'

export async function GET() {
  return withUser((user) => lifeScore(user.id, user.timezone))
}

import { withUser } from '@/lib/api-helpers'
import { gamificationProfile } from '@/services/gamification'

export async function GET() {
  return withUser((user) => gamificationProfile(user.id, user.timezone))
}

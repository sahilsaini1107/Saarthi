import { withUser } from '@/lib/api-helpers'
import { revokeOtherSessions } from '@/services/auth-sessions'

export async function POST() {
  return withUser((user) => revokeOtherSessions(user.id))
}

import { withUser } from '@/lib/api-helpers'
import { listSessions } from '@/services/auth-sessions'

export async function GET() {
  return withUser((user) => listSessions(user.id))
}

import { withUser } from '@/lib/api-helpers'
import { todaySnapshot } from '@/services/overview'

export async function GET() {
  return withUser((user) => todaySnapshot(user.id, user.timezone))
}

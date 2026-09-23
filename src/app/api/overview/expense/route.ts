import { withUser } from '@/lib/api-helpers'
import { expenseOverview } from '@/services/overview'

export async function GET(req: Request) {
  const month = new URL(req.url).searchParams.get('month') || ''
  return withUser((user) => expenseOverview(user.id, month))
}

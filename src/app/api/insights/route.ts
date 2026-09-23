import { withUser } from '@/lib/api-helpers'
import { insights } from '@/services/insights'

export async function GET(req: Request) {
  const qp = new URL(req.url).searchParams
  const raw = Number(qp.get('limit'))
  const cap = Number.isFinite(raw) && raw >= 1 && raw <= 20 ? Math.floor(raw) : 6
  return withUser((user) => insights(user.id, user.timezone, cap))
}

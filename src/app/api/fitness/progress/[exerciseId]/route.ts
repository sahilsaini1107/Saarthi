import { withUser } from '@/lib/api-helpers'
import { exerciseProgress } from '@/services/fitness'

type Ctx = { params: Promise<{ exerciseId: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { exerciseId } = await ctx.params
  return withUser(async (user) => exerciseProgress(user.id, exerciseId, user.timezone))
}

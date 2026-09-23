import { withUser } from '@/lib/api-helpers'
import { deleteMetric } from '@/services/body'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => deleteMetric(user.id, id, user.timezone))
}

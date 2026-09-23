import { withUser } from '@/lib/api-helpers'
import { deleteTouchpoint } from '@/services/people'

type Ctx = { params: Promise<{ id: string; tid: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, tid } = await ctx.params
  return withUser(async (user) => deleteTouchpoint(user.id, id, tid))
}

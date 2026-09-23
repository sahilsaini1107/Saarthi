import { withUser } from '@/lib/api-helpers'
import { deleteSession } from '@/services/study'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => deleteSession(user.id, id, user.timezone))
}

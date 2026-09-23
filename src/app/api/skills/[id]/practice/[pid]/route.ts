import { withUser } from '@/lib/api-helpers'
import { deletePractice } from '@/services/skills'

type Ctx = { params: Promise<{ id: string; pid: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, pid } = await ctx.params
  return withUser(async (user) => deletePractice(user.id, id, pid))
}

import { withUser } from '@/lib/api-helpers'
import { deleteSession } from '@/services/reading'

type Ctx = { params: Promise<{ id: string; sid: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, sid } = await ctx.params
  return withUser(async (user) => {
    await deleteSession(user.id, id, sid)
    return { ok: true }
  })
}

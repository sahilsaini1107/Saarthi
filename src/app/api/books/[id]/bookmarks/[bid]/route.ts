import { withUser } from '@/lib/api-helpers'
import { deleteBookmark } from '@/services/reading'

type Ctx = { params: Promise<{ id: string; bid: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, bid } = await ctx.params
  return withUser(async (user) => {
    await deleteBookmark(user.id, id, bid)
    return { ok: true }
  })
}

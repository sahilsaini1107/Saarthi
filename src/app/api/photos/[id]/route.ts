import { withUser } from '@/lib/api-helpers'
import { deletePhoto } from '@/services/photos'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => deletePhoto(user.id, id))
}

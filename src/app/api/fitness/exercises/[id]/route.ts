import { withUser } from '@/lib/api-helpers'
import { deleteExercise } from '@/services/fitness'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteExercise(user.id, id)
    return { ok: true }
  })
}

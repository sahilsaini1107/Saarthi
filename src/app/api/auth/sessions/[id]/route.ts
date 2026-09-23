import { withUser } from '@/lib/api-helpers'
import { revokeSession } from '@/services/auth-sessions'

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withUser(async (user) => revokeSession(user.id, id))
}

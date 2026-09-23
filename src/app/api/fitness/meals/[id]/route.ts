// Meal entry delete (undo a mis-logged item). Returns the day payload so the
// Fuel panel updates in one round-trip.

import { withUser } from '@/lib/api-helpers'
import { deleteMealEntry } from '@/services/fitness'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => deleteMealEntry(user.id, id, user.timezone))
}

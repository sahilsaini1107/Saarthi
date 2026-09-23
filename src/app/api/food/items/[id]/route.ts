// One configurable food: edit its macros, or remove it from the library.
// DELETE ?force=1 acknowledges that recipes using it will change.

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteFood, updateFood } from '@/services/food'

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  brand: z.string().max(60).nullable().optional(),
  unit: z.enum(['g', 'ml', 'piece']).optional(),
  basisQty: z.number().int().min(1).max(1000).optional(),
  caloriesMilliKcal: z.number().int().min(0).max(1_000_000).optional(),
  proteinMilliG: z.number().int().min(0).max(100_000).optional(),
  carbsMilliG: z.number().int().min(0).max(100_000).optional(),
  fatMilliG: z.number().int().min(0).max(100_000).optional(),
  fiberMilliG: z.number().int().min(0).max(100_000).nullable().optional(),
  category: z.string().max(20).optional(),
  isVeg: z.boolean().optional(),
  tier: z.string().max(1).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateFood(user.id, id, await parseBody(req, patchSchema)))
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const force = new URL(req.url).searchParams.get('force') === '1'
  return withUser(async (user) => {
    await deleteFood(user.id, id, force)
    return { ok: true }
  })
}

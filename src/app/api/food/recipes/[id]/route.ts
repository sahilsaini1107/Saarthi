// One saved plate. PUT replaces its ingredients wholesale (the list is small).

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteRecipe, getRecipe, updateRecipe } from '@/services/food'

const recipeSchema = z.object({
  name: z.string().min(1).max(80),
  emoji: z.string().max(8).optional(),
  note: z.string().max(300).nullable().optional(),
  servings: z.number().int().min(1).max(50).optional(),
  items: z
    .array(z.object({ foodItemId: z.string().min(1), quantityMilli: z.number().int().min(1).max(10_000_000) }))
    .min(1)
    .max(40),
})

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => getRecipe(user.id, id))
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateRecipe(user.id, id, await parseBody(req, recipeSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteRecipe(user.id, id)
    return { ok: true }
  })
}

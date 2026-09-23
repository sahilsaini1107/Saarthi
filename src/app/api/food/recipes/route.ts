// Saved plates ("thali"). Totals are computed from the items on every read,
// never stored — fixing a food's macros fixes every plate built on it.

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createRecipe, listRecipes } from '@/services/food'

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

export async function GET() {
  return withUser(async (user) => listRecipes(user.id))
}

export async function POST(req: Request) {
  return withUser(async (user) => createRecipe(user.id, await parseBody(req, recipeSchema)))
}

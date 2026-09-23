// Configurable foods. GET lists (optionally filtered); POST adds one.

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createFood, listFoods } from '@/services/food'

/** Macros are milli-units per `basisQty` of `unit` (default: per 100 g). */
const foodSchema = z.object({
  name: z.string().min(1).max(80),
  brand: z.string().max(60).nullable().optional(),
  unit: z.enum(['g', 'ml', 'piece']).optional(),
  basisQty: z.number().int().min(1).max(1000).optional(),
  caloriesMilliKcal: z.number().int().min(0).max(1_000_000),
  proteinMilliG: z.number().int().min(0).max(100_000),
  carbsMilliG: z.number().int().min(0).max(100_000),
  fatMilliG: z.number().int().min(0).max(100_000),
  fiberMilliG: z.number().int().min(0).max(100_000).nullable().optional(),
  category: z.string().max(20).optional(),
  isVeg: z.boolean().optional(),
  tier: z.string().max(1).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
})

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  return withUser(async (user) =>
    listFoods(user.id, {
      q: p.get('q') ?? undefined,
      category: p.get('category') ?? undefined,
      vegOnly: p.get('veg') === '1',
    }),
  )
}

export async function POST(req: Request) {
  return withUser(async (user) => createFood(user.id, await parseBody(req, foodSchema)))
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteBudget, updateBudget } from '@/services/budgets'

const updateSchema = z.object({ amountPaise: z.number().int().positive() })

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateBudget(user.id, id, (await parseBody(req, updateSchema)).amountPaise))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteBudget(user.id, id)
    return { ok: true }
  })
}

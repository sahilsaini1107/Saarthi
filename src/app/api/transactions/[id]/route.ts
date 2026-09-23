import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteTransaction, updateTransaction } from '@/services/transactions'

const updateSchema = z.object({
  accountId: z.string().min(1).optional(),
  categoryId: z.string().nullable().optional(),
  amountPaise: z.number().int().positive().optional(),
  direction: z.enum(['in', 'out']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).nullable().optional(),
  tripId: z.string().nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateTransaction(user.id, id, await parseBody(req, updateSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteTransaction(user.id, id)
    return { ok: true }
  })
}

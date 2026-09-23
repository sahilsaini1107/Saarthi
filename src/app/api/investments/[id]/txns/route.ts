import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { recordTxn } from '@/services/investments'

const createSchema = z.object({
  kind: z.enum(['buy', 'sell', 'dividend', 'interest']),
  quantity: z.number().positive().max(1e12).optional(),
  amountPaise: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(200).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    const body = await parseBody(req, createSchema)
    return recordTxn(user.id, id, {
      kind: body.kind,
      quantity: body.quantity ?? 0,
      amountPaise: body.amountPaise,
      date: body.date,
      note: body.note,
    })
  })
}

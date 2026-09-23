import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteBill, payBill, updateBill } from '@/services/bills'
import { todayISO } from '@/lib/date'

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  amountPaise: z.number().int().positive().optional(),
  frequency: z.enum(['monthly', 'quarterly', 'annual', 'custom_days']).optional(),
  customDays: z.number().int().min(1).max(365).nullable().optional(),
  nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  remindDaysBefore: z.number().int().min(0).max(30).optional(),
  categoryId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  active: z.boolean().optional(),
})

const paySchema = z.object({ dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateBill(user.id, id, await parseBody(req, updateSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteBill(user.id, id)
    return { ok: true }
  })
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    const { dueDate } = await parseBody(req, paySchema)
    return payBill(user.id, id, dueDate, todayISO(user.timezone))
  })
}

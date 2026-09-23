import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createBill, billsInMonth, listBills } from '@/services/bills'

const createSchema = z.object({
  name: z.string().min(1).max(80),
  amountPaise: z.number().int().positive(),
  frequency: z.enum(['monthly', 'quarterly', 'annual', 'custom_days']),
  customDays: z.number().int().min(1).max(365).nullable().optional(),
  nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remindDaysBefore: z.number().int().min(0).max(30).optional(),
  categoryId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
})

export async function GET(req: Request) {
  const month = new URL(req.url).searchParams.get('month')
  return withUser(async (user) => {
    if (month) return billsInMonth(user.id, month)
    return listBills(user.id, user.timezone)
  })
}

export async function POST(req: Request) {
  return withUser(async (user) => createBill(user.id, await parseBody(req, createSchema)))
}

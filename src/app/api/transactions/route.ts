import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createTransaction, listTransactions } from '@/services/transactions'

const createSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  amountPaise: z.number().int().positive(),
  direction: z.enum(['in', 'out']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  note: z.string().max(500).nullable().optional(),
  source: z.enum(['manual', 'voice', 'ocr', 'csv', 'whatsapp']).optional(),
  tripId: z.string().nullable().optional(),
  clientKey: z.string().min(8).max(64).nullable().optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const qp = url.searchParams
  return withUser((user) =>
    listTransactions(user.id, {
      accountId: qp.get('accountId') ?? undefined,
      categoryId: qp.get('categoryId') ?? undefined,
      tripId: qp.get('tripId') ?? undefined,
      month: qp.get('month') ?? undefined,
      direction: (qp.get('direction') as 'in' | 'out' | null) ?? undefined,
      limit: qp.get('limit') ? Number(qp.get('limit')) : undefined,
      offset: qp.get('offset') ? Number(qp.get('offset')) : undefined,
    }),
  )
}

export async function POST(req: Request) {
  return withUser(async (user) => createTransaction(user.id, await parseBody(req, createSchema)))
}

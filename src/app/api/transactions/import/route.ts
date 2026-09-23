import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { importTransactions } from '@/services/transactions'

const rowSchema = z.object({
  amountPaise: z.number().int(),
  direction: z.enum(['in', 'out']),
  date: z.string(),
  note: z.string().max(500).nullable().optional(),
  categoryId: z.string().nullable().optional(),
})

const schema = z.object({
  accountId: z.string().min(1),
  // only ledger-valid sources make sense here; defaults to csv
  source: z.enum(['csv', 'manual']).optional(),
  rows: z.array(rowSchema).min(1).max(500),
})

export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = await parseBody(req, schema)
    return importTransactions(user.id, {
      accountId: body.accountId,
      source: body.source ?? 'csv',
      rows: body.rows,
    })
  })
}

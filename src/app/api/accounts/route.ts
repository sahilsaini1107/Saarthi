import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createAccount, listAccounts } from '@/services/accounts'
import { JOB_KEYS } from '@/lib/planner'

const createSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(['savings', 'cash', 'credit_card']),
  balancePaise: z.number().int().nonnegative().optional(),
  creditLimitPaise: z.number().int().positive().nullable().optional(),
  statementDay: z.number().int().min(1).max(31).nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  job: z.enum(JOB_KEYS).nullable().optional(),
  color: z.string().optional(),
})

export async function GET() {
  return withUser((user) => listAccounts(user.id))
}

export async function POST(req: Request) {
  return withUser(async (user) => createAccount(user.id, await parseBody(req, createSchema)))
}

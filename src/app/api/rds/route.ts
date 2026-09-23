import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createRd, listRds } from '@/services/rds'
import { JOB_KEYS } from '@/lib/planner'

const createSchema = z.object({
  bank: z.string().min(1).max(80),
  installmentPaise: z.number().int().positive(),
  ratePct: z.number().positive().max(100),
  tenureMonths: z.number().int().min(1).max(360),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compounding: z.enum(['simple', 'annual', 'quarterly', 'monthly']),
  autoRenew: z.boolean().optional(),
  autoBill: z.boolean().optional(),
  job: z.enum(JOB_KEYS).nullable().optional(),
})

export async function GET() {
  return withUser((user) => listRds(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => createRd(user.id, await parseBody(req, createSchema)))
}

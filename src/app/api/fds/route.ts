import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createFd, listFds } from '@/services/fds'
import { JOB_KEYS } from '@/lib/planner'

const createSchema = z.object({
  bank: z.string().min(1).max(80),
  principalPaise: z.number().int().positive(),
  ratePct: z.number().positive().max(100),
  tenureMonths: z.number().int().min(1).max(360),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compounding: z.enum(['simple', 'annual', 'half_yearly', 'quarterly', 'monthly']),
  autoRenew: z.boolean().optional(),
  job: z.enum(JOB_KEYS).nullable().optional(),
})

export async function GET() {
  return withUser((user) => listFds(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => createFd(user.id, await parseBody(req, createSchema)))
}

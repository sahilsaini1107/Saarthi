import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createInvestment, listInvestments } from '@/services/investments'
import { COUPON_FREQUENCIES, CREDIT_RATINGS, JOB_KEYS } from '@/lib/planner'

const createSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(['stock', 'bond', 'crypto', 'mutual_fund', 'etf', 'gold', 'reit', 'ppf', 'nps', 'other']),
  symbol: z.string().max(24).nullable().optional(),
  platform: z.string().max(60).nullable().optional(),
  job: z.enum(JOB_KEYS).nullable().optional(),
  ratePct: z.number().positive().max(100).nullable().optional(),
  creditRating: z.enum(CREDIT_RATINGS).nullable().optional(),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  couponFrequency: z.enum(COUPON_FREQUENCIES).nullable().optional(),
  currentPricePaise: z.number().int().positive(),
  notes: z.string().max(500).nullable().optional(),
  openingBuy: z
    .object({
      quantity: z.number().positive().max(1e12),
      amountPaise: z.number().int().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
})

export async function GET() {
  return withUser((user) => listInvestments(user.id))
}

export async function POST(req: Request) {
  return withUser(async (user) => createInvestment(user.id, await parseBody(req, createSchema), user.timezone))
}

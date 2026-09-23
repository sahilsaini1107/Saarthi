import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteInvestment, updateInvestment } from '@/services/investments'
import { COUPON_FREQUENCIES, CREDIT_RATINGS, JOB_KEYS } from '@/lib/planner'

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  type: z.enum(['stock', 'bond', 'crypto', 'mutual_fund', 'etf', 'gold', 'reit', 'ppf', 'nps', 'other']).optional(),
  symbol: z.string().max(24).nullable().optional(),
  platform: z.string().max(60).nullable().optional(),
  job: z.enum(JOB_KEYS).nullable().optional(),
  ratePct: z.number().positive().max(100).nullable().optional(),
  creditRating: z.enum(CREDIT_RATINGS).nullable().optional(),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  couponFrequency: z.enum(COUPON_FREQUENCIES).nullable().optional(),
  currentPricePaise: z.number().int().positive().optional(),
  notes: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateInvestment(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteInvestment(user.id, id)
    return { ok: true }
  })
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deletePolicy, updatePolicy } from '@/services/insurance'

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(['term', 'health', 'life', 'vehicle', 'asset', 'other']).optional(),
  insurer: z.string().min(1).max(120).optional(),
  policyNumber: z.string().max(80).nullable().optional(),
  sumAssuredPaise: z.number().int().positive().optional(),
  premiumPaise: z.number().int().positive().optional(),
  premiumFrequency: z.enum(['monthly', 'quarterly', 'half_yearly', 'annual']).optional(),
  nextPremiumDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  nominee: z.string().max(80).nullable().optional(),
  status: z.enum(['active', 'lapsed', 'closed']).optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withUser(async (user) => updatePolicy(user.id, id, await parseBody(req, patchSchema)))
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deletePolicy(user.id, id)
    return { ok: true }
  })
}

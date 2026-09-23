import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteRd, updateRd } from '@/services/rds'
import { JOB_KEYS } from '@/lib/planner'

const updateSchema = z.object({
  bank: z.string().min(1).max(80).optional(),
  ratePct: z.number().positive().max(100).optional(),
  installmentPaise: z.number().int().positive().optional(),
  autoRenew: z.boolean().optional(),
  status: z.enum(['active', 'matured', 'closed']).optional(),
  job: z.enum(JOB_KEYS).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateRd(user.id, id, await parseBody(req, updateSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteRd(user.id, id)
    return { ok: true }
  })
}

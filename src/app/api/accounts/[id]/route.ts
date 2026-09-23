import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteAccount, updateAccount } from '@/services/accounts'
import { JOB_KEYS } from '@/lib/planner'

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().optional(),
  archived: z.boolean().optional(),
  creditLimitPaise: z.number().int().positive().nullable().optional(),
  statementDay: z.number().int().min(1).max(31).nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  job: z.enum(JOB_KEYS).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateAccount(user.id, id, await parseBody(req, updateSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteAccount(user.id, id)
    return { ok: true }
  })
}

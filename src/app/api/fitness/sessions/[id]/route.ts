import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteSession, sessionDetail, updateSession } from '@/services/fitness'

const patchSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  durationMin: z.number().int().min(1).max(1440).optional(),
  note: z.string().max(500).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => sessionDetail(user.id, id, user.timezone))
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateSession(user.id, id, await parseBody(req, patchSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteSession(user.id, id)
    return { ok: true }
  })
}

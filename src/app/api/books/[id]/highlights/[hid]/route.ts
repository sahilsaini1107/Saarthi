import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteHighlight, updateHighlight } from '@/services/reading'

const patchSchema = z.object({
  note: z.string().max(1000).nullable().optional(),
  color: z.string().max(10).optional(),
})

type Ctx = { params: Promise<{ id: string; hid: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, hid } = await ctx.params
  return withUser(async (user) => updateHighlight(user.id, id, hid, await parseBody(req, patchSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, hid } = await ctx.params
  return withUser(async (user) => {
    await deleteHighlight(user.id, id, hid)
    return { ok: true }
  })
}

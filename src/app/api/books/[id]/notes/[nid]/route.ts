import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteNote, updateNote } from '@/services/reading'

const patchSchema = z.object({
  text: z.string().min(1).max(2000).optional(),
  page: z.number().int().min(1).max(200000).optional(),
})

type Ctx = { params: Promise<{ id: string; nid: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, nid } = await ctx.params
  return withUser(async (user) => updateNote(user.id, id, nid, await parseBody(req, patchSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, nid } = await ctx.params
  return withUser(async (user) => {
    await deleteNote(user.id, id, nid)
    return { ok: true }
  })
}

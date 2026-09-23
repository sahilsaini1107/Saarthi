import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteEntry, updateEntry } from '@/services/journal'

const updateSchema = z.object({
  title: z.string().max(120).nullable().optional(),
  content: z.string().min(1).max(20_000).optional(),
  mood: z.enum(['great', 'good', 'okay', 'low', 'bad']).nullable().optional(),
  tags: z.array(z.string().max(48)).max(12).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateEntry(user.id, id, await parseBody(req, updateSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteEntry(user.id, id)
    return { ok: true }
  })
}

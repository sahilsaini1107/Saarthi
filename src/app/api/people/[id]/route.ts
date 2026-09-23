import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deletePerson, updatePerson } from '@/services/people'

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  category: z.string().max(20).optional(),
  importance: z.number().int().min(1).max(3).optional(),
  cadenceDays: z.number().int().min(1).max(3650).nullable().optional(),
  role: z.string().max(120).nullable().optional(),
  howMet: z.string().max(200).nullable().optional(),
  contact: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  tags: z.string().max(200).nullable().optional(),
  archived: z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updatePerson(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deletePerson(user.id, id)
    return { ok: true }
  })
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteProduct, updateProduct } from '@/services/skin'

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  brand: z.string().max(80).nullable().optional(),
  kind: z.enum(['cleanser', 'toner', 'serum', 'moisturizer', 'sunscreen', 'eye_cream', 'exfoliant', 'mask', 'other']).optional(),
  openedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  paoMonths: z.number().int().min(1).max(120).nullable().optional(),
  status: z.enum(['active', 'finished', 'discarded']).optional(),
  notes: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateProduct(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => deleteProduct(user.id, id, user.timezone))
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteAsset, updateAsset } from '@/services/assets'
import { JOB_KEYS } from '@/lib/planner'

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  category: z.enum(['real_estate', 'vehicle', 'machinery', 'gold_jewellery', 'electronics', 'furniture', 'art', 'other']).optional(),
  currentValuePaise: z.number().int().positive().optional(),
  purchaseValuePaise: z.number().int().positive().nullable().optional(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  job: z.enum(JOB_KEYS).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateAsset(user.id, id, await parseBody(req, updateSchema)))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteAsset(user.id, id)
    return { ok: true }
  })
}

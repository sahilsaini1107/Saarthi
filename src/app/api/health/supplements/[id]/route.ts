import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { updateSupplement } from '@/services/supplements'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  dose: z.string().max(80).nullable().optional(),
  timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'bedtime', 'anytime']).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateSupplement(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

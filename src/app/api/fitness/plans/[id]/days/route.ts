import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addPlanDay } from '@/services/fitness'

const daySchema = z.object({
  label: z.string().trim().min(1).max(40),
  focus: z.string().max(80).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => addPlanDay(user.id, id, await parseBody(req, daySchema)))
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { checkInSupplement } from '@/services/supplements'

const checkInSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taken: z.boolean(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    const input = await parseBody(req, checkInSchema)
    return checkInSupplement(user.id, id, input.date, input.taken, user.timezone)
  })
}

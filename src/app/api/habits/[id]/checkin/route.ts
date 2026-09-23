import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { checkIn } from '@/services/habits'

const checkinSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

type Ctx = { params: Promise<{ id: string }> }

/** Toggle today's (or any date's) check-in. Returns the fresh streak. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    const { date } = await parseBody(req, checkinSchema)
    return checkIn(user.id, id, date, user.timezone)
  })
}

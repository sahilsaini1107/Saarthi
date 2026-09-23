import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { reviseTopic } from '@/services/study'

const reviseSchema = z.object({
  outcome: z.enum(['revised', 'forgot']),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    const { outcome } = await parseBody(req, reviseSchema)
    return reviseTopic(user.id, id, outcome, user.timezone)
  })
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { payPremium } from '@/services/insurance'

const paySchema = z.object({
  accountId: z.string().min(1).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  note: z.string().max(200).nullable().optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withUser(async (user) => payPremium(user.id, id, await parseBody(req, paySchema)))
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteBudget, listBudgets, updateBudget, upsertBudget } from '@/services/budgets'

const upsertSchema = z.object({
  categoryId: z.string().min(1),
  amountPaise: z.number().int().positive(),
})

export async function GET() {
  return withUser((user) => listBudgets(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    const { categoryId, amountPaise } = await parseBody(req, upsertSchema)
    return upsertBudget(user.id, categoryId, amountPaise)
  })
}

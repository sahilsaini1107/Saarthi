import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createCategory, listCategories } from '@/services/categories'

const createSchema = z.object({
  name: z.string().min(1).max(40),
  emoji: z.string().max(8).optional(),
  color: z.string().optional(),
  kind: z.enum(['expense', 'income']),
})

export async function GET() {
  return withUser((user) => listCategories(user.id))
}

export async function POST(req: Request) {
  return withUser(async (user) => createCategory(user.id, await parseBody(req, createSchema)))
}

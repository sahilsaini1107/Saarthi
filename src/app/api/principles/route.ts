import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createPrinciple, listPrinciples } from '@/services/principles'

export const principleSchema = z.object({
  title: z.string().min(1).max(120),
  detail: z.string().max(500).nullable().optional(),
  category: z.string().max(20).optional(),
  active: z.boolean().optional(),
})

export async function GET(req: Request) {
  const includeArchived = new URL(req.url).searchParams.get('archived') === 'true'
  return withUser(async (user) => listPrinciples(user.id, user.timezone, { includeArchived }))
}

export async function POST(req: Request) {
  return withUser(async (user) => createPrinciple(user.id, await parseBody(req, principleSchema), user.timezone))
}

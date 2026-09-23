import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createSkill, listSkills } from '@/services/skills'

export const skillSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.string().max(20).optional(),
  targetLevel: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(500).nullable().optional(),
  status: z.string().max(20).optional(),
})

export async function GET(req: Request) {
  const includeArchived = new URL(req.url).searchParams.get('archived') === 'true'
  return withUser(async (user) => listSkills(user.id, user.timezone, { includeArchived }))
}

export async function POST(req: Request) {
  return withUser(async (user) => createSkill(user.id, await parseBody(req, skillSchema), user.timezone))
}

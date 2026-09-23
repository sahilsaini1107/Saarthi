import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createPerson, listPeople } from '@/services/people'

export const personSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.string().max(20).optional(),
  importance: z.number().int().min(1).max(3).optional(),
  cadenceDays: z.number().int().min(1).max(3650).nullable().optional(),
  role: z.string().max(120).nullable().optional(),
  howMet: z.string().max(200).nullable().optional(),
  contact: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  tags: z.string().max(200).nullable().optional(),
  archived: z.boolean().optional(),
})

export async function GET(req: Request) {
  const includeArchived = new URL(req.url).searchParams.get('archived') === 'true'
  return withUser(async (user) => listPeople(user.id, user.timezone, { includeArchived }))
}

export async function POST(req: Request) {
  return withUser(async (user) => createPerson(user.id, await parseBody(req, personSchema), user.timezone))
}

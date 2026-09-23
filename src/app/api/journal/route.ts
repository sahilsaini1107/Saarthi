import { z } from 'zod'
import { HttpError, parseBody, withUser } from '@/lib/api-helpers'
import { createEntry, listEntries } from '@/services/journal'

export const journalSchema = z.object({
  title: z.string().max(120).nullable().optional(),
  content: z.string().min(1).max(20_000),
  mood: z.enum(['great', 'good', 'okay', 'low', 'bad']).nullable().optional(),
  tags: z.array(z.string().max(48)).max(12).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const querySchema = z.object({
  q: z.string().max(120).optional(),
  mood: z.enum(['great', 'good', 'okay', 'low', 'bad']).optional(),
  tag: z.string().max(48).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams)
  return withUser(async (user) => {
    const parsed = querySchema.safeParse(params)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
      throw new HttpError(msg || 'Invalid query', 422)
    }
    return listEntries(user.id, user.timezone, parsed.data)
  })
}

export async function POST(req: Request) {
  return withUser(async (user) => createEntry(user.id, await parseBody(req, journalSchema)))
}

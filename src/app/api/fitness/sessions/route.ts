import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createSession, listSessions } from '@/services/fitness'

const createSchema = z.object({
  planDayId: z.string().min(1).optional(),
  label: z.string().trim().max(60).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(req: Request) {
  const take = Number(new URL(req.url).searchParams.get('take') ?? '30')
  return withUser(async (user) => listSessions(user.id, Number.isFinite(take) ? take : 30))
}

export async function POST(req: Request) {
  return withUser(async (user) => createSession(user.id, await parseBody(req, createSchema), user.timezone))
}

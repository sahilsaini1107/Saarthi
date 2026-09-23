import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createTrip, listTrips } from '@/services/trips'

const createSchema = z.object({
  name: z.string().min(1).max(80),
  emoji: z.string().max(8).optional(),
  destination: z.string().max(80).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  budgetPaise: z.number().int().positive().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
})

export async function GET() {
  return withUser((user) => listTrips(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => createTrip(user.id, await parseBody(req, createSchema)))
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createHabit, listHabits } from '@/services/habits'

export const habitSchema = z.object({
  name: z.string().min(1).max(60),
  emoji: z.string().min(1).max(8).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  weekdays: z.string().regex(/^[01]{7}$/),
  buildingDays: z.number().int().min(1).max(365).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
})

export async function GET(req: Request) {
  const includeArchived = new URL(req.url).searchParams.get('archived') === 'true'
  return withUser(async (user) => listHabits(user.id, user.timezone, { includeArchived }))
}

export async function POST(req: Request) {
  return withUser(async (user) => createHabit(user.id, await parseBody(req, habitSchema), user.timezone))
}

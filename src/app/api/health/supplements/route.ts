import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createSupplement, listSupplements } from '@/services/supplements'

export const supplementSchema = z.object({
  name: z.string().min(1).max(100),
  dose: z.string().max(80).nullable().optional(),
  timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'bedtime', 'anytime']).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function GET() {
  return withUser((user) => listSupplements(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => createSupplement(user.id, await parseBody(req, supplementSchema), user.timezone))
}

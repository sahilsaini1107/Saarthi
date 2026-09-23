import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { skinCheckIn } from '@/services/skin'

export const skinCheckInSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(['am', 'pm']),
  done: z.boolean(),
})

export async function POST(req: Request) {
  return withUser(async (user) => skinCheckIn(user.id, await parseBody(req, skinCheckInSchema), user.timezone))
}

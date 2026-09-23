import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { updateUser } from '@/services/user'

const schema = z.object({
  name: z.string().min(1).max(60).optional(),
  timezone: z.string().min(1).max(60).optional(),
  currency: z.string().min(1).max(8).optional(),
})

export async function PATCH(req: Request) {
  return withUser(async (user) => updateUser(user.id, await parseBody(req, schema)))
}

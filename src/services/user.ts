import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { isValidTimezone } from '@/lib/date'

export async function updateUser(
  userId: string,
  input: { name?: string; timezone?: string; currency?: string },
) {
  if (input.timezone !== undefined && !isValidTimezone(input.timezone)) {
    throw new HttpError('Unknown timezone identifier', 422)
  }
  const user = await db.user.update({
    where: { id: userId },
    data: {
      name: input.name?.trim() || undefined,
      timezone: input.timezone?.trim() || undefined,
      currency: input.currency?.trim() || undefined,
    },
  })
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    currency: user.currency,
    timezone: user.timezone,
  }
}

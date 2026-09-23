import { fail, ok } from '@/lib/api-helpers'
import { getActiveToken, getSessionUser } from '@/services/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Not signed in', 401)
  // token echoes back so the client can (re)store it for the Bearer fallback.
  return ok({
    id: user.id,
    email: user.email,
    name: user.name,
    currency: user.currency,
    timezone: user.timezone,
    token: await getActiveToken(),
  })
}

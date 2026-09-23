import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, parseBody } from '@/lib/api-helpers'
import { clientIpFromRequest, checkAuthRateLimit, pruneRateLimitStores } from '@/lib/rate-limit'
import { login, SESSION_COOKIE, sessionCookieOptions } from '@/services/auth'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required').max(128),
})

export async function POST(req: Request) {
  try {
    pruneRateLimitStores()
    const limit = checkAuthRateLimit(`login:${clientIpFromRequest(req)}`)
    if (!limit.allowed) return tooMany(limit.retryAfterMs)
    const body = await parseBody(req, schema)
    const { user, token } = await login(body.email, body.password)
    const res = NextResponse.json({ data: { user, token } })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req))
    return res
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400
    return fail(err instanceof Error ? err.message : 'Login failed', status)
  }
}

function tooMany(retryAfterMs: number) {
  const sec = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return Response.json(
    { error: { message: `Too many attempts — try again in ${sec > 90 ? `${Math.ceil(sec / 60)} minutes` : `${sec} seconds`}.` } },
    { status: 429, headers: { 'Retry-After': String(sec) } },
  )
}

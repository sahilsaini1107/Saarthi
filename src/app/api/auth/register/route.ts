import { NextResponse } from 'next/server'
import { z } from 'zod'
import { failFromError, parseBody } from '@/lib/api-helpers'
import { clientIpFromRequest, checkAuthRateLimit, pruneRateLimitStores } from '@/lib/rate-limit'
import { register, SESSION_COOKIE, sessionCookieOptions } from '@/services/auth'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must be at most 128 characters'),
  name: z.string().min(1, 'Name is required').max(60),
})

export async function POST(req: Request) {
  try {
    pruneRateLimitStores()
    const limit = checkAuthRateLimit(`register:${clientIpFromRequest(req)}`)
    if (!limit.allowed) return tooMany(limit.retryAfterMs)
    const body = await parseBody(req, schema)
    const { user, token } = await register(body.email, body.password, body.name)
    const res = NextResponse.json({ data: { user, token } }, { status: 201 })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req))
    return res
  } catch (err) {
    return failFromError(err, 'Registration failed')
  }
}

function tooMany(retryAfterMs: number) {
  const sec = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return Response.json(
    { error: { message: `Too many attempts — try again in ${sec > 90 ? `${Math.ceil(sec / 60)} minutes` : `${sec} seconds`}.` } },
    { status: 429, headers: { 'Retry-After': String(sec) } },
  )
}

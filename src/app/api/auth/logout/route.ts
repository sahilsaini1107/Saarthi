import { NextResponse } from 'next/server'
import { getActiveToken, logout, SESSION_COOKIE, sessionCookieOptions } from '@/services/auth'

export async function POST(req: Request) {
  await logout(await getActiveToken())
  const res = NextResponse.json({ data: { ok: true } })
  // Clear with matching attributes so the browser actually drops the cookie.
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(req), maxAge: 0 })
  return res
}

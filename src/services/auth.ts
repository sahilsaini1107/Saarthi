// Auth: email+password with scrypt hashing and DB-backed sessions.
// Sessions persist 30 days via an httpOnly cookie. (Decision #6, PROGRESS.md)

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import type { User } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { seedDefaultCategories } from '@/services/categories'
import { UserDTO } from '@/lib/types'

export const SESSION_COOKIE = 'saarthi_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function toDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    currency: user.currency,
    timezone: user.timezone,
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await db.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  })
  return token
}

export async function register(email: string, password: string, name: string): Promise<{ user: UserDTO; token: string }> {
  const normalized = email.trim().toLowerCase()
  const existing = await db.user.findUnique({ where: { email: normalized } })
  if (existing) throw new HttpError('An account with this email already exists', 409)
  if (password.length < 8) throw new HttpError('Password must be at least 8 characters', 422)

  const user = await db.user.create({
    data: { email: normalized, passwordHash: hashPassword(password), name: name.trim() || 'Friend' },
  })
  await seedDefaultCategories(user.id) // task 1.4: defaults seeded on first login
  return { user: toDTO(user), token: await createSession(user.id) }
}

export async function login(email: string, password: string): Promise<{ user: UserDTO; token: string }> {
  const normalized = email.trim().toLowerCase()
  const user = await db.user.findUnique({ where: { email: normalized } })
  // Same error either way — do not reveal which emails exist.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError('Incorrect email or password', 401)
  }
  return { user: toDTO(user), token: await createSession(user.id) }
}

export async function logout(token: string | undefined): Promise<void> {
  if (token) await db.session.deleteMany({ where: { token } })
}

export async function getUserByToken(token: string | undefined): Promise<User | null> {
  if (!token) return null
  const session = await db.session.findUnique({ where: { token }, include: { user: true } })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }
  return session.user
}

/** Token the request is authenticated with: Authorization header first, cookie as fallback. */
export async function getActiveToken(): Promise<string | undefined> {
  const h = await headers()
  const bearer = h.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (bearer) return bearer
  const jar = await cookies()
  return jar.get(SESSION_COOKIE)?.value
}

/**
 * Resolves the session user inside a route handler / server context.
 * Accepts an Authorization: Bearer token first — the app is embedded in a
 * cross-site preview iframe where third-party cookie policies (Safari ITP,
 * Chrome's phase-out) silently drop SameSite=Lax cookies. The header works
 * in every context; the cookie remains the fallback for plain top-level use.
 */
export async function getSessionUser(): Promise<User | null> {
  return getUserByToken(await getActiveToken())
}

/**
 * Cookie attributes depend on how the app is reached. Behind the HTTPS
 * preview proxy we must use SameSite=None; Secure; Partitioned — Lax cookies
 * are never sent inside a cross-site iframe. Plain-http localhost dev keeps
 * Lax. (Decision #9, PROGRESS.md)
 */
export function sessionCookieOptions(req?: Request) {
  const proto = req?.headers.get('x-forwarded-proto') ?? (req ? new URL(req.url).protocol.replace(':', '') : 'http')
  const isHttps = proto === 'https' || process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    partitioned: isHttps,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  }
}

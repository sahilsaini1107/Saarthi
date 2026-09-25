import { NextResponse } from 'next/server'
import type { User } from '@prisma/client'
import { ZodType, output } from 'zod'
import { getSessionUser } from '@/services/auth'

export class HttpError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status })
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: { message } }, { status })
}

/**
 * Turn server failures into useful, non-sensitive API errors.
 *
 * Prisma's initialization errors include the generated bundle path and the
 * database hostname. Returning that message from auth routes both leaks
 * implementation details and leaves the user with nothing actionable.
 */
export function failFromError(err: unknown, fallback = 'Something went wrong') {
  if (err instanceof HttpError) return fail(err.message, err.status)

  const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : ''
  const message = err instanceof Error ? err.message : ''
  const databaseUnavailable =
    code === 'P1001' ||
    message.includes("Can't reach database server") ||
    message.includes('Unable to connect to the database')

  if (databaseUnavailable) {
    console.error('[database unavailable]', err)
    return fail('Saarthi cannot reach its database right now. Check DATABASE_URL and make sure the database is running, then try again.', 503)
  }

  console.error('[api]', err)
  return fail(fallback, 500)
}

/** Route-handler wrapper: resolves the session user or 401s. */
export async function withUser<T>(handler: (user: User) => Promise<T>) {
  try {
    const user = await getSessionUser()
    if (!user) return fail('Not signed in', 401)
    const result = await handler(user)
    return ok(result)
  } catch (err) {
    return failFromError(err)
  }
}

/** Parse + validate a JSON body with zod, throwing a 422 on bad input. */
export async function parseBody<S extends ZodType>(req: Request, schema: S): Promise<output<S>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new HttpError('Invalid JSON body', 400)
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
    throw new HttpError(msg || 'Invalid input', 422)
  }
  return parsed.data
}

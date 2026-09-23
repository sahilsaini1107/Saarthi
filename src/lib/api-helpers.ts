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

/** Route-handler wrapper: resolves the session user or 401s. */
export async function withUser<T>(handler: (user: User) => Promise<T>) {
  const user = await getSessionUser()
  if (!user) return fail('Not signed in', 401)
  try {
    const result = await handler(user)
    return ok(result)
  } catch (err) {
    if (err instanceof HttpError) return fail(err.message, err.status)
    console.error('[api]', err)
    return fail('Something went wrong', 500)
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

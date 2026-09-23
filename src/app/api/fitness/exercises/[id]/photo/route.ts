// Exercise photo download (GET, binary) — no withUser wrap so the bytes are
// not JSON-enclosed (same convention as book/content file routes).

import { NextResponse } from 'next/server'
import { fail } from '@/lib/api-helpers'
import { getSessionUser } from '@/services/auth'
import { getExercisePhoto } from '@/services/fitness'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const user = await getSessionUser()
  if (!user) return fail('Not signed in', 401)
  try {
    const photo = await getExercisePhoto(user.id, id)
    const body = Buffer.from(photo.data)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': photo.mime,
        'Content-Length': String(body.length),
        'Content-Disposition': `inline; filename="${encodeURIComponent(photo.fileName)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    if (err instanceof Error && 'status' in err) return fail(err.message, (err as { status: number }).status)
    console.error('[exercise-photo]', err)
    return fail('Could not load photo', 500)
  }
}

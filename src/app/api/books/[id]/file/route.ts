// Book file upload (POST, base64 JSON) + in-app reading download (GET, binary).
// GET does NOT use withUser because the raw file must not be wrapped in {data}.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, parseBody, withUser } from '@/lib/api-helpers'
import { getSessionUser } from '@/services/auth'
import { getBookFile, saveBookFile } from '@/services/reading'

const uploadSchema = z.object({
  fileName: z.string().min(1).max(200),
  mime: z.string().min(3).max(100),
  dataBase64: z.string().min(1),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => saveBookFile(user.id, id, await parseBody(req, uploadSchema), user.timezone))
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const user = await getSessionUser()
  if (!user) return fail('Not signed in', 401)
  try {
    const file = await getBookFile(user.id, id)
    const body = Buffer.from(file.data)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': file.mime,
        'Content-Length': String(body.length),
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    if (err instanceof Error && 'status' in err) return fail(err.message, (err as { status: number }).status)
    console.error('[book-file]', err)
    return fail('Could not load book file', 500)
  }
}

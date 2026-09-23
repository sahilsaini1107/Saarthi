// Exercise media (Phase 19): attach/replace a YouTube form video or a photo,
// or clear both. Photos ride as base64 JSON (books/content pattern).

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { clearExerciseMedia, setExerciseMedia } from '@/services/fitness'

const mediaSchema = z.object({
  youtubeUrl: z.string().max(1000).nullable().optional(),
  photo: z
    .object({
      fileName: z.string().min(1).max(200),
      mime: z.string().min(3).max(100),
      dataBase64: z.string().min(1),
    })
    .nullable()
    .optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await setExerciseMedia(user.id, id, await parseBody(req, mediaSchema))
    return { ok: true }
  })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await clearExerciseMedia(user.id, id)
    return { ok: true }
  })
}

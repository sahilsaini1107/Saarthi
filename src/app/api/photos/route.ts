// Progress photos (Phase 24). GET lists metadata; POST uploads one pose for a
// day (re-shooting the same pose on the same day replaces it).

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addPhoto, listPhotos } from '@/services/photos'

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pose: z.enum(['front', 'side', 'back', 'other']).optional(),
  fileName: z.string().max(200).optional(),
  mime: z.string().max(100),
  /** base64 image, capped just above the 8 MB byte limit the service enforces */
  dataBase64: z.string().min(16).max(12_000_000),
  note: z.string().max(300).nullable().optional(),
})

export async function GET() {
  return withUser(async (user) => listPhotos(user.id))
}

export async function POST(req: Request) {
  return withUser(async (user) => addPhoto(user.id, await parseBody(req, schema), user.timezone))
}

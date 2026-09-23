import { z } from 'zod'
import { fail, parseBody, withUser } from '@/lib/api-helpers'
import { parseReceiptCapture, suggestCategoryId } from '@/services/capture'
import { db } from '@/lib/db'
import { checkCaptureRateLimit, pruneRateLimitStores } from '@/lib/rate-limit'

const schema = z.object({
  /** base64-encoded JPEG/PNG of the receipt (no copy is stored — privacy) */
  imageBase64: z.string().min(64).max(12_000_000),
  suggestCategory: z.boolean().optional(),
})

export async function POST(req: Request) {
  return withUser(async (user) => {
    pruneRateLimitStores()
    const limit = checkCaptureRateLimit(`capture:${user.id}`)
    if (!limit.allowed) {
      const sec = Math.max(1, Math.ceil(limit.retryAfterMs / 1000))
      return fail(`Too many captures — try again in ${sec} seconds.`, 429)
    }
    const body = await parseBody(req, schema)
    const result = await parseReceiptCapture(user.timezone, { imageBase64: body.imageBase64 })
    if (body.suggestCategory) {
      const categories = await db.category.findMany({
        where: { userId: user.id },
        select: { id: true, name: true, kind: true },
      })
      return { ...result, categoryId: suggestCategoryId(result.note, result.direction, categories) }
    }
    return result
  })
}

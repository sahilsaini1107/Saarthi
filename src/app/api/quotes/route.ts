import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createQuote, listQuotes } from '@/services/reading'

export const quoteSchema = z.object({
  text: z.string().min(1).max(1000),
  author: z.string().max(120).nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  bookId: z.string().max(40).nullable().optional(),
  tags: z.string().max(200).nullable().optional(),
  favorite: z.boolean().optional(),
})

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const favorite = params.get('favorite')
  const tag = params.get('tag') ?? undefined
  const bookId = params.get('bookId') ?? undefined
  return withUser(async (user) =>
    listQuotes(user.id, {
      favorite: favorite === 'true' ? true : favorite === 'false' ? false : undefined,
      tag,
      bookId,
    }),
  )
}

export async function POST(req: Request) {
  return withUser(async (user) => createQuote(user.id, await parseBody(req, quoteSchema)))
}

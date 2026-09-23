import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createBook, listBooks } from '@/services/reading'

export const bookSchema = z.object({
  title: z.string().min(1).max(200),
  author: z.string().max(120).nullable().optional(),
  format: z.string().max(10).optional(),
  status: z.string().max(12).optional(),
  totalPages: z.number().int().min(0).max(20000).optional(),
  tags: z.string().max(200).nullable().optional(),
})

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status') ?? undefined
  return withUser(async (user) => listBooks(user.id, user.timezone, { status }))
}

export async function POST(req: Request) {
  return withUser(async (user) => createBook(user.id, await parseBody(req, bookSchema), user.timezone))
}

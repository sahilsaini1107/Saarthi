import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createContent, listContent } from '@/services/content'

export const contentSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  // video | article | link | file — auto-detected from the URL when omitted
  kind: z.string().max(20).optional(),
  url: z.string().max(1000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  tags: z.string().max(200).nullable().optional(),
  status: z.string().max(20).optional(),
  favorite: z.boolean().optional(),
})

export async function GET(req: Request) {
  const includeArchived = new URL(req.url).searchParams.get('archived') === 'true'
  return withUser(async (user) => listContent(user.id, user.timezone, { includeArchived }))
}

export async function POST(req: Request) {
  return withUser(async (user) => createContent(user.id, await parseBody(req, contentSchema), user.timezone))
}

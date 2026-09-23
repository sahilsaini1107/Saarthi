import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addNote } from '@/services/reading'

const noteSchema = z.object({
  page: z.number().int().min(1).max(200000),
  text: z.string().min(1).max(2000),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => addNote(user.id, id, await parseBody(req, noteSchema)))
}

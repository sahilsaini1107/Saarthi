import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { quoteFromHighlight } from '@/services/reading'

const schema = z.object({ highlightId: z.string().min(1).max(40) })

export async function POST(req: Request) {
  return withUser(async (user) => quoteFromHighlight(user.id, (await parseBody(req, schema)).highlightId))
}

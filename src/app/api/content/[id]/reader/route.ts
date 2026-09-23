// Reader view: server-side extraction of the linked article, cached on the
// row after the first successful fetch. `?refresh=true` re-fetches. When a
// fresh fetch fails but a cache exists, the cache serves (reader keeps
// working offline; the toast says so).

import type { User } from '@prisma/client'
import { HttpError, withUser } from '@/lib/api-helpers'
import { fetchReader, getCachedReader, type ReaderPayload } from '@/services/content'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const refresh = new URL(req.url).searchParams.get('refresh') === 'true'
  return withUser(async (user: User): Promise<ReaderPayload & { stale: boolean }> => {
    if (refresh) return { ...(await fetchReader(user.id, id, { refresh })), stale: false }
    // 1) fresh fetch preferred (covers "no cache yet"); 2) cache on failure;
    // 3) no cache → the honest error bubbles up.
    try {
      return { ...(await fetchReader(user.id, id)), stale: false }
    } catch (err) {
      if (err instanceof HttpError) {
        const cached = await getCachedReader(user.id, id)
        if (cached) return { ...cached, stale: true }
      }
      throw err
    }
  })
}

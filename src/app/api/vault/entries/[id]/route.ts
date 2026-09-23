import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteVaultEntry, updateVaultEntry } from '@/services/vault'

const entrySchema = z.object({
  data: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64').min(16).max(65_536),
  iv: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64').min(12).max(64),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    const body = await parseBody(req, entrySchema)
    return updateVaultEntry(user.id, id, body)
  })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => deleteVaultEntry(user.id, id))
}

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createVaultEntry, listVaultEntries } from '@/services/vault'

// Everything is an opaque ciphertext blob (base64) + its IV. The server never
// sees titles, usernames, passwords or notes — those exist only in the blob.

const entrySchema = z.object({
  data: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64').min(16).max(65_536),
  iv: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64').min(12).max(64),
})

export async function GET() {
  return withUser(async (user) => listVaultEntries(user.id))
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = await parseBody(req, entrySchema)
    return createVaultEntry(user.id, body)
  })
}

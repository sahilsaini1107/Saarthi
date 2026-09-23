import { z } from 'zod'
import { fail, parseBody, withUser } from '@/lib/api-helpers'
import { clientIpFromRequest, checkVaultRateLimit, pruneRateLimitStores } from '@/lib/rate-limit'
import { createVaultConfig, getVaultConfig, resetVault } from '@/services/vault'
import { MAX_ITERATIONS, MIN_ITERATIONS } from '@/lib/vault-crypto'

// Base64 blobs coming from the browser. Sizes are generous caps — a salt is
// 24 chars, an IV 16, a verifier blob ~24; entries (the big ones) cap at 64 KB.
const b64 = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64')
  .max(65_536)

const createSchema = z.object({
  salt: b64.min(16).max(64),
  iterations: z.number().int().min(MIN_ITERATIONS).max(MAX_ITERATIONS),
  verifier: b64.min(8).max(256),
  verifierIv: b64.min(12).max(64),
})

export async function GET() {
  return withUser(async (user) => getVaultConfig(user.id))
}

export async function POST(req: Request) {
  try {
    pruneRateLimitStores()
    return await withUser(async (user) => {
      const limit = checkVaultRateLimit(`vault:${user.id}:${clientIpFromRequest(req)}`)
      if (!limit.allowed) return fail('Too many vault setup attempts — try again later', 429)
      const body = await parseBody(req, createSchema)
      return createVaultConfig(user.id, body)
    })
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400
    return fail(err instanceof Error ? err.message : 'Vault setup failed', status)
  }
}

// Danger zone: delete the config + every ciphertext. Called from both the
// unlock screen ("forgot password") and the vault's reset button.
export async function DELETE(req: Request) {
  try {
    pruneRateLimitStores()
    return await withUser(async (user) => {
      const limit = checkVaultRateLimit(`vault:${user.id}:${clientIpFromRequest(req)}`)
      if (!limit.allowed) return fail('Too many vault attempts — try again later', 429)
      return resetVault(user.id)
    })
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400
    return fail(err instanceof Error ? err.message : 'Vault reset failed', status)
  }
}

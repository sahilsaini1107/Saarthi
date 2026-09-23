// Password-vault service (Phase 14). The server is a CIPHERTEXT CARRIER
// only: it stores per-entry AES-256-GCM blobs and the PBKDF2 parameters +
// verifier blob, and enforces user-scoping on every query (RLS-equivalent,
// same as every other service). It can never decrypt anything — the key is
// derived in the browser from the master password, which never leaves it.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'

export interface VaultConfigDTO {
  salt: string
  iterations: number
  verifier: string
  verifierIv: string
}

export interface VaultEntryDTO {
  id: string
  data: string
  iv: string
  createdAt: string
  updatedAt: string
}

/** PBKDF2 salt + iteration policy + verifier blob for the unlock screen. */
export async function getVaultConfig(userId: string): Promise<{ config: VaultConfigDTO | null }> {
  const row = await db.vaultConfig.findUnique({ where: { userId } })
  if (!row) return { config: null }
  return {
    config: {
      salt: row.salt,
      iterations: row.iterations,
      verifier: row.verifier,
      verifierIv: row.verifierIv,
    },
  }
}

/** First-time setup. A second setup attempt is rejected — reset first. */
export async function createVaultConfig(userId: string, input: VaultConfigDTO): Promise<{ config: VaultConfigDTO }> {
  const existing = await db.vaultConfig.findUnique({ where: { userId } })
  if (existing) throw new HttpError('Vault already set up — reset it first to change the master password', 409)
  const row = await db.vaultConfig.create({
    data: {
      userId,
      salt: input.salt,
      iterations: input.iterations,
      verifier: input.verifier,
      verifierIv: input.verifierIv,
    },
  })
  return { config: { salt: row.salt, iterations: row.iterations, verifier: row.verifier, verifierIv: row.verifierIv } }
}

/** Danger zone: wipes the config AND every ciphertext (the key dies with them). */
export async function resetVault(userId: string): Promise<{ ok: true }> {
  await db.vaultEntry.deleteMany({ where: { userId } })
  await db.vaultConfig.deleteMany({ where: { userId } })
  return { ok: true }
}

export async function listVaultEntries(userId: string): Promise<{ entries: VaultEntryDTO[] }> {
  const rows = await db.vaultEntry.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, data: true, iv: true, createdAt: true, updatedAt: true },
  })
  return {
    entries: rows.map((r) => ({
      id: r.id,
      data: r.data,
      iv: r.iv,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  }
}

export async function createVaultEntry(userId: string, input: { data: string; iv: string }): Promise<VaultEntryDTO> {
  const row = await db.vaultEntry.create({ data: { userId, data: input.data, iv: input.iv } })
  return { id: row.id, data: row.data, iv: row.iv, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

export async function updateVaultEntry(userId: string, id: string, input: { data: string; iv: string }): Promise<VaultEntryDTO> {
  const existing = await db.vaultEntry.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Vault entry not found', 404)
  const row = await db.vaultEntry.update({ where: { id }, data: { data: input.data, iv: input.iv } })
  return { id: row.id, data: row.data, iv: row.iv, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

export async function deleteVaultEntry(userId: string, id: string): Promise<{ ok: true }> {
  const existing = await db.vaultEntry.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Vault entry not found', 404)
  await db.vaultEntry.delete({ where: { id } })
  return { ok: true }
}

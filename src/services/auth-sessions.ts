// Session management (Phase 7 security hardening): list active devices and
// revoke them. Revoking the CURRENT session is refused through the UI by
// flagging it; revoking others is the "log out everywhere else" action.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { getActiveToken } from '@/services/auth'

export interface AuthSessionInfo {
  id: string
  createdAt: string
  expiresAt: string
  /** true for the session this request authenticated with */
  current: boolean
}

export async function listSessions(userId: string): Promise<AuthSessionInfo[]> {
  const activeToken = await getActiveToken()
  const rows = await db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, token: true, createdAt: true, expiresAt: true },
  })
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    current: activeToken != null && r.token === activeToken,
  }))
}

export async function revokeSession(userId: string, id: string): Promise<{ ok: boolean }> {
  const session = await db.session.findFirst({ where: { id, userId } })
  if (!session) throw new HttpError('Session not found', 404)
  await db.session.delete({ where: { id } })
  return { ok: true }
}

/** Revoke every session except the caller's. Returns how many were removed. */
export async function revokeOtherSessions(userId: string): Promise<{ revoked: number }> {
  const activeToken = await getActiveToken()
  const result = await db.session.deleteMany({
    where: activeToken ? { userId, token: { not: activeToken } } : { userId },
  })
  return { revoked: result.count }
}

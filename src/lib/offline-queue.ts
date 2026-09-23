// Offline write-queue (Phase 7, upgrades Decision #5). Scope: the single
// most common write — a Quick-Add expense — is queued in localStorage when
// the network is down and replayed automatically on reconnect. Replay is
// SAFE because every queued entry carries a clientKey and the server
// resolves replays to the original row (Decision #38). Other mutations
// still surface an error toast and stay manual (documented Decision #38).

import { api } from '@/lib/client'
import type { TransactionDTO } from '@/lib/types'

const QUEUE_KEY = 'saarthi.offlineQueue.v1'

export interface QueuedQuickAdd {
  clientKey: string
  payload: {
    accountId: string
    categoryId: string | null
    amountPaise: number
    direction: 'in' | 'out'
    date: string
    note: string | null
    source: string
    tripId: string | null
  }
  queuedAt: string
}

export function newClientKey(): string {
  // crypto.randomUUID is available in every modern browser; fall back ok
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `k${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

export function loadQueue(): QueuedQuickAdd[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const list = raw ? (JSON.parse(raw) as QueuedQuickAdd[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveQueue(list: QueuedQuickAdd[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list))
  } catch {
    // storage blocked — queue simply doesn't survive reloads
  }
}

export function enqueueQuickAdd(payload: QueuedQuickAdd['payload']): QueuedQuickAdd {
  const entry: QueuedQuickAdd = { clientKey: newClientKey(), payload, queuedAt: new Date().toISOString() }
  // dedupe by clientKey just in case (payload is re-queued only once)
  const list = loadQueue().filter((q) => q.clientKey !== entry.clientKey)
  list.push(entry)
  saveQueue(list)
  return entry
}

export function removeFromQueue(clientKey: string): void {
  saveQueue(loadQueue().filter((q) => q.clientKey !== clientKey))
}

export function queueLength(): number {
  return loadQueue().length
}

/**
 * Replay every queued entry. Returns how many were flushed. A replay that
 * fails with a NETWORK-style error stays queued; a 4xx (e.g. account
 * deleted meanwhile) is dropped — retrying it can never succeed.
 */
export async function flushQueue(): Promise<{ flushed: number; dropped: number; remaining: number }> {
  const list = loadQueue()
  let flushed = 0
  let dropped = 0
  for (const entry of list) {
    try {
      await api<TransactionDTO>('/api/transactions', {
        method: 'POST',
        json: { ...entry.payload, clientKey: entry.clientKey },
      })
      removeFromQueue(entry.clientKey)
      flushed += 1
    } catch (err) {
      const status = (err as { status?: number }).status
      if (typeof status === 'number' && status >= 400 && status < 500 && status !== 401) {
        removeFromQueue(entry.clientKey)
        dropped += 1
      } else {
        break // network/server still down — keep the rest queued, in order
      }
    }
  }
  return { flushed, dropped, remaining: queueLength() }
}

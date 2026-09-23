'use client'

// Offline awareness (Phase 7): online/offline state + automatic replay of
// the Quick-Add write-queue when the network comes back. The banner lives
// in the shell; flushing happens on the `online` event, on mount, and when
// a queued entry is added while connectivity returns.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { flushQueue, queueLength } from '@/lib/offline-queue'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/hooks/queries'

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

/** Mounted once in the shell: watches connectivity and flushes the queue. */
export function useOfflineQueue() {
  const online = useOnlineStatus()
  const qc = useQueryClient()
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => setPending(queueLength()), [])

  const flush = useCallback(async () => {
    if (busy || !navigator.onLine || queueLength() === 0) return
    setBusy(true)
    try {
      const result = await flushQueue()
      refresh()
      if (result.flushed > 0) {
        toast.success(`Synced ${result.flushed} offline entr${result.flushed === 1 ? 'y' : 'ies'} ✓`)
        // same blast radius as a fresh save
        const keys = [qk.transactions({}), qk.recentTxns, qk.accounts, qk.today, qk.netWorth, qk.budgets, qk.trips, qk.insights, qk.lifeScore, qk.gamification, ['overview'] as unknown[]]
        await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })))
      }
      if (result.dropped > 0) {
        toast.error(`${result.dropped} offline entr${result.dropped === 1 ? 'y was' : 'ies were'} discarded (account no longer exists)`)
      }
    } finally {
      setBusy(false)
    }
  }, [busy, qc, refresh])

  useEffect(() => {
    refresh()
  }, [refresh, online])

  useEffect(() => {
    if (online) void flush()
  }, [online, flush])

  return { online, pending, flushNow: flush }
}

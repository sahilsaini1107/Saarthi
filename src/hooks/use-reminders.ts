'use client'

// Reminder delivery hook: polls due reminders every 30s while the app is
// open and fires local browser notifications (with an in-app toast
// fallback). Fired keys are persisted per-day so a reload never re-spams.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  type DueReminder,
  type RemindableItem,
  dueReminders,
  loadFiredKeys,
  notificationPermission,
  nowMinutes,
  requestNotificationPermission,
  saveFiredKey,
} from '@/lib/reminders'
import { isScheduledOn } from '@/lib/habits'
import { todayISO } from '@/lib/date'
import { useHabits, useRoutines, useSupplements, useToday } from '@/hooks/queries'

const JOURNAL_NUDGE_KEY = 'saarthi_journal_nudge'

/** Journal nudge time lives on the device — permission itself is per-browser too. */
export function getJournalNudge(): string | null {
  try {
    return localStorage.getItem(JOURNAL_NUDGE_KEY) || null
  } catch {
    return null
  }
}

export function setJournalNudge(time: string | null) {
  try {
    if (time) localStorage.setItem(JOURNAL_NUDGE_KEY, time)
    else localStorage.removeItem(JOURNAL_NUDGE_KEY)
  } catch {
    // ignore
  }
}

function fire(reminder: DueReminder) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(reminder.title, { body: reminder.body, tag: reminder.key })
      n.onclick = () => window.focus()
    }
  } catch {
    // notifications blocked mid-session — toast still covers it
  }
  toast(reminder.title, { description: reminder.body, duration: 8000 })
}

/** Mount once inside the authenticated shell. */
export function useReminders() {
  const [permission, setPermission] = useState<string>('default')
  useEffect(() => {
    setPermission(notificationPermission())
  }, [])

  const deviceTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
  const today = todayISO(deviceTz)

  // Only poll the data the engine needs when notifications are actually on.
  const habits = useHabits(permission === 'granted')
  const routines = useRoutines(permission === 'granted')
  const supplements = useSupplements(permission === 'granted')
  const todayQ = useToday(permission === 'granted')

  useEffect(() => {
    if (permission !== 'granted') return

    function tick() {
      const fired = new Set(loadFiredKeys(today))
      const items: RemindableItem[] = []
      for (const h of habits.data ?? []) {
        items.push({
          id: h.id,
          kind: 'habit',
          name: h.name,
          emoji: h.emoji,
          time: h.reminderTime,
          scheduledToday: !h.archived && isScheduledOn(h.weekdays, today),
          doneToday: h.doneToday,
        })
      }
      for (const r of routines.data ?? []) {
        items.push({
          id: r.id,
          kind: 'routine',
          name: r.name,
          emoji: r.emoji,
          time: r.reminderTime,
          scheduledToday: r.active && isScheduledOn(r.weekdays, today),
          doneToday: r.todayRun != null,
        })
      }
      for (const supplement of supplements.data?.supplements ?? []) {
        items.push({
          id: supplement.id,
          kind: 'supplement',
          name: supplement.name,
          emoji: '💊',
          time: supplement.reminderTime,
          scheduledToday: supplement.scheduledToday,
          doneToday: supplement.takenToday,
        })
      }
      const journalTime = getJournalNudge()
      if (journalTime) {
        items.push({
          id: 'journal',
          kind: 'journal',
          name: 'Journal',
          emoji: '📔',
          time: journalTime,
          scheduledToday: true,
          doneToday: todayQ.data?.journalToday.hasEntry ?? false,
        })
      }
      for (const due of dueReminders(items, today, nowMinutes(), fired)) {
        saveFiredKey(today, due.key)
        fire(due)
      }
    }

    tick()
    const iv = setInterval(tick, 30_000)
    return () => clearInterval(iv)
  }, [permission, today, habits.data, routines.data, supplements.data, todayQ.data])

  async function enable() {
    const result = await requestNotificationPermission()
    setPermission(notificationPermission())
    return result
  }

  return { permission, enable }
}

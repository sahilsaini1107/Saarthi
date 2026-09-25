// Local reminder engine (pure). Phase 2's task 2.5 — "smart reminders
// (local notifications)". Delivery is the browser Notification API driven by
// the client (see hooks/use-reminders.ts); this module is the schedulable,
// testable core.
//
// Scope & honest limitations (Decision #17):
//  - Times are "HH:MM" wall-clock in the user's timezone. The browser clock
//    is used for "now" — correct for the dominant single-device, same-tz
//    personal-app case; a server push service with per-tz scheduling is the
//    Phase 7 upgrade path.
//  - A reminder is DUE when: scheduled today, not yet done, has a time, and
//    that time has arrived. The caller dedupes via fired-key storage.

export interface RemindableItem {
  id: string
  kind: 'habit' | 'routine' | 'journal' | 'supplement'
  name: string
  emoji: string
  /** "HH:MM" or null when no reminder is set */
  time: string | null
  /** is it scheduled/eligible today (weekdays etc.)? */
  scheduledToday: boolean
  /** already checked-in / played / journalled today */
  doneToday: boolean
}

export interface DueReminder {
  /** stable dedupe key: `${kind}:${id}:${dateISO}` */
  key: string
  title: string
  body: string
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** "HH:MM" of the device clock right now, as minutes since midnight. */
export function nowMinutes(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * Which reminders are due right now. `firedKeys` are keys already delivered
 * today (persists across reloads via localStorage in the hook).
 */
export function dueReminders(
  items: readonly RemindableItem[],
  dateISO: string,
  currentMinutes: number,
  firedKeys: ReadonlySet<string>,
): DueReminder[] {
  const out: DueReminder[] = []
  for (const item of items) {
    const key = `${item.kind}:${item.id}:${dateISO}`
    if (firedKeys.has(key)) continue
    if (!item.scheduledToday || item.doneToday) continue
    if (!item.time) continue
    if (minutesOf(item.time) > currentMinutes) continue
    out.push({
      key,
      title: `${item.emoji} ${item.name}`,
      body:
        item.kind === 'habit'
          ? 'Two seconds to check in — keep the streak alive.'
          : item.kind === 'routine'
            ? 'Time to play your routine, one step at a time.'
            : item.kind === 'supplement'
              ? 'Your scheduled supplement is due. Mark it when taken.'
              : 'Two honest lines about today — that\u2019s all it takes.',
    })
  }
  return out
}

/** The day-bucket key for fired-reminder storage (one set per calendar day). */
export function firedStorageKey(dateISO: string): string {
  return `saarthi_fired_${dateISO}`
}

export function loadFiredKeys(dateISO: string): string[] {
  try {
    const raw = localStorage.getItem(firedStorageKey(dateISO))
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveFiredKey(dateISO: string, key: string) {
  try {
    const keys = loadFiredKeys(dateISO)
    if (!keys.includes(key)) {
      keys.push(key)
      localStorage.setItem(firedStorageKey(dateISO), JSON.stringify(keys))
    }
  } catch {
    // storage blocked — reminders will just re-fire within the session
  }
}

/** Notification permission helpers — keep all browser-API access in one place. */
export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  try {
    const result = await Notification.requestPermission()
    return result === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

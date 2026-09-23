// Journal pure helpers: moods, tag sanitisation, and search filtering.
// Search/filter run in JS (not SQL) on purpose: personal-scale entry counts,
// and SQLite's `contains` is only ASCII-case-insensitive — this keeps Hindi
// and other non-ASCII text searchable correctly (Decision #16).

import type { ISODate } from './date'

export const MOODS = ['great', 'good', 'okay', 'low', 'bad'] as const
export type Mood = (typeof MOODS)[number]

export const MOOD_META: Record<Mood, { emoji: string; label: string; color: string }> = {
  great: { emoji: '😄', label: 'Great', color: '#16A34A' },
  good: { emoji: '🙂', label: 'Good', color: '#0D9488' },
  okay: { emoji: '😐', label: 'Okay', color: '#64748B' },
  low: { emoji: '😕', label: 'Low', color: '#F59E0B' },
  bad: { emoji: '😞', label: 'Bad', color: '#EF4444' },
}

export function isMood(v: string): v is Mood {
  return (MOODS as readonly string[]).includes(v)
}

/** Entry shape the filter works on (DTO-level, no Prisma types). */
export interface FilterableEntry {
  title: string | null
  content: string
  mood: string | null
  tags: string[]
  date: ISODate
}

export interface EntryFilters {
  q?: string
  mood?: string
  tag?: string
}

/** Case-insensitive AND-filter over content/title/tags + exact mood/tag. */
export function filterEntries<T extends FilterableEntry>(entries: readonly T[], f: EntryFilters): T[] {
  const q = f.q?.trim().toLowerCase()
  return entries.filter((e) => {
    if (f.mood && e.mood !== f.mood) return false
    if (f.tag && !e.tags.includes(f.tag)) return false
    if (q) {
      const haystack = `${e.title ?? ''}\n${e.content}\n${e.tags.join(' ')}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

/**
 * Sanitise user-typed tags: trim, replace storage-breaking separators
 * (commas are the storage format), collapse whitespace, drop empties +
 * duplicates (case-insensitive), cap at 8 tags of 24 chars each.
 * Returns the storage-ready comma-joined string.
 */
export function sanitizeTags(input: readonly string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const tag = raw
      .replace(/[,;\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 8) break
  }
  return out.join(',')
}

export function parseTags(stored: string): string[] {
  return stored ? stored.split(',').filter(Boolean) : []
}

/**
 * Journaling streak: consecutive calendar days (ending today or yesterday —
 * today without an entry doesn't break it, same grace rule as habits)
 * with at least one entry.
 */
export function journalStreak(entryDates: ReadonlySet<string>, today: ISODate): number {
  let cursor = today
  if (!entryDates.has(today)) {
    // grace: today may still be written
    const [y, m, d] = today.split('-').map(Number)
    cursor = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
  }
  let streak = 0
  for (let i = 0; i < 3660; i++) {
    if (entryDates.has(cursor)) streak++
    else break
    const [y, m, d] = cursor.split('-').map(Number)
    cursor = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
  }
  return streak
}

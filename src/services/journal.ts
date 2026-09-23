// Journal service: entries CRUD + search/filter + light stats.
// Search & filtering run in JS on a bounded recent window (personal-scale
// volumes; SQLite `contains` is ASCII-only case-insensitive, JS lowercasing
// handles Devanagari etc. correctly — Decision #16).

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { filterEntries, isMood, journalStreak, parseTags, sanitizeTags } from '@/lib/journal'
import { currentMonthKey, monthRange, todayISO, toUTC } from '@/lib/date'
import type { JournalEntryDTO, JournalListResponse, MoodKey } from '@/lib/types'

export interface JournalInput {
  title?: string | null
  content: string
  mood?: string | null
  tags?: string[]
  date: string
}

export interface JournalUpdateInput {
  title?: string | null
  content?: string
  mood?: string | null
  tags?: string[]
  date?: string
}

const PAGE_SIZE = 30
/** Search window: recent entries scanned for filtering (bounded memory). */
const SEARCH_WINDOW = 500

function validate(input: { content: string; mood?: string | null; date: string; title?: string | null }) {
  if (!input.content.trim()) throw new HttpError('Journal content is required', 422)
  if (input.content.length > 20_000) throw new HttpError('Entry is too long (20,000 characters max)', 422)
  if (input.title != null && input.title.length > 120) throw new HttpError('Title must be 120 characters or fewer', 422)
  if (input.mood != null && input.mood !== '' && !isMood(input.mood)) throw new HttpError('Unknown mood', 422)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
}

function toDTO(e: {
  id: string
  title: string | null
  content: string
  mood: string | null
  tags: string
  date: Date
  createdAt: Date
}): JournalEntryDTO {
  return {
    id: e.id,
    title: e.title,
    content: e.content,
    mood: (e.mood && isMood(e.mood) ? e.mood : null) as MoodKey | null,
    tags: parseTags(e.tags),
    date: e.date.toISOString().slice(0, 10),
    createdAt: e.createdAt.toISOString(),
  }
}

export async function createEntry(userId: string, input: JournalInput): Promise<JournalEntryDTO> {
  validate(input)
  const row = await db.journalEntry.create({
    data: {
      userId,
      title: input.title?.trim() || null,
      content: input.content,
      mood: input.mood || null,
      tags: sanitizeTags(input.tags ?? []),
      date: toUTC(input.date),
    },
  })
  return toDTO(row)
}

export async function updateEntry(userId: string, id: string, input: JournalUpdateInput): Promise<JournalEntryDTO> {
  const existing = await db.journalEntry.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Entry not found', 404)
  const merged = {
    content: input.content ?? existing.content,
    mood: input.mood !== undefined ? input.mood : existing.mood,
    date: input.date ?? existing.date.toISOString().slice(0, 10),
    title: input.title !== undefined ? input.title : existing.title,
  }
  validate({ content: merged.content, mood: merged.mood, date: merged.date, title: merged.title })
  const row = await db.journalEntry.update({
    where: { id },
    data: {
      title: merged.title?.trim() || null,
      content: merged.content,
      mood: merged.mood || null,
      tags: input.tags !== undefined ? sanitizeTags(input.tags) : existing.tags,
      date: input.date ? toUTC(input.date) : existing.date,
    },
  })
  return toDTO(row)
}

export async function deleteEntry(userId: string, id: string): Promise<void> {
  const existing = await db.journalEntry.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Entry not found', 404)
  await db.journalEntry.delete({ where: { id } })
}

export async function listEntries(
  userId: string,
  tz: string,
  filters: { q?: string; mood?: string; tag?: string; month?: string; limit?: number; offset?: number },
): Promise<JournalListResponse> {
  if (filters.mood && !isMood(filters.mood)) throw new HttpError('Unknown mood filter', 422)
  if (filters.month && !/^\d{4}-\d{2}$/.test(filters.month)) throw new HttpError('month must be YYYY-MM', 422)

  const today = todayISO(tz)
  const where = { userId }
  const [total, rows] = await Promise.all([
    db.journalEntry.count({ where }),
    db.journalEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: SEARCH_WINDOW,
    }),
  ])

  let entries = rows.map(toDTO)
  if (filters.month) {
    const { start, endExclusive } = monthRange(filters.month)
    entries = entries.filter((e) => {
      const t = toUTC(e.date).getTime()
      return t >= start.getTime() && t < endExclusive.getTime()
    })
  }
  entries = filterEntries(entries, { q: filters.q, mood: filters.mood, tag: filters.tag })

  const limit = Math.min(filters.limit ?? PAGE_SIZE, 100)
  const offset = Math.max(filters.offset ?? 0, 0)
  const page = entries.slice(offset, offset + limit)

  // Stats are computed on the unfiltered set — they describe the journal,
  // not the current filter view.
  const allDates = new Set(rows.map((r) => r.date.toISOString().slice(0, 10)))
  const monthCount = await db.journalEntry.count({
    where: { userId, date: { gte: monthRange(currentMonthKey(tz)).start, lt: monthRange(currentMonthKey(tz)).endExclusive } },
  })

  const tagCounts = new Map<string, number>()
  for (const r of rows) for (const tag of parseTags(r.tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t)

  return {
    items: page,
    nextOffset: offset + limit < entries.length ? offset + limit : null,
    streakDays: journalStreak(allDates, today),
    monthCount,
    topTags,
    total,
  }
}

export interface JournalStats {
  hasEntry: boolean
  mood: MoodKey | null
}

export async function journalStatsForDate(userId: string, dateISO: string): Promise<JournalStats> {
  const row = await db.journalEntry.findFirst({
    where: { userId, date: toUTC(dateISO) },
    select: { id: true, mood: true },
  })
  return {
    hasEntry: row != null,
    mood: row?.mood && isMood(row.mood) ? row.mood : null,
  }
}

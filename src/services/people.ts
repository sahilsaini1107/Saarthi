// People service (Phase 17): CRM CRUD + touchpoint logging + reconnect shaping.
// Every query is user-scoped (RLS-equivalent). The reconnect-due engine is
// pure in lib/people.ts — this layer only fetches, validates and shapes.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { isoDayUTC, shiftISO, todayISO, toUTC } from '@/lib/date'
import {
  cadenceFor,
  isPersonCategory,
  isTouchType,
  lastTouchDate,
  personCategoryMeta,
  recentTouchStrip,
  reconnectState,
  sortForReconnect,
  toTouches,
  touchesInWindow,
  type TouchLike,
} from '@/lib/people'
import type { PersonWithMeta } from '@/lib/types'

const STRIP_DAYS = 14
const RECENT_ROWS = 8

export interface PersonInput {
  name: string
  category?: string
  importance?: number
  cadenceDays?: number | null
  role?: string | null
  howMet?: string | null
  contact?: string | null
  notes?: string | null
  tags?: string | null
  archived?: boolean
}

export interface PersonUpdateInput {
  name?: string
  category?: string
  importance?: number
  cadenceDays?: number | null
  role?: string | null
  howMet?: string | null
  contact?: string | null
  notes?: string | null
  tags?: string | null
  archived?: boolean
}

function validate(input: { name: string; category?: string; importance?: number; cadenceDays?: number | null }) {
  if (!input.name.trim()) throw new HttpError('Name is required', 422)
  if (input.name.trim().length > 80) throw new HttpError('Name must be 80 characters or fewer', 422)
  if (input.category != null && !isPersonCategory(input.category)) throw new HttpError('Unknown person category', 422)
  if (input.importance != null && (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 3)) {
    throw new HttpError('Importance must be 1 (extended), 2 (regular) or 3 (core)', 422)
  }
  if (input.cadenceDays != null && (!Number.isInteger(input.cadenceDays) || input.cadenceDays < 1 || input.cadenceDays > 3650)) {
    throw new HttpError('Cadence must be between 1 and 3650 days', 422)
  }
}

function parseTags(raw: string | null): string[] {
  return raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : []
}

function shape(
  p: {
    id: string
    name: string
    category: string
    importance: number
    cadenceDays: number | null
    role: string | null
    howMet: string | null
    contact: string | null
    notes: string | null
    tags: string | null
    archived: boolean
    createdAt: Date
  },
  touches: TouchLike[],
  today: string,
): PersonWithMeta {
  const meta = personCategoryMeta(p.category)
  const cadenceDays = cadenceFor(p.importance, p.cadenceDays)
  const last = lastTouchDate(touches)
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    categoryLabel: meta.label,
    categoryEmoji: meta.emoji,
    importance: p.importance,
    cadenceDays,
    cadenceOverride: p.cadenceDays,
    role: p.role,
    howMet: p.howMet,
    contact: p.contact,
    notes: p.notes,
    tags: parseTags(p.tags),
    archived: p.archived,
    createdAt: p.createdAt.toISOString(),
    lastTouch: last,
    touchCount: touches.length,
    touchCount30: touchesInWindow(touches, shiftISO(today, -29), today),
    reconnect: reconnectState(last, cadenceDays, today),
    recent: recentTouchStrip(touches, today, STRIP_DAYS),
    logs: touches
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, RECENT_ROWS) as PersonWithMeta['logs'],
  }
}

async function loadTouchesGrouped(userId: string): Promise<Map<string, (TouchLike & { id: string; note: string | null })[]>> {
  const rows = await db.touchpoint.findMany({
    where: { userId },
    select: { id: true, date: true, type: true, note: true, personId: true },
    orderBy: { date: 'asc' },
  })
  const grouped = new Map<string, (TouchLike & { id: string; note: string | null })[]>()
  for (const r of rows) {
    const list = grouped.get(r.personId) ?? []
    list.push({ id: r.id, date: isoDayUTC(r.date), type: isTouchType(r.type) ? r.type : 'other', note: r.note })
    grouped.set(r.personId, list)
  }
  return grouped
}

export async function createPerson(userId: string, input: PersonInput, tz: string): Promise<PersonWithMeta> {
  validate(input)
  const row = await db.person.create({
    data: {
      userId,
      name: input.name.trim(),
      category: input.category ?? 'friend',
      importance: input.importance ?? 2,
      cadenceDays: input.cadenceDays ?? null,
      role: input.role?.trim() || null,
      howMet: input.howMet?.trim() || null,
      contact: input.contact?.trim() || null,
      notes: input.notes?.trim() || null,
      tags: input.tags?.trim() || null,
      archived: input.archived ?? false,
    },
  })
  return shape(row, [], todayISO(tz))
}

export async function updatePerson(userId: string, id: string, input: PersonUpdateInput, tz: string): Promise<PersonWithMeta> {
  const existing = await db.person.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Person not found', 404)
  const merged = {
    name: input.name ?? existing.name,
    category: input.category ?? existing.category,
    importance: input.importance ?? existing.importance,
    cadenceDays: input.cadenceDays !== undefined ? input.cadenceDays : existing.cadenceDays,
  }
  validate(merged)
  const row = await db.person.update({
    where: { id },
    data: {
      name: merged.name.trim(),
      category: merged.category,
      importance: merged.importance,
      cadenceDays: merged.cadenceDays,
      role: input.role !== undefined ? input.role?.trim() || null : existing.role,
      howMet: input.howMet !== undefined ? input.howMet?.trim() || null : existing.howMet,
      contact: input.contact !== undefined ? input.contact?.trim() || null : existing.contact,
      notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
      tags: input.tags !== undefined ? input.tags?.trim() || null : existing.tags,
      archived: input.archived ?? existing.archived,
    },
  })
  const touches = (await loadTouchesGrouped(userId)).get(id) ?? []
  return shape(row, touches, todayISO(tz))
}

export async function deletePerson(userId: string, id: string): Promise<void> {
  const existing = await db.person.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Person not found', 404)
  await db.person.delete({ where: { id } })
}

/**
 * The CRM list. Active people sorted by the reconnect engine (overdue →
 * never → due → ok); archived people ride at the end when requested.
 */
export async function listPeople(
  userId: string,
  tz: string,
  opts?: { includeArchived?: boolean },
): Promise<PersonWithMeta[]> {
  const [people, grouped] = await Promise.all([
    db.person.findMany({
      where: { userId, ...(opts?.includeArchived ? {} : { archived: false }) },
      orderBy: { createdAt: 'asc' },
    }),
    loadTouchesGrouped(userId),
  ])
  const today = todayISO(tz)
  const active = sortForReconnect(people.filter((p) => !p.archived).map((p) => shape(p, grouped.get(p.id) ?? [], today)))
  const archived = people
    .filter((p) => p.archived)
    .map((p) => shape(p, grouped.get(p.id) ?? [], today))
    .sort((a, b) => a.name.localeCompare(b.name))
  return [...active, ...archived]
}

/**
 * Log a touchpoint. Several per day are legitimate. Any past day can be
 * logged (trueing up after a great call you forgot to record); future days
 * are rejected. Because freshness is derived, a back-dated log immediately
 * clears an overdue badge.
 */
export async function logTouchpoint(
  userId: string,
  personId: string,
  input: { date: string; type: string; note?: string | null },
  tz: string,
): Promise<PersonWithMeta> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (!isTouchType(input.type)) throw new HttpError('type must be meet | call | text | event | other', 422)
  if (input.note != null && input.note.length > 500) throw new HttpError('Note must be 500 characters or fewer', 422)
  if (input.date > todayISO(tz)) throw new HttpError('Cannot log a touchpoint for a future day', 422)

  const person = await db.person.findFirst({ where: { id: personId, userId } })
  if (!person) throw new HttpError('Person not found', 404)

  await db.touchpoint.create({
    data: {
      userId,
      personId,
      date: toUTC(input.date),
      type: input.type,
      note: input.note?.trim() || null,
    },
  })
  const touches = (await loadTouchesGrouped(userId)).get(personId) ?? []
  return shape(person, touches, todayISO(tz))
}

/** Undo a mis-logged touchpoint. */
export async function deleteTouchpoint(userId: string, personId: string, touchId: string): Promise<{ ok: true }> {
  const row = await db.touchpoint.findFirst({ where: { id: touchId, personId, userId } })
  if (!row) throw new HttpError('Touchpoint not found', 404)
  await db.touchpoint.delete({ where: { id: touchId } })
  return { ok: true }
}

/** Light rows for the Today snapshot: who needs a tap on the shoulder. */
export async function peopleForToday(userId: string, tz: string) {
  const today = todayISO(tz)
  const [people, grouped] = await Promise.all([
    db.person.findMany({
      where: { userId, archived: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, category: true, importance: true, cadenceDays: true },
    }),
    loadTouchesGrouped(userId),
  ])
  const rows = people.map((p) => {
    const touches = grouped.get(p.id) ?? []
    const last = lastTouchDate(touches)
    const cadenceDays = cadenceFor(p.importance, p.cadenceDays)
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      importance: p.importance,
      cadenceDays,
      lastTouch: last,
      reconnect: reconnectState(last, cadenceDays, today),
    }
  })
  const needsAttention = sortForReconnect(rows.filter((r) => r.reconnect.status !== 'ok'))
  return {
    people: needsAttention,
    tracked: rows.length,
    dueCount: needsAttention.length,
    touchedToday: rows.filter((r) => r.reconnect.daysSinceLast === 0).length,
  }
}

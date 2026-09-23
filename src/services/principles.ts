// Life Principles service (Phase 15): CRUD + the daily check upsert + stats.
// Every query is user-scoped (RLS-equivalent). All adherence/streak math is
// pure in lib/principles.ts — this layer only fetches and shapes.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { isoDayUTC, shiftISO, todayISO, toUTC } from '@/lib/date'
import {
  adherenceRate,
  breaksInWindow,
  categoryMeta,
  isPrincipleCategory,
  isPrincipleStatus,
  keptStreak,
  lastBreak,
  longestKeptRun,
  recentDayStrip,
  type CheckLike,
} from '@/lib/principles'
import type { PrincipleWithStats } from '@/lib/types'

export interface PrincipleInput {
  title: string
  detail?: string | null
  category?: string
  active?: boolean
}

export interface PrincipleUpdateInput {
  title?: string
  detail?: string | null
  category?: string
  active?: boolean
}

const STRIP_DAYS = 14

function validate(input: { title: string; detail?: string | null; category?: string }) {
  if (!input.title.trim()) throw new HttpError('Principle title is required', 422)
  if (input.title.trim().length > 120) throw new HttpError('Principle title must be 120 characters or fewer', 422)
  if (input.detail != null && input.detail.length > 500) throw new HttpError('Detail must be 500 characters or fewer', 422)
  if (input.category != null && !isPrincipleCategory(input.category)) {
    throw new HttpError('Unknown principle category', 422)
  }
}

function shape(
  p: {
    id: string
    title: string
    detail: string | null
    category: string
    active: boolean
    createdAt: Date
  },
  checks: CheckLike[],
  today: string,
  todayNote: string | null,
): PrincipleWithStats {
  const start30 = shiftISO(today, -29)
  return {
    id: p.id,
    title: p.title,
    detail: p.detail,
    category: p.category,
    categoryLabel: categoryMeta(p.category).label,
    categoryEmoji: categoryMeta(p.category).emoji,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
    todayStatus: checks.find((c) => c.date === today)?.status ?? null,
    todayNote,
    keptStreak: keptStreak(checks, today),
    longestRun: longestKeptRun(checks),
    adherence30: adherenceRate(checks, start30, today, today),
    breaks30: breaksInWindow(checks, start30, today, today),
    lastBreak: lastBreak(checks),
    recent: recentDayStrip(checks, today, STRIP_DAYS),
  }
}

/** All of the user's checks, grouped by principle, in the pure CheckLike shape. */
async function loadChecksGrouped(userId: string): Promise<Map<string, CheckLike[]>> {
  const rows = await db.principleCheck.findMany({
    where: { userId },
    select: { date: true, status: true, principleId: true },
    orderBy: { date: 'asc' },
  })
  const grouped = new Map<string, CheckLike[]>()
  for (const r of rows) {
    if (!isPrincipleStatus(r.status)) continue
    const list = grouped.get(r.principleId) ?? []
    list.push({ date: isoDayUTC(r.date), status: r.status })
    grouped.set(r.principleId, list)
  }
  return grouped
}

/** Today's note per principle (for prefilling the reflection editor). */
async function loadTodayNotes(userId: string, tz: string): Promise<Map<string, string>> {
  const rows = await db.principleCheck.findMany({
    where: { userId, date: toUTC(todayISO(tz)) },
    select: { principleId: true, note: true },
  })
  return new Map(rows.filter((r) => r.note).map((r) => [r.principleId, r.note!]))
}

export async function createPrinciple(userId: string, input: PrincipleInput, tz: string): Promise<PrincipleWithStats> {
  validate(input)
  const row = await db.principle.create({
    data: {
      userId,
      title: input.title.trim(),
      detail: input.detail?.trim() || null,
      category: input.category ?? 'character',
      active: input.active ?? true,
    },
  })
  return shape(row, [], todayISO(tz), null)
}

export async function updatePrinciple(userId: string, id: string, input: PrincipleUpdateInput, tz: string): Promise<PrincipleWithStats> {
  const existing = await db.principle.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Principle not found', 404)
  const merged = {
    title: input.title ?? existing.title,
    detail: input.detail !== undefined ? input.detail : existing.detail,
    category: input.category ?? existing.category,
  }
  validate(merged)
  const row = await db.principle.update({
    where: { id },
    data: {
      title: merged.title.trim(),
      detail: merged.detail?.trim() || null,
      category: merged.category,
      active: input.active ?? existing.active,
    },
  })
  return shape(row, (await loadChecksGrouped(userId)).get(id) ?? [], todayISO(tz), (await loadTodayNotes(userId, tz)).get(id) ?? null)
}

export async function deletePrinciple(userId: string, id: string): Promise<void> {
  const existing = await db.principle.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Principle not found', 404)
  await db.principle.delete({ where: { id } })
}

/**
 * Daily review upsert. Exactly one check per (principle, day) — re-marking
 * the same day replaces status and note (people reconsider; that's allowed).
 * Any past calendar day can be marked (trueing up yesterday is legitimate);
 * future days are rejected.
 */
export async function setCheck(
  userId: string,
  principleId: string,
  input: { date: string; status: string; note?: string | null },
  tz: string,
): Promise<{ principleId: string; date: string; status: string; note: string | null }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (!isPrincipleStatus(input.status)) throw new HttpError('status must be kept | broken | na', 422)
  if (input.note != null && input.note.length > 500) throw new HttpError('Note must be 500 characters or fewer', 422)
  if (input.date > todayISO(tz)) throw new HttpError('Cannot review a future day', 422)

  const principle = await db.principle.findFirst({ where: { id: principleId, userId } })
  if (!principle) throw new HttpError('Principle not found', 404)

  const date = toUTC(input.date)
  const data = { status: input.status, note: input.note?.trim() || null }
  await db.principleCheck.upsert({
    where: { principleId_date: { principleId, date } },
    create: { userId, principleId, date, ...data },
    update: data,
  })
  return { principleId, date: input.date, status: input.status, note: data.note }
}

/** Full list with stats — the principles screen payload. */
export async function listPrinciples(userId: string, tz: string, opts?: { includeArchived?: boolean }): Promise<PrincipleWithStats[]> {
  const today = todayISO(tz)
  const [principles, grouped, todayNotes] = await Promise.all([
    db.principle.findMany({
      where: { userId, ...(opts?.includeArchived ? {} : { active: true }) },
      orderBy: { createdAt: 'asc' },
    }),
    loadChecksGrouped(userId),
    loadTodayNotes(userId, tz),
  ])
  return principles.map((p) => shape(p, grouped.get(p.id) ?? [], today, todayNotes.get(p.id) ?? null))
}

/** Light rows for the Today snapshot: active principles + today's status. */
export async function principlesForToday(userId: string, tz: string) {
  const today = todayISO(tz)
  const [principles, todayRows, grouped] = await Promise.all([
    db.principle.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, category: true },
    }),
    db.principleCheck.findMany({
      where: { userId, date: toUTC(today) },
      select: { principleId: true, status: true },
    }),
    loadChecksGrouped(userId),
  ])
  const statusBy = new Map(todayRows.map((r) => [r.principleId, r.status]))
  return principles.map((p) => {
    const raw = statusBy.get(p.id)
    return {
      id: p.id,
      title: p.title,
      category: p.category,
      status: raw && isPrincipleStatus(raw) ? raw : null,
      keptStreak: keptStreak(grouped.get(p.id) ?? [], today),
    }
  })
}

/** Aggregate trailing-30-day adherence across all active principles (Life Score). */
export async function adherence30Aggregate(userId: string, tz: string): Promise<number | null> {
  const today = todayISO(tz)
  const active = await db.principle.findMany({ where: { userId, active: true }, select: { id: true } })
  if (active.length === 0) return null
  const rows = await db.principleCheck.findMany({
    where: {
      userId,
      principleId: { in: active.map((p) => p.id) },
      date: { gte: toUTC(shiftISO(today, -29)), lte: toUTC(today) },
    },
    select: { status: true },
  })
  let kept = 0
  let judged = 0
  for (const r of rows) {
    if (r.status === 'kept') {
      kept++
      judged++
    } else if (r.status === 'broken') {
      judged++
    }
  }
  return judged === 0 ? null : kept / judged
}

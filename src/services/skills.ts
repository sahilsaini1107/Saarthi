// Skills service (Phase 17): CRUD + practice logging + stats shaping.
// Every query is user-scoped (RLS-equivalent). All XP/level/streak/ETA math
// is pure in lib/skills.ts — this layer only fetches, validates and shapes.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { isoDayUTC, shiftISO, todayISO, toUTC } from '@/lib/date'
import {
  isSkillCategory,
  isSkillStatus,
  levelProgress,
  levelForXp,
  practiceStreak,
  recentPracticeStrip,
  skillCategoryMeta,
  etaDaysToLevel,
  paceMinutes,
  minutesTrailing,
  toPractices,
  type PracticeLike,
} from '@/lib/skills'
import type { SkillWithStats } from '@/lib/types'

const STRIP_DAYS = 14
const RECENT_ROWS = 8

/** A practice row as it comes out of the database (pure PracticeLike + identity). */
type PracticeRow = PracticeLike & { id: string; note: string | null }

export interface SkillInput {
  name: string
  category?: string
  targetLevel?: number
  notes?: string | null
  status?: string
}

export interface SkillUpdateInput {
  name?: string
  category?: string
  targetLevel?: number
  notes?: string | null
  status?: string
}

function validate(input: { name: string; category?: string; targetLevel?: number; notes?: string | null; status?: string }) {
  if (!input.name.trim()) throw new HttpError('Skill name is required', 422)
  if (input.name.trim().length > 80) throw new HttpError('Skill name must be 80 characters or fewer', 422)
  if (input.notes != null && input.notes.length > 500) throw new HttpError('Notes must be 500 characters or fewer', 422)
  if (input.category != null && !isSkillCategory(input.category)) throw new HttpError('Unknown skill category', 422)
  if (input.targetLevel != null && (!Number.isInteger(input.targetLevel) || input.targetLevel < 1 || input.targetLevel > 10)) {
    throw new HttpError('Target level must be an integer between 1 and 10', 422)
  }
  if (input.status != null && !isSkillStatus(input.status)) throw new HttpError('Unknown skill status', 422)
}

function shape(
  s: { id: string; name: string; category: string; targetLevel: number; status: string; notes: string | null; createdAt: Date },
  practices: PracticeRow[],
  today: string,
): SkillWithStats {
  const xp = practices.reduce((sum, p) => sum + p.minutes, 0)
  const level = levelForXp(xp)
  const pace = paceMinutes(practices, shiftISO(today, -29), today, today) // trailing 30 days
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    categoryLabel: skillCategoryMeta(s.category).label,
    categoryEmoji: skillCategoryMeta(s.category).emoji,
    targetLevel: s.targetLevel,
    status: s.status,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    xp,
    level,
    levelProgress: levelProgress(xp),
    targetReached: level >= s.targetLevel,
    streak: practiceStreak(practices, today),
    minutesToday: practices.filter((p) => p.date === today).reduce((sum, p) => sum + p.minutes, 0),
    minutes7d: minutesTrailing(practices, today, 7),
    minutes30d: minutesTrailing(practices, today, 30),
    lastPracticed: practices.length ? practices.map((p) => p.date).sort().at(-1)! : null,
    etaDays: etaDaysToLevel(xp, s.targetLevel, pace),
    etaLabel:
      level >= s.targetLevel
        ? 'Target reached'
        : pace == null || pace <= 0
          ? null
          : `${Math.ceil(((levelProgress(xp).nextAt ?? 0) - xp) / pace)}d to level ${level + 1}`,
    recent: recentPracticeStrip(practices, today, STRIP_DAYS),
    logs: practices
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, RECENT_ROWS)
      .map((p) => ({ id: p.id, date: p.date, minutes: p.minutes, note: p.note })),
  }
}

async function loadPracticesGrouped(userId: string): Promise<Map<string, PracticeRow[]>> {
  const rows = await db.skillPractice.findMany({
    where: { userId },
    select: { id: true, date: true, minutes: true, note: true, skillId: true },
    orderBy: { date: 'asc' },
  })
  const grouped = new Map<string, PracticeRow[]>()
  for (const r of rows) {
    if (r.minutes <= 0) continue
    const list = grouped.get(r.skillId) ?? []
    list.push({ id: r.id, date: isoDayUTC(r.date), minutes: r.minutes, note: r.note })
    grouped.set(r.skillId, list)
  }
  return grouped
}

export async function createSkill(userId: string, input: SkillInput, tz: string): Promise<SkillWithStats> {
  validate(input)
  const row = await db.skill.create({
    data: {
      userId,
      name: input.name.trim(),
      category: input.category ?? 'other',
      targetLevel: input.targetLevel ?? 10,
      notes: input.notes?.trim() || null,
      status: input.status ?? 'active',
    },
  })
  return shape(row, [], todayISO(tz))
}

export async function updateSkill(userId: string, id: string, input: SkillUpdateInput, tz: string): Promise<SkillWithStats> {
  const existing = await db.skill.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Skill not found', 404)
  const merged = {
    name: input.name ?? existing.name,
    category: input.category ?? existing.category,
    targetLevel: input.targetLevel ?? existing.targetLevel,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    status: input.status ?? existing.status,
  }
  validate(merged)
  const row = await db.skill.update({
    where: { id },
    data: {
      name: merged.name.trim(),
      category: merged.category,
      targetLevel: merged.targetLevel,
      notes: merged.notes?.trim() || null,
      status: merged.status,
    },
  })
  const practices = (await loadPracticesGrouped(userId)).get(id) ?? []
  return shape(row, practices, todayISO(tz))
}

export async function deleteSkill(userId: string, id: string): Promise<void> {
  const existing = await db.skill.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Skill not found', 404)
  await db.skill.delete({ where: { id } })
}

/** Full list with stats — the skills screen payload. Active first, then paused, then archived. */
export async function listSkills(userId: string, tz: string, opts?: { includeArchived?: boolean }): Promise<SkillWithStats[]> {
  const [skills, grouped] = await Promise.all([
    db.skill.findMany({
      where: { userId, ...(opts?.includeArchived ? {} : { status: { not: 'archived' } }) },
      orderBy: { createdAt: 'asc' },
    }),
    loadPracticesGrouped(userId),
  ])
  const today = todayISO(tz)
  const rank: Record<string, number> = { active: 0, paused: 1, archived: 2 }
  return skills
    .map((s) => shape(s, grouped.get(s.id) ?? [], today))
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
}

/**
 * Log a practice sitting. Several per day are legitimate (morning + night) —
 * no upsert, the math aggregates. Any past day can be logged (trueing up);
 * future days are rejected.
 */
export async function logPractice(
  userId: string,
  skillId: string,
  input: { date: string; minutes: number; note?: string | null },
  tz: string,
): Promise<SkillWithStats> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440) {
    throw new HttpError('minutes must be an integer between 1 and 1440', 422)
  }
  if (input.note != null && input.note.length > 500) throw new HttpError('Note must be 500 characters or fewer', 422)
  if (input.date > todayISO(tz)) throw new HttpError('Cannot log practice for a future day', 422)

  const skill = await db.skill.findFirst({ where: { id: skillId, userId } })
  if (!skill) throw new HttpError('Skill not found', 404)

  await db.skillPractice.create({
    data: {
      userId,
      skillId,
      date: toUTC(input.date),
      minutes: input.minutes,
      note: input.note?.trim() || null,
    },
  })
  const practices = (await loadPracticesGrouped(userId)).get(skillId) ?? []
  return shape(skill, practices, todayISO(tz))
}

/** Undo a mis-logged practice row. */
export async function deletePractice(userId: string, skillId: string, practiceId: string): Promise<{ ok: true }> {
  const row = await db.skillPractice.findFirst({ where: { id: practiceId, skillId, userId } })
  if (!row) throw new HttpError('Practice log not found', 404)
  await db.skillPractice.delete({ where: { id: practiceId } })
  return { ok: true }
}

/** Light rows for the Today snapshot: active skills + today's practice state. */
export async function skillsForToday(userId: string, tz: string) {
  const today = todayISO(tz)
  const [skills, grouped] = await Promise.all([
    db.skill.findMany({
      where: { userId, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, category: true, targetLevel: true },
    }),
    loadPracticesGrouped(userId),
  ])
  const rows = skills.map((s) => {
    const practices = grouped.get(s.id) ?? []
    return {
      id: s.id,
      name: s.name,
      category: s.category,
      targetLevel: s.targetLevel,
      level: levelForXp(practices.reduce((sum, p) => sum + p.minutes, 0)),
      practicedToday: practices.some((p) => p.date === today),
      minutesToday: practices.filter((p) => p.date === today).reduce((sum, p) => sum + p.minutes, 0),
      streak: practiceStreak(practices, today),
    }
  })
  return {
    skills: rows,
    total: rows.length,
    practicedToday: rows.filter((r) => r.practicedToday).length,
    bestStreak: rows.reduce((m, r) => Math.max(m, r.streak), 0),
    minutesToday: rows.reduce((sum, r) => sum + r.minutesToday, 0),
  }
}

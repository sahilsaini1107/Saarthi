// Study service: courses, syllabus topics, sessions, revision ladder.
// Every query is user-scoped. Pacing + ladder math lives in lib/study.ts.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { applyRevision, isRevisionDue, pacing, startRevisionLadder, type RevisionOutcome } from '@/lib/study'
import { rollupMonths, rollupWeeks, trailingWindow } from '@/lib/effort-grid'
import { buildGrid } from '@/lib/goals-grid'
import { levelsForValues } from '@/lib/effort-grid'
import { shiftISO, todayISO, toUTC, type ISODate } from '@/lib/date'
import type { CourseDTO, CourseGridPayloadDTO, CourseTopicDTO, StudySessionDTO, TopicStatus } from '@/lib/types'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const COURSE_STATUSES = ['active', 'completed', 'paused', 'dropped']
const TOPIC_STATUSES = ['todo', 'learning', 'done']

export interface CourseInput {
  title?: string
  provider?: string | null
  emoji?: string
  color?: string
  startDate?: string
  targetEndDate?: string | null
  status?: string
  /** optional bulk syllabus: one topic per line */
  topics?: string[]
}

function validateCourse(input: CourseInput) {
  if (!input.title?.trim()) throw new HttpError('Course title is required', 422)
  if (input.title.trim().length > 120) throw new HttpError('Course title must be 120 characters or fewer', 422)
  if (input.startDate && !ISO_RE.test(input.startDate)) throw new HttpError('Start date must be YYYY-MM-DD', 422)
  if (input.targetEndDate != null && input.targetEndDate !== '' && !ISO_RE.test(input.targetEndDate)) {
    throw new HttpError('Target end date must be YYYY-MM-DD', 422)
  }
  if (
    input.targetEndDate &&
    input.targetEndDate !== '' &&
    input.startDate &&
    input.targetEndDate < input.startDate
  ) {
    throw new HttpError('Target end date must be on or after the start date', 422)
  }
  if (input.status != null && !COURSE_STATUSES.includes(input.status)) {
    throw new HttpError('Course status must be active, completed, paused or dropped', 422)
  }
}

type TopicRow = {
  id: string
  courseId: string
  order: number
  title: string
  estMinutes: number | null
  status: string
  revisionStage: number
  nextRevisionAt: Date | null
}

function shapeTopic(t: TopicRow): CourseTopicDTO {
  return {
    id: t.id,
    courseId: t.courseId,
    order: t.order,
    title: t.title,
    estMinutes: t.estMinutes,
    status: (TOPIC_STATUSES.includes(t.status) ? t.status : 'todo') as TopicStatus,
    nextRevisionAt: t.nextRevisionAt ? t.nextRevisionAt.toISOString().slice(0, 10) : null,
    revisionStage: t.revisionStage,
  }
}

function shapeCourse(
  c: {
    id: string
    title: string
    provider: string | null
    emoji: string
    color: string
    startDate: Date
    targetEndDate: Date | null
    status: string
    createdAt: Date
    topics: TopicRow[]
    sessions: { id: string; courseId: string; topicId: string | null; date: Date; minutes: number; note: string | null; createdAt: Date; topic?: { title: string } | null }[]
  },
  today: string,
): CourseDTO {
  const topics = c.topics.map(shapeTopic).sort((a, b) => a.order - b.order)
  const totalUnits = topics.length
  const doneUnits = topics.filter((t) => t.status === 'done').length
  const startISO = c.startDate.toISOString().slice(0, 10)
  const targetISO = c.targetEndDate ? c.targetEndDate.toISOString().slice(0, 10) : null

  const pace = pacing({
    startDate: startISO,
    targetEndDate: targetISO,
    today,
    totalUnits,
    doneUnits,
  })

  const sessions = [...c.sessions]
    .sort((a, b) => b.date.toISOString().localeCompare(a.date.toISOString()) || b.createdAt.toISOString().localeCompare(a.createdAt.toISOString()))
  const weekAgo = shiftISO(today, -6)
  const totalMinutes = sessions.reduce((s, x) => s + x.minutes, 0)
  const minutes7d = sessions.filter((s) => s.date.toISOString().slice(0, 10) >= weekAgo).reduce((s, x) => s + x.minutes, 0)
  const revisionsDue = topics.filter((t) => isRevisionDue(t, today)).length

  return {
    id: c.id,
    title: c.title,
    provider: c.provider,
    emoji: c.emoji,
    color: c.color,
    startDate: startISO,
    targetEndDate: targetISO,
    status: (COURSE_STATUSES.includes(c.status) ? c.status : 'active') as CourseDTO['status'],
    createdAt: c.createdAt.toISOString(),
    topics,
    pacing: {
      elapsedDays: pace.elapsedDays,
      totalDays: pace.totalDays,
      expectedPct: pace.expectedPct,
      actualPct: pace.actualPct,
      deltaPct: pace.deltaPct,
      unitsPerDay: pace.unitsPerDay,
      projectedEndDate: pace.projectedEndDate,
      health: pace.health,
    },
    stats: { totalMinutes, minutes7d, revisionsDue },
    recentSessions: sessions.slice(0, 10).map((s) => ({
      id: s.id,
      courseId: s.courseId,
      topicId: s.topicId,
      topicTitle: s.topic?.title ?? null,
      date: s.date.toISOString().slice(0, 10),
      minutes: s.minutes,
      note: s.note,
      createdAt: s.createdAt.toISOString(),
    })),
  }
}

const COURSE_INCLUDE = {
  topics: true,
  sessions: { include: { topic: { select: { title: true } } } },
}

export async function listCourses(userId: string, tz: string): Promise<CourseDTO[]> {
  const today = todayISO(tz)
  const rows = await db.course.findMany({
    where: { userId },
    include: COURSE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
  const rank = (s: string) => (s === 'active' ? 0 : 1)
  return rows
    .map((c) => shapeCourse(c, today))
    .sort((a, b) => rank(a.status) - rank(b.status) || b.createdAt.localeCompare(a.createdAt))
}

export async function createCourse(userId: string, input: CourseInput, tz: string): Promise<CourseDTO> {
  validateCourse(input)
  const titles = (input.topics ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 200)
  const row = await db.course.create({
    data: {
      userId,
      title: (input.title ?? '').trim(),
      provider: input.provider?.trim() || null,
      emoji: input.emoji?.trim() || '📚',
      color: input.color || '#8B5CF6',
      startDate: toUTC(input.startDate ?? todayISO(tz)),
      targetEndDate: input.targetEndDate ? toUTC(input.targetEndDate) : null,
      status: input.status ?? 'active',
      topics: {
        create: titles.map((title, i) => ({ title: title.slice(0, 160), order: i })),
      },
    },
    include: COURSE_INCLUDE,
  })
  return shapeCourse(row, todayISO(tz))
}

async function ownedCourse(userId: string, courseId: string) {
  const course = await db.course.findFirst({ where: { id: courseId, userId } })
  if (!course) throw new HttpError('Course not found', 404)
  return course
}

export async function updateCourse(userId: string, courseId: string, input: CourseInput, tz: string): Promise<CourseDTO> {
  const existing = await ownedCourse(userId, courseId)
  validateCourse({
    title: input.title ?? existing.title,
    startDate: input.startDate ?? existing.startDate.toISOString().slice(0, 10),
    targetEndDate:
      input.targetEndDate !== undefined ? input.targetEndDate : existing.targetEndDate?.toISOString().slice(0, 10) ?? null,
    status: input.status ?? existing.status,
  })
  const row = await db.course.update({
    where: { id: courseId },
    data: {
      title: input.title !== undefined ? input.title.trim() : existing.title,
      provider: input.provider !== undefined ? input.provider?.trim() || null : existing.provider,
      emoji: input.emoji?.trim() || existing.emoji,
      color: input.color || existing.color,
      startDate: input.startDate ? toUTC(input.startDate) : existing.startDate,
      targetEndDate:
        input.targetEndDate !== undefined
          ? input.targetEndDate
            ? toUTC(input.targetEndDate)
            : null
          : existing.targetEndDate,
      status: input.status ?? existing.status,
    },
    include: COURSE_INCLUDE,
  })
  return shapeCourse(row, todayISO(tz))
}

export async function deleteCourse(userId: string, courseId: string): Promise<void> {
  await ownedCourse(userId, courseId)
  await db.course.delete({ where: { id: courseId } })
}

/* ---------- topics ---------- */

export interface TopicInput {
  title?: string
  estMinutes?: number | null
  status?: string
  order?: number
}

export async function addTopic(userId: string, courseId: string, input: TopicInput, tz: string): Promise<CourseDTO> {
  if (!input.title?.trim()) throw new HttpError('Topic title is required', 422)
  if (input.title.trim().length > 160) throw new HttpError('Topic title must be 160 characters or fewer', 422)
  if (input.estMinutes != null && (!Number.isInteger(input.estMinutes) || input.estMinutes < 1 || input.estMinutes > 600)) {
    throw new HttpError('Estimated minutes must be 1–600', 422)
  }
  await ownedCourse(userId, courseId)
  const last = await db.courseTopic.findFirst({ where: { courseId }, orderBy: { order: 'desc' } })
  await db.courseTopic.create({
    data: {
      courseId,
      title: input.title.trim(),
      estMinutes: input.estMinutes ?? null,
      order: (last?.order ?? -1) + 1,
    },
  })
  const row = await db.course.findFirstOrThrow({ where: { id: courseId }, include: COURSE_INCLUDE })
  return shapeCourse(row, todayISO(tz))
}

async function ownedTopic(userId: string, topicId: string) {
  const t = await db.courseTopic.findFirst({ where: { id: topicId, course: { userId } } })
  if (!t) throw new HttpError('Topic not found', 404)
  return t
}

/**
 * Topic edit. Status transitions drive the revision ladder:
 *  - → done: first completion stamps firstStudiedAt and schedules revision #1
 *    (only when no ladder is already running — revisiting 'done' is a no-op
 *    for scheduling).
 *  - → todo/learning: clears the ladder state.
 */
export async function updateTopic(userId: string, topicId: string, input: TopicInput, tz: string): Promise<CourseDTO> {
  const existing = await ownedTopic(userId, topicId)
  if (input.title !== undefined && !input.title.trim()) throw new HttpError('Topic title is required', 422)
  if (input.status != null && !TOPIC_STATUSES.includes(input.status)) {
    throw new HttpError('Topic status must be todo, learning or done', 422)
  }
  const today = todayISO(tz)
  const nextStatus = (input.status ?? existing.status) as string
  const wasLadderRunning = existing.nextRevisionAt != null || existing.revisionStage > 0

  let ladder: { revisionStage: number; nextRevisionAt: ISODate | null } = {
    revisionStage: existing.revisionStage,
    nextRevisionAt: existing.nextRevisionAt ? existing.nextRevisionAt.toISOString().slice(0, 10) : null,
  }
  if (nextStatus === 'done') {
    if (!wasLadderRunning) ladder = startRevisionLadder(today)
  } else {
    ladder = { revisionStage: 0, nextRevisionAt: null }
  }

  await db.courseTopic.update({
    where: { id: topicId },
    data: {
      title: input.title !== undefined ? input.title.trim() : existing.title,
      estMinutes:
        input.estMinutes !== undefined ? input.estMinutes : existing.estMinutes,
      status: nextStatus,
      order: input.order ?? existing.order,
      firstStudiedAt:
        nextStatus === 'done' ? (existing.firstStudiedAt ?? new Date()) : null,
      revisionStage: ladder.revisionStage,
      nextRevisionAt: ladder.nextRevisionAt ? toUTC(ladder.nextRevisionAt) : null,
    },
  })
  const row = await db.course.findFirstOrThrow({ where: { id: existing.courseId }, include: COURSE_INCLUDE })
  return shapeCourse(row, today)
}

export async function deleteTopic(userId: string, topicId: string, tz: string): Promise<CourseDTO> {
  const existing = await ownedTopic(userId, topicId)
  await db.courseTopic.delete({ where: { id: topicId } })
  const row = await db.course.findFirstOrThrow({ where: { id: existing.courseId }, include: COURSE_INCLUDE })
  return shapeCourse(row, todayISO(tz))
}

/**
 * Revision-ladder step for a due topic. 'revised' advances the ladder,
 * 'forgot' restarts at the shortest gap. Rejects topics that are not due
 * (or not done) so the ladder can't be gamed out of order.
 */
export async function reviseTopic(
  userId: string,
  topicId: string,
  outcome: RevisionOutcome,
  tz: string,
): Promise<CourseDTO> {
  const existing = await ownedTopic(userId, topicId)
  const today = todayISO(tz)
  const dueNow =
    existing.status === 'done' &&
    existing.nextRevisionAt != null &&
    existing.nextRevisionAt.toISOString().slice(0, 10) <= today
  if (!dueNow) {
    throw new HttpError('This topic is not due for revision', 422)
  }
  const next = applyRevision(existing.revisionStage, outcome, today)
  await db.courseTopic.update({
    where: { id: topicId },
    data: { revisionStage: next.stage, nextRevisionAt: next.nextRevisionAt ? toUTC(next.nextRevisionAt) : null },
  })
  const row = await db.course.findFirstOrThrow({ where: { id: existing.courseId }, include: COURSE_INCLUDE })
  return shapeCourse(row, today)
}

/* ---------- sessions ---------- */

export interface SessionInput {
  date: string
  minutes: number
  topicId?: string | null
  note?: string | null
}

export async function logSession(userId: string, courseId: string, input: SessionInput, tz: string): Promise<CourseDTO> {
  if (!ISO_RE.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440) {
    throw new HttpError('Minutes must be 1–1440', 422)
  }
  await ownedCourse(userId, courseId)
  if (input.topicId) {
    const t = await db.courseTopic.findFirst({ where: { id: input.topicId, courseId } })
    if (!t) throw new HttpError('Topic not found on this course', 404)
  }
  await db.studySession.create({
    data: {
      userId,
      courseId,
      topicId: input.topicId || null,
      date: toUTC(input.date),
      minutes: input.minutes,
      note: input.note?.trim() || null,
    },
  })
  const row = await db.course.findFirstOrThrow({ where: { id: courseId }, include: COURSE_INCLUDE })
  return shapeCourse(row, todayISO(tz))
}

export async function deleteSession(userId: string, sessionId: string, tz: string): Promise<CourseDTO> {
  const s = await db.studySession.findFirst({ where: { id: sessionId, userId } })
  if (!s) throw new HttpError('Study session not found', 404)
  await db.studySession.delete({ where: { id: sessionId } })
  const row = await db.course.findFirstOrThrow({ where: { id: s.courseId }, include: COURSE_INCLUDE })
  return shapeCourse(row, todayISO(tz))
}

/**
 * Today widget: topics across all active courses whose revision is due
 * today (or overdue), soonest first.
 */
export async function revisionsDueForToday(userId: string, tz: string, limit = 6) {
  const today = todayISO(tz)
  const topics = await db.courseTopic.findMany({
    where: {
      status: 'done',
      nextRevisionAt: { lte: toUTC(today) },
      course: { userId, status: 'active' },
    },
    include: { course: { select: { title: true, emoji: true, color: true } } },
    orderBy: { nextRevisionAt: 'asc' },
    take: limit,
  })
  return topics.map((t) => ({
    topicId: t.id,
    topicTitle: t.title,
    stage: t.revisionStage,
    dueDate: t.nextRevisionAt ? t.nextRevisionAt.toISOString().slice(0, 10) : null,
    overdue: t.nextRevisionAt ? t.nextRevisionAt.toISOString().slice(0, 10) < today : false,
    courseId: t.courseId,
    courseTitle: t.course.title,
    courseEmoji: t.course.emoji,
    courseColor: t.course.color,
  }))
}

/**
 * The full course effort grid (Phase 10): GitHub-style minutes calendar over
 * the course's own window (start → today, capped at the last 400 days), plus
 * full-history weekly/monthly roll-ups. Minutes have no preset target, so
 * intensity levels come from nearest-rank quartiles of nonzero days (the
 * same fallback the goal grid uses without a target, Decision #43).
 */
export async function courseGrid(userId: string, courseId: string, tz: string): Promise<CourseGridPayloadDTO> {
  const course = await db.course.findFirst({ where: { id: courseId, userId } })
  if (!course) throw new HttpError('Course not found', 404)
  const today = todayISO(tz)

  const sessions = await db.studySession.findMany({
    where: { userId, courseId },
    select: { date: true, minutes: true },
    orderBy: { date: 'asc' },
  })
  // full-history minutes/day map for roll-ups (never window-capped, Decision #43)
  const byDay = new Map<string, number>()
  let totalMinutes = 0
  for (const s of sessions) {
    const iso = s.date.toISOString().slice(0, 10)
    byDay.set(iso, (byDay.get(iso) ?? 0) + s.minutes)
    totalMinutes += s.minutes
  }
  const activeDays = [...byDay.values()].filter((m) => m > 0).length
  const weekAgo = shiftISO(today, -6)
  let minutes7d = 0
  for (let i = 0; i < 7; i++) minutes7d += byDay.get(shiftISO(weekAgo, i)) ?? 0

  const startISO = course.startDate.toISOString().slice(0, 10)
  const window = trailingWindow(startISO, today)
  const grid = window ? buildGrid(window, today) : { pad: 0, cells: [], labels: [] }
  const windowValues = grid.cells.map((c) => ({ iso: c.iso, value: byDay.get(c.iso) ?? 0 }))
  const levels = levelsForValues(windowValues)

  return {
    course: {
      id: course.id,
      title: course.title,
      emoji: course.emoji,
      color: course.color,
      status: course.status,
      startDate: startISO,
      targetEndDate: course.targetEndDate ? course.targetEndDate.toISOString().slice(0, 10) : null,
    },
    today,
    window,
    pad: grid.pad,
    labels: grid.labels,
    days: windowValues.map((d, i) => ({
      iso: d.iso,
      value: d.value,
      level: levels[i],
      future: grid.cells[i].future,
      scheduled: false,
    })),
    rollups: {
      weeks: rollupWeeks(byDay, today),
      months: rollupMonths(byDay, today),
    },
    stats: {
      totalMinutes,
      activeDays,
      minutes7d,
      avgActiveDayMinutes: activeDays > 0 ? Math.round((totalMinutes / activeDays) * 10) / 10 : null,
    },
  }
}

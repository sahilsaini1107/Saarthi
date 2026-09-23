// Routine service: builder CRUD (steps replaced wholesale in a transaction)
// + play-mode run recording. One run per (routine, day); a replay upserts.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { currentStreak, normalizeWeekdays } from '@/lib/habits'
import { todayISO, toUTC } from '@/lib/date'
import type { RoutineWithMeta } from '@/lib/types'

export interface RoutineStepInput {
  title: string
  minutes?: number | null
}

export interface RoutineInput {
  name: string
  emoji?: string
  weekdays?: string
  reminderTime?: string | null
  steps: RoutineStepInput[]
  active?: boolean
}

export interface RoutineUpdateInput {
  name?: string
  emoji?: string
  weekdays?: string
  reminderTime?: string | null
  steps?: RoutineStepInput[]
  active?: boolean
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_STEPS = 20

function validate(input: { name: string; weekdays?: string; reminderTime?: string | null; steps: RoutineStepInput[] }) {
  if (!input.name.trim()) throw new HttpError('Routine name is required', 422)
  if (input.name.trim().length > 60) throw new HttpError('Routine name must be 60 characters or fewer', 422)
  if (input.weekdays != null) {
    try {
      normalizeWeekdays(input.weekdays)
    } catch {
      throw new HttpError('Weekdays must be a 7-char 0/1 schedule (Mon..Sun)', 422)
    }
  }
  if (input.reminderTime != null && input.reminderTime !== '' && !TIME_RE.test(input.reminderTime)) {
    throw new HttpError('Reminder time must be HH:MM', 422)
  }
  if (input.steps.length > MAX_STEPS) throw new HttpError(`A routine can have at most ${MAX_STEPS} steps`, 422)
  for (const s of input.steps) {
    if (!s.title.trim()) throw new HttpError('Every step needs a title', 422)
    if (s.title.trim().length > 80) throw new HttpError('Step titles must be 80 characters or fewer', 422)
    if (s.minutes != null && (!Number.isInteger(s.minutes) || s.minutes < 0 || s.minutes > 240)) {
      throw new HttpError('Step minutes must be 0–240', 422)
    }
  }
}

export async function createRoutine(userId: string, input: RoutineInput): Promise<void> {
  validate(input)
  await db.$transaction(async (tx) => {
    await tx.routine.create({
      data: {
        userId,
        name: input.name.trim(),
        emoji: input.emoji?.trim() || '🌅',
        weekdays: input.weekdays ?? '1111111',
        reminderTime: input.reminderTime || null,
        active: input.active ?? true,
        steps: {
          create: input.steps.map((s, i) => ({ order: i, title: s.title.trim(), minutes: s.minutes ?? null })),
        },
      },
    })
  })
}

export async function updateRoutine(userId: string, id: string, input: RoutineUpdateInput): Promise<void> {
  const existing = await db.routine.findFirst({
    where: { id, userId },
    include: { steps: { orderBy: { order: 'asc' } } },
  })
  if (!existing) throw new HttpError('Routine not found', 404)
  // Partial update: unspecified fields fall back to the stored routine; a
  // missing steps list keeps the existing steps untouched.
  const steps: RoutineStepInput[] =
    input.steps ?? existing.steps.map((s) => ({ title: s.title, minutes: s.minutes }))
  validate({
    name: input.name ?? existing.name,
    weekdays: input.weekdays ?? existing.weekdays,
    reminderTime: input.reminderTime !== undefined ? input.reminderTime : existing.reminderTime,
    steps,
  })
  await db.$transaction(async (tx) => {
    await tx.routineStep.deleteMany({ where: { routineId: id } })
    await tx.routine.update({
      where: { id },
      data: {
        name: (input.name ?? existing.name).trim(),
        emoji: input.emoji?.trim() || existing.emoji,
        weekdays: input.weekdays ?? existing.weekdays,
        reminderTime: input.reminderTime !== undefined ? input.reminderTime || null : existing.reminderTime,
        active: input.active ?? existing.active,
        steps: {
          create: steps.map((s, i) => ({ order: i, title: s.title.trim(), minutes: s.minutes ?? null })),
        },
      },
    })
  })
}

export async function deleteRoutine(userId: string, id: string): Promise<void> {
  const existing = await db.routine.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Routine not found', 404)
  await db.routine.delete({ where: { id } })
}

/**
 * Record (or replace) today's play run. Upsert semantics on the unique
 * (routineId, date) pair — replaying a routine refreshes the same run.
 */
export async function recordRun(
  userId: string,
  routineId: string,
  input: { date: string; completedSteps: number; totalSteps: number; secondsSpent: number },
): Promise<RoutineRunDTOShape> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (!Number.isInteger(input.completedSteps) || input.completedSteps < 0) throw new HttpError('completedSteps must be >= 0', 422)
  if (!Number.isInteger(input.totalSteps) || input.totalSteps < 0) throw new HttpError('totalSteps must be >= 0', 422)
  if (!Number.isInteger(input.secondsSpent) || input.secondsSpent < 0) throw new HttpError('secondsSpent must be >= 0', 422)

  const routine = await db.routine.findFirst({ where: { id: routineId, userId } })
  if (!routine) throw new HttpError('Routine not found', 404)

  const date = toUTC(input.date)
  const data = {
    completedSteps: input.completedSteps,
    totalSteps: input.totalSteps,
    secondsSpent: input.secondsSpent,
  }
  const run = await db.routineRun.upsert({
    where: { routineId_date: { routineId, date } },
    create: { userId, routineId, date, ...data },
    update: data,
  })
  return {
    date: run.date.toISOString().slice(0, 10),
    completedSteps: run.completedSteps,
    totalSteps: run.totalSteps,
    secondsSpent: run.secondsSpent,
  }
}

interface RoutineRunDTOShape {
  date: string
  completedSteps: number
  totalSteps: number
  secondsSpent: number
}

export async function listRoutines(userId: string, tz: string): Promise<RoutineWithMeta[]> {
  const today = todayISO(tz)
  const routines = await db.routine.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { steps: { orderBy: { order: 'asc' } }, runs: { orderBy: { date: 'desc' } } },
  })
  const allRuns = await db.routineRun.findMany({
    where: { userId },
    select: { routineId: true, date: true },
    orderBy: { date: 'asc' },
  })
  const runsByRoutine = new Map<string, string[]>()
  for (const r of allRuns) {
    const list = runsByRoutine.get(r.routineId) ?? []
    list.push(r.date.toISOString().slice(0, 10))
    runsByRoutine.set(r.routineId, list)
  }

  return routines.map((r) => {
    const runs = r.runs.map((run) => ({
      date: run.date.toISOString().slice(0, 10),
      completedSteps: run.completedSteps,
      totalSteps: run.totalSteps,
      secondsSpent: run.secondsSpent,
    }))
    const runDates = runsByRoutine.get(r.id) ?? []
    const runSet = new Set(runDates)
    return {
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      weekdays: r.weekdays,
      reminderTime: r.reminderTime,
      active: r.active,
      steps: r.steps.map((s) => ({ id: s.id, order: s.order, title: s.title, minutes: s.minutes })),
      todayRun: runs.find((run) => run.date === today) ?? null,
      lastRun: runs[0] ?? null,
      streak: currentStreak(runSet, r.weekdays, today),
      plannedMinutes: r.steps.reduce((sum, s) => sum + (s.minutes ?? 0), 0),
    }
  })
}

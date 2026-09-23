// Strength-coach service (Phase 13). Everything user-scoped — every query
// filters by userId either directly or through a verified parent row.
// Pure math lives in lib/fitness.ts; this file owns validation + persistence.
//
// Session lifecycle (Decision #50): creating a session opens it (durationMin
// 0). Finishing = PATCH durationMin (1–1440). An "open" session is therefore
// durationMin === 0 created within the last ~24h — the Today card picks it up
// as "continue workout".

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { shiftISO, todayISO, toUTC } from '@/lib/date'
import { youtubeId } from '@/lib/content'
import { mergeDailyNutrition, sumMealEntries } from '@/lib/meals'
import {
  bulkPace,
  est1RMGrams,
  gramsToKg,
  nextPlanDay,
  progressionDelta,
  proteinAdherence,
  sessionVolumeGrams,
  sessionsInWindow,
  suggestNutrition,
  topSet,
  type SetLike,
} from '@/lib/fitness'
import type {
  Equipment,
  ExerciseProgressDTO,
  FitnessHighlightDTO,
  FitnessSummaryDTO,
  MealEntryDTO,
  MuscleGroup,
  NutritionPayloadDTO,
  PlanDayDTO,
  PlanExerciseDTO,
  ProgressionDTO,
  SessionExerciseDTO,
  SetLogDTO,
  WorkoutPlanDTO,
  WorkoutSessionDTO,
  WorkoutSessionDetailDTO,
} from '@/lib/types'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const MUSCLE_GROUPS: readonly MuscleGroup[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full_body', 'cardio', 'other']
const EQUIPMENT: readonly Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other']

const MAX_LOAD_GRAMS = 500_000 // 500 kg
const MAX_REPS = 200
const MAX_SECONDS = 3600 // 1 h per set

function checkISO(date: string): string {
  if (!ISO_RE.test(date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  return date
}

function checkEnum(value: string, allowed: readonly string[], label: string): string {
  if (!allowed.includes(value)) throw new HttpError(`Unknown ${label}: ${value}`, 422)
  return value
}

/* ======================= exercises ======================= */

export async function listExercises(userId: string, q?: string): Promise<{ exercises: { id: string; name: string; muscleGroup: MuscleGroup; equipment: Equipment; usageCount: number }[] }> {
  const rows = await db.exercise.findMany({
    where: { userId, ...(q ? { name: { contains: q } } : {}) },
    orderBy: { name: 'asc' },
    include: { _count: { select: { setLogs: true } } },
  })
  return {
    exercises: rows.map((e) => ({
      id: e.id,
      name: e.name,
      muscleGroup: e.muscleGroup as MuscleGroup,
      equipment: e.equipment as Equipment,
      usageCount: e._count.setLogs,
    })),
  }
}

/** Find-or-create by (userId, name) — the session logger and plan editor both use this. */
export async function upsertExercise(
  userId: string,
  input: { name: string; muscleGroup?: string; equipment?: string },
) {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 80) throw new HttpError('Exercise name must be 1–80 characters', 422)
  const muscleGroup = input.muscleGroup ? checkEnum(input.muscleGroup, MUSCLE_GROUPS, 'muscle group') : 'other'
  const equipment = input.equipment ? checkEnum(input.equipment, EQUIPMENT, 'equipment') : 'other'
  const existing = await db.exercise.findUnique({ where: { userId_name: { userId, name } } })
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      muscleGroup: existing.muscleGroup as MuscleGroup,
      equipment: existing.equipment as Equipment,
      usageCount: 0,
    }
  }
  const row = await db.exercise.create({ data: { userId, name, muscleGroup, equipment } })
  return { id: row.id, name: row.name, muscleGroup: row.muscleGroup as MuscleGroup, equipment: row.equipment as Equipment, usageCount: 0 }
}

/** Deletable only while unused — renaming history is safe, orphaning it is not. */
export async function deleteExercise(userId: string, exerciseId: string): Promise<void> {
  const existing = await db.exercise.findFirst({ where: { id: exerciseId, userId } })
  if (!existing) throw new HttpError('Exercise not found', 404)
  const [setCount, planCount] = await Promise.all([
    db.setLog.count({ where: { exerciseId } }),
    db.planExercise.count({ where: { exerciseId } }),
  ])
  if (setCount > 0 || planCount > 0) {
    throw new HttpError('Exercise is used by logged sets or a plan and cannot be deleted', 409)
  }
  await db.exercise.delete({ where: { id: exerciseId } })
}

/* ---------- exercise media (Phase 19) ---------- */

const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB — form-check photos are small

export interface ExerciseMediaInput {
  youtubeUrl?: string | null
  photo?: { fileName: string; mime: string; dataBase64: string } | null
}

/** Attach / replace / clear media on an exercise (shared by plan + sessions). */
export async function setExerciseMedia(userId: string, exerciseId: string, input: ExerciseMediaInput): Promise<void> {
  const existing = await db.exercise.findFirst({ where: { id: exerciseId, userId } })
  if (!existing) throw new HttpError('Exercise not found', 404)

  const data: Record<string, unknown> = {}
  if (input.youtubeUrl !== undefined) {
    const url = input.youtubeUrl?.trim() || null
    if (url && !youtubeId(url)) throw new HttpError('Media needs a YouTube link (watch, youtu.be, shorts, embed…)', 422)
    if (url && url.length > 1000) throw new HttpError('URL must be 1000 characters or fewer', 422)
    data.mediaUrl = url
  }
  if (input.photo !== undefined) {
    if (input.photo === null) {
      data.photoData = null
      data.photoMime = null
      data.photoName = null
    } else {
      if (!input.photo.mime.startsWith('image/')) throw new HttpError('Only image photos are supported', 415)
      const buf = Buffer.from(input.photo.dataBase64, 'base64')
      if (buf.length === 0) throw new HttpError('Photo is empty', 422)
      if (buf.length > MAX_PHOTO_BYTES) throw new HttpError('Photo is larger than 5 MB', 413)
      data.photoData = buf
      data.photoMime = input.photo.mime
      data.photoName = input.photo.fileName.slice(0, 200)
    }
  }
  if (Object.keys(data).length === 0) throw new HttpError('Nothing to update', 422)
  await db.exercise.update({ where: { id: exerciseId }, data })
}

export async function clearExerciseMedia(userId: string, exerciseId: string): Promise<void> {
  const existing = await db.exercise.findFirst({ where: { id: exerciseId, userId } })
  if (!existing) throw new HttpError('Exercise not found', 404)
  await db.exercise.update({
    where: { id: exerciseId },
    data: { mediaUrl: null, photoData: null, photoMime: null, photoName: null },
  })
}

export async function getExercisePhoto(userId: string, exerciseId: string): Promise<{ fileName: string; mime: string; data: Uint8Array }> {
  const row = await db.exercise.findFirst({
    where: { id: exerciseId, userId },
    select: { photoName: true, photoMime: true, photoData: true },
  })
  if (!row || !row.photoData || !row.photoMime) throw new HttpError('Photo not found', 404)
  return {
    fileName: row.photoName ?? 'photo',
    mime: row.photoMime,
    data: new Uint8Array(Buffer.from(row.photoData as Buffer)),
  }
}

/** Derived media view for DTOs — the YouTube ID is parsed, never stored (Decision #68). */
function mediaOf(ex: { mediaUrl: string | null; photoMime: string | null }): { youtubeId: string | null; hasPhoto: boolean } | null {
  const vid = ex.mediaUrl ? youtubeId(ex.mediaUrl) : null
  if (!vid && !ex.photoMime) return null
  return { youtubeId: vid, hasPhoto: ex.photoMime != null }
}

/* ======================= plans ======================= */

function shapePlanExercise(pe: {
  id: string
  exerciseId: string
  order: number
  sets: number
  repMin: number | null
  repMax: number | null
  secondsMin: number | null
  secondsMax: number | null
  restSeconds: number | null
  note: string | null
  exercise: { id: string; name: string; muscleGroup: string; equipment: string }
}): PlanExerciseDTO {
  return {
    id: pe.id,
    exerciseId: pe.exerciseId,
    name: pe.exercise.name,
    muscleGroup: pe.exercise.muscleGroup as MuscleGroup,
    equipment: pe.exercise.equipment as Equipment,
    order: pe.order,
    sets: pe.sets,
    repMin: pe.repMin,
    repMax: pe.repMax,
    secondsMin: pe.secondsMin,
    secondsMax: pe.secondsMax,
    restSeconds: pe.restSeconds,
    note: pe.note,
  }
}

function shapePlanDay(d: { id: string; order: number; label: string; focus: string | null; exercises: Parameters<typeof shapePlanExercise>[0][] }): PlanDayDTO {
  return {
    id: d.id,
    order: d.order,
    label: d.label,
    focus: d.focus,
    exercises: [...d.exercises].sort((a, b) => a.order - b.order).map(shapePlanExercise),
  }
}

export async function listPlans(userId: string): Promise<{ plans: WorkoutPlanDTO[] }> {
  const rows = await db.workoutPlan.findMany({
    where: { userId },
    orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
    include: {
      days: { orderBy: { order: 'asc' }, include: { exercises: { orderBy: { order: 'asc' }, include: { exercise: true } } } },
      _count: { select: { sessions: true } },
    },
  })
  return {
    plans: rows.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      note: p.note,
      active: p.active,
      sessionCount: p._count.sessions,
      days: p.days.map((d) => shapePlanDay(d as never)),
    })),
  }
}

export interface CreatePlanInput {
  name: string
  emoji?: string
  note?: string | null
  activate?: boolean
  days: {
    label: string
    focus?: string | null
    exercises: {
      name: string
      muscleGroup?: string
      equipment?: string
      sets: number
      repMin?: number | null
      repMax?: number | null
      secondsMin?: number | null
      secondsMax?: number | null
      restSeconds?: number | null
      note?: string | null
    }[]
  }[]
}

function validatePrescription(e: CreatePlanInput['days'][number]['exercises'][number], idx: string) {
  if (!Number.isInteger(e.sets) || e.sets < 1 || e.sets > 20) throw new HttpError(`${idx}: sets must be 1–20`, 422)
  const hasReps = e.repMin != null || e.repMax != null
  const hasSeconds = e.secondsMin != null || e.secondsMax != null
  if (!hasReps && !hasSeconds) throw new HttpError(`${idx}: set a rep range or a seconds range`, 422)
  for (const [k, v] of Object.entries({ repMin: e.repMin, repMax: e.repMax })) {
    if (v != null && (!Number.isInteger(v) || v < 1 || v > MAX_REPS)) throw new HttpError(`${idx}: ${k} must be 1–${MAX_REPS}`, 422)
  }
  for (const [k, v] of Object.entries({ secondsMin: e.secondsMin, secondsMax: e.secondsMax })) {
    if (v != null && (!Number.isInteger(v) || v < 1 || v > MAX_SECONDS)) throw new HttpError(`${idx}: ${k} must be 1–${MAX_SECONDS}`, 422)
  }
  if (e.restSeconds != null && (!Number.isInteger(e.restSeconds) || e.restSeconds < 0 || e.restSeconds > 1200)) {
    throw new HttpError(`${idx}: restSeconds must be 0–1200`, 422)
  }
}

export async function createPlan(userId: string, input: CreatePlanInput): Promise<WorkoutPlanDTO> {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 60) throw new HttpError('Plan name must be 1–60 characters', 422)
  if (!Array.isArray(input.days) || input.days.length < 1 || input.days.length > 10) {
    throw new HttpError('A plan needs 1–10 days', 422)
  }
  for (const d of input.days) {
    if (!d.label?.trim() || d.label.trim().length > 40) throw new HttpError('Day labels must be 1–40 characters', 422)
    if (!Array.isArray(d.exercises) || d.exercises.length < 1 || d.exercises.length > 15) {
      throw new HttpError(`"${d.label.trim()}" needs 1–15 exercises`, 422)
    }
    d.exercises.forEach((e, i) => validatePrescription(e, `${d.label.trim()} · exercise ${i + 1}`))
  }

  const activate = input.activate ?? true
  const plan = await db.$transaction(async (tx) => {
    if (activate) await tx.workoutPlan.updateMany({ where: { userId, active: true }, data: { active: false } })
    const created = await tx.workoutPlan.create({
      data: {
        userId,
        name,
        emoji: input.emoji?.trim() || '🏋️',
        note: input.note?.trim() || null,
        active: activate,
      },
    })
    for (const [di, d] of input.days.entries()) {
      const day = await tx.planDay.create({
        data: { planId: created.id, order: di, label: d.label.trim(), focus: d.focus?.trim() || null },
      })
      for (const [ei, e] of d.exercises.entries()) {
        const exName = e.name.trim()
        if (exName.length < 1 || exName.length > 80) throw new HttpError('Exercise name must be 1–80 characters', 422)
        const muscleGroup = e.muscleGroup ? checkEnum(e.muscleGroup, MUSCLE_GROUPS, 'muscle group') : 'other'
        const equipment = e.equipment ? checkEnum(e.equipment, EQUIPMENT, 'equipment') : 'other'
        const ex = await tx.exercise.upsert({
          where: { userId_name: { userId, name: exName } },
          create: { userId, name: exName, muscleGroup, equipment },
          update: {},
        })
        await tx.planExercise.create({
          data: {
            dayId: day.id,
            exerciseId: ex.id,
            order: ei,
            sets: e.sets,
            repMin: e.repMin ?? null,
            repMax: e.repMax ?? null,
            secondsMin: e.secondsMin ?? null,
            secondsMax: e.secondsMax ?? null,
            restSeconds: e.restSeconds ?? null,
            note: e.note?.trim() || null,
          },
        })
      }
    }
    return created
  })

  const shaped = await db.workoutPlan.findUnique({
    where: { id: plan.id },
    include: {
      days: { orderBy: { order: 'asc' }, include: { exercises: { orderBy: { order: 'asc' }, include: { exercise: true } } } },
      _count: { select: { sessions: true } },
    },
  })
  if (!shaped) throw new HttpError('Plan vanished during creation', 500)
  return {
    id: shaped.id,
    name: shaped.name,
    emoji: shaped.emoji,
    note: shaped.note,
    active: shaped.active,
    sessionCount: shaped._count.sessions,
    days: shaped.days.map((d) => shapePlanDay(d as never)),
  }
}

export async function updatePlan(userId: string, planId: string, input: { name?: string; emoji?: string; note?: string | null; active?: boolean }): Promise<WorkoutPlanDTO> {
  const existing = await db.workoutPlan.findFirst({ where: { id: planId, userId } })
  if (!existing) throw new HttpError('Plan not found', 404)
  if (input.name != null && (input.name.trim().length < 1 || input.name.trim().length > 60)) {
    throw new HttpError('Plan name must be 1–60 characters', 422)
  }
  await db.$transaction(async (tx) => {
    if (input.active === true) await tx.workoutPlan.updateMany({ where: { userId, active: true }, data: { active: false } })
    await tx.workoutPlan.update({
      where: { id: planId },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.emoji != null ? { emoji: input.emoji.trim() || '🏋️' } : {}),
        ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
        ...(input.active != null ? { active: input.active } : {}),
      },
    })
  })
  const plans = await listPlans(userId)
  const updated = plans.plans.find((p) => p.id === planId)
  if (!updated) throw new HttpError('Plan not found after update', 500)
  return updated
}

export async function deletePlan(userId: string, planId: string): Promise<void> {
  const existing = await db.workoutPlan.findFirst({ where: { id: planId, userId } })
  if (!existing) throw new HttpError('Plan not found', 404)
  await db.workoutPlan.delete({ where: { id: planId } }) // cascades days + plan exercises; sessions keep planId via SetNull
}

/* ---------- plan days ---------- */

export async function addPlanDay(userId: string, planId: string, input: { label: string; focus?: string | null }): Promise<PlanDayDTO> {
  const plan = await db.workoutPlan.findFirst({ where: { id: planId, userId } })
  if (!plan) throw new HttpError('Plan not found', 404)
  const label = input.label?.trim()
  if (!label || label.length > 40) throw new HttpError('Day label must be 1–40 characters', 422)
  const count = await db.planDay.count({ where: { planId } })
  if (count >= 10) throw new HttpError('A plan can have at most 10 days', 422)
  const day = await db.planDay.create({ data: { planId, order: count, label, focus: input.focus?.trim() || null } })
  return { id: day.id, order: day.order, label: day.label, focus: day.focus, exercises: [] }
}

export async function updatePlanDay(userId: string, dayId: string, input: { label?: string; focus?: string | null; order?: number }): Promise<void> {
  const day = await db.planDay.findFirst({ where: { id: dayId, plan: { userId } } })
  if (!day) throw new HttpError('Plan day not found', 404)
  if (input.order != null) {
    const siblings = await db.planDay.findMany({ where: { planId: day.planId }, orderBy: { order: 'asc' } })
    const target = Math.max(0, Math.min(input.order, siblings.length - 1))
    const reordered = siblings.filter((d) => d.id !== dayId)
    reordered.splice(target, 0, { id: dayId } as never)
    await db.$transaction(
      reordered.map((d, i) => db.planDay.update({ where: { id: d.id }, data: { order: i } })),
    )
  }
  await db.planDay.update({
    where: { id: dayId },
    data: {
      ...(input.label != null ? { label: input.label.trim() || day.label } : {}),
      ...(input.focus !== undefined ? { focus: input.focus?.trim() || null } : {}),
    },
  })
}

export async function deletePlanDay(userId: string, dayId: string): Promise<void> {
  const day = await db.planDay.findFirst({ where: { id: dayId, plan: { userId } } })
  if (!day) throw new HttpError('Plan day not found', 404)
  await db.$transaction(async (tx) => {
    await tx.planDay.delete({ where: { id: dayId } })
    const siblings = await tx.planDay.findMany({ where: { planId: day.planId }, orderBy: { order: 'asc' } })
    for (const [i, s] of siblings.entries()) await tx.planDay.update({ where: { id: s.id }, data: { order: i } })
  })
}

/* ---------- plan exercises ---------- */

export interface PlanExerciseInput {
  name: string
  muscleGroup?: string
  equipment?: string
  sets: number
  repMin?: number | null
  repMax?: number | null
  secondsMin?: number | null
  secondsMax?: number | null
  restSeconds?: number | null
  note?: string | null
}

export async function addPlanExercise(userId: string, dayId: string, input: PlanExerciseInput): Promise<PlanExerciseDTO> {
  const day = await db.planDay.findFirst({ where: { id: dayId, plan: { userId } } })
  if (!day) throw new HttpError('Plan day not found', 404)
  validatePrescription(input, input.name.trim() || 'exercise')
  const count = await db.planExercise.count({ where: { dayId } })
  if (count >= 15) throw new HttpError('A day can have at most 15 exercises', 422)
  const ex = await upsertExercise(userId, input)
  const pe = await db.planExercise.create({
    data: {
      dayId,
      exerciseId: ex.id,
      order: count,
      sets: input.sets,
      repMin: input.repMin ?? null,
      repMax: input.repMax ?? null,
      secondsMin: input.secondsMin ?? null,
      secondsMax: input.secondsMax ?? null,
      restSeconds: input.restSeconds ?? null,
      note: input.note?.trim() || null,
    },
    include: { exercise: true },
  })
  return shapePlanExercise(pe)
}

export async function updatePlanExercise(userId: string, peId: string, input: Partial<PlanExerciseInput> & { order?: number }): Promise<void> {
  const pe = await db.planExercise.findFirst({ where: { id: peId, day: { plan: { userId } } } })
  if (!pe) throw new HttpError('Plan exercise not found', 404)
  if (input.order != null) {
    const siblings = await db.planExercise.findMany({ where: { dayId: pe.dayId }, orderBy: { order: 'asc' } })
    const target = Math.max(0, Math.min(input.order, siblings.length - 1))
    const reordered = siblings.filter((s) => s.id !== peId)
    reordered.splice(target, 0, { id: peId } as never)
    await db.$transaction(
      reordered.map((s, i) => db.planExercise.update({ where: { id: s.id }, data: { order: i } })),
    )
  }
  const data: Record<string, unknown> = {}
  if (input.sets != null) {
    if (!Number.isInteger(input.sets) || input.sets < 1 || input.sets > 20) throw new HttpError('sets must be 1–20', 422)
    data.sets = input.sets
  }
  for (const k of ['repMin', 'repMax'] as const) {
    if (input[k] !== undefined) {
      const v = input[k]
      if (v != null && (!Number.isInteger(v) || v < 1 || v > MAX_REPS)) throw new HttpError(`${k} must be 1–${MAX_REPS}`, 422)
      data[k] = v
    }
  }
  for (const k of ['secondsMin', 'secondsMax'] as const) {
    if (input[k] !== undefined) {
      const v = input[k]
      if (v != null && (!Number.isInteger(v) || v < 1 || v > MAX_SECONDS)) throw new HttpError(`${k} must be 1–${MAX_SECONDS}`, 422)
      data[k] = v
    }
  }
  if (input.restSeconds !== undefined) {
    const v = input.restSeconds
    if (v != null && (!Number.isInteger(v) || v < 0 || v > 1200)) throw new HttpError('restSeconds must be 0–1200', 422)
    data.restSeconds = v
  }
  if (input.note !== undefined) data.note = input.note?.trim() || null
  if (Object.keys(data).length > 0) await db.planExercise.update({ where: { id: peId }, data })
}

export async function deletePlanExercise(userId: string, peId: string): Promise<void> {
  const pe = await db.planExercise.findFirst({ where: { id: peId, day: { plan: { userId } } } })
  if (!pe) throw new HttpError('Plan exercise not found', 404)
  await db.$transaction(async (tx) => {
    await tx.planExercise.delete({ where: { id: peId } })
    const siblings = await tx.planExercise.findMany({ where: { dayId: pe.dayId }, orderBy: { order: 'asc' } })
    for (const [i, s] of siblings.entries()) await tx.planExercise.update({ where: { id: s.id }, data: { order: i } })
  })
}

/* ======================= sessions ======================= */

function shapeSet(s: {
  id: string
  exerciseId: string
  order: number
  setNumber: number
  weightGrams: number | null
  reps: number | null
  durationSeconds: number | null
  isWarmup: boolean
  exercise: { id: string; name: string; muscleGroup: string }
}): SetLogDTO {
  return {
    id: s.id,
    exerciseId: s.exerciseId,
    exerciseName: s.exercise.name,
    muscleGroup: s.exercise.muscleGroup as MuscleGroup,
    order: s.order,
    setNumber: s.setNumber,
    weightGrams: s.weightGrams,
    reps: s.reps,
    durationSeconds: s.durationSeconds,
    isWarmup: s.isWarmup,
  }
}

function shapeSession(s: {
  id: string
  date: Date
  label: string
  durationMin: number
  note: string | null
  planId: string | null
  planDayId: string | null
  sets: Parameters<typeof shapeSet>[0][]
}): WorkoutSessionDTO {
  const sets = s.sets.map(shapeSet)
  return {
    id: s.id,
    date: s.date.toISOString().slice(0, 10),
    label: s.label,
    durationMin: s.durationMin,
    note: s.note,
    planId: s.planId,
    planDayId: s.planDayId,
    open: s.durationMin === 0,
    sets,
    volumeGrams: sessionVolumeGrams(sets.map((x) => ({ weightGrams: x.weightGrams, reps: x.reps, isWarmup: x.isWarmup }))),
    topSetWeightGrams: topSet(sets.map((x) => ({ weightGrams: x.weightGrams, reps: x.reps, isWarmup: x.isWarmup })))?.weightGrams ?? null,
  }
}

const SESSION_INCLUDE = {
  sets: { orderBy: [{ order: 'asc' as const }, { id: 'asc' as const }], include: { exercise: true } },
}

export async function listSessions(userId: string, take = 30): Promise<{ sessions: WorkoutSessionDTO[] }> {
  const rows = await db.workoutSession.findMany({
    where: { userId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: Math.min(Math.max(take, 1), 100),
    include: SESSION_INCLUDE,
  })
  return { sessions: rows.map(shapeSession) }
}

export async function createSession(
  userId: string,
  input: { planDayId?: string; label?: string; date?: string },
  tz: string,
): Promise<WorkoutSessionDetailDTO> {
  const date = checkISO(input.date ?? todayISO(tz))
  let label = input.label?.trim() ?? ''
  let planId: string | null = null
  let planDayId: string | null = null

  if (input.planDayId) {
    const day = await db.planDay.findFirst({
      where: { id: input.planDayId, plan: { userId } },
      include: { plan: true },
    })
    if (!day) throw new HttpError('Plan day not found', 404)
    planId = day.planId
    planDayId = day.id
    if (!label) label = day.label
  }
  if (!label) label = 'Workout'
  if (label.length > 60) throw new HttpError('Session label must be ≤60 characters', 422)

  const created = await db.workoutSession.create({ data: { userId, date: toUTC(date), label, planId, planDayId } })
  return sessionDetail(userId, created.id, tz)
}

export async function sessionDetail(userId: string, sessionId: string, tz: string): Promise<WorkoutSessionDetailDTO> {
  const session = await db.workoutSession.findFirst({ where: { id: sessionId, userId }, include: SESSION_INCLUDE })
  if (!session) throw new HttpError('Session not found', 404)
  const base = shapeSession(session)

  // Targets from the linked plan day (if any), in plan order.
  let targets: Map<string, { pe: PlanExerciseDTO; seq: number }> = new Map()
  if (session.planDayId) {
    const day = await db.planDay.findFirst({
      where: { id: session.planDayId },
      include: { exercises: { orderBy: { order: 'asc' }, include: { exercise: true } } },
    })
    if (day) {
      targets = new Map(
        day.exercises.map((pe, i) => [pe.exerciseId, { pe: shapePlanExercise(pe), seq: i }] as const),
      )
    }
  }

  // Exercises actually used in this session but not on the plan day → appended.
  const usedIds = new Set(base.sets.map((s) => s.exerciseId))
  const extraIds = [...usedIds].filter((id) => !targets.has(id))
  const extras = extraIds.length > 0
    ? await db.exercise.findMany({ where: { id: { in: extraIds } } })
    : []

  // Phase 19 — media per exercise (plan-day rows + freeform extras)
  const mediaById = new Map<string, { youtubeId: string | null; hasPhoto: boolean } | null>()
  if (session.planDayId) {
    const dayRows = await db.planExercise.findMany({
      where: { dayId: session.planDayId },
      select: { exerciseId: true, exercise: { select: { mediaUrl: true, photoMime: true } } },
    })
    for (const r of dayRows) mediaById.set(r.exerciseId, mediaOf(r.exercise))
  }
  for (const ex of extras) mediaById.set(ex.id, mediaOf(ex))

  // Previous-session top sets per exercise + progression vs them.
  const allExIds = [...targets.keys(), ...extraIds]
  const lastTops = await Promise.all(
    allExIds.map(async (exerciseId) => {
      const prev = await db.setLog.findMany({
        where: { userId, exerciseId, isWarmup: false, session: { id: { not: sessionId }, durationMin: { gt: 0 } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { session: { select: { date: true } } },
      })
      if (prev.length === 0) return [exerciseId, null] as const
      // group by session, take the most recent session's top set
      const bySession = new Map<string, { date: string; sets: SetLike[] }>()
      for (const s of prev) {
        const iso = s.session.date.toISOString().slice(0, 10)
        if (!bySession.has(iso)) bySession.set(iso, { date: iso, sets: [] })
        bySession.get(iso)!.sets.push({ weightGrams: s.weightGrams, reps: s.reps })
      }
      const sessionsSorted = [...bySession.values()].sort((a, b) => b.date.localeCompare(a.date))
      const top = topSet(sessionsSorted[0].sets)
      return [exerciseId, top ? { date: sessionsSorted[0].date, weightGrams: top.weightGrams, reps: top.reps } : null] as const
    }),
  )
  const lastTopMap = new Map(lastTops)

  const exercises: SessionExerciseDTO[] = []
  const targetEntries = [...targets.entries()].sort((a, b) => a[1].seq - b[1].seq)
  for (const [exerciseId, { pe }] of targetEntries) {
    const lastTop = lastTopMap.get(exerciseId) ?? null
    const curSets = base.sets.filter((s) => s.exerciseId === exerciseId)
    const curTop = topSet(curSets.map((x) => ({ weightGrams: x.weightGrams, reps: x.reps, isWarmup: x.isWarmup })))
    const prog: ProgressionDTO | null =
      curTop && lastTop ? progressionDelta(curTop, lastTop) : null
    exercises.push({
      exerciseId,
      name: pe.name,
      muscleGroup: pe.muscleGroup,
      target: {
        sets: pe.sets,
        repMin: pe.repMin,
        repMax: pe.repMax,
        secondsMin: pe.secondsMin,
        secondsMax: pe.secondsMax,
        restSeconds: pe.restSeconds,
        note: pe.note,
      },
      lastTop,
      progression: prog,
      sets: curSets,
      media: mediaById.get(exerciseId) ?? null,
    })
  }
  for (const ex of extras) {
    const lastTop = lastTopMap.get(ex.id) ?? null
    const curSets = base.sets.filter((s) => s.exerciseId === ex.id)
    const curTop = topSet(curSets.map((x) => ({ weightGrams: x.weightGrams, reps: x.reps, isWarmup: x.isWarmup })))
    const prog: ProgressionDTO | null = curTop && lastTop ? progressionDelta(curTop, lastTop) : null
    exercises.push({
      exerciseId: ex.id,
      name: ex.name,
      muscleGroup: ex.muscleGroup as MuscleGroup,
      target: null,
      lastTop,
      progression: prog,
      sets: curSets,
      media: mediaById.get(ex.id) ?? null,
    })
  }

  return { ...base, exercises }
}

export async function updateSession(
  userId: string,
  sessionId: string,
  input: { label?: string; durationMin?: number; note?: string | null; date?: string },
  tz: string,
): Promise<WorkoutSessionDetailDTO> {
  const existing = await db.workoutSession.findFirst({ where: { id: sessionId, userId } })
  if (!existing) throw new HttpError('Session not found', 404)
  const data: Record<string, unknown> = {}
  if (input.label != null) {
    const label = input.label.trim()
    if (label.length < 1 || label.length > 60) throw new HttpError('Session label must be 1–60 characters', 422)
    data.label = label
  }
  if (input.durationMin != null) {
    if (!Number.isInteger(input.durationMin) || input.durationMin < 1 || input.durationMin > 1440) {
      throw new HttpError('durationMin must be 1–1440', 422)
    }
    data.durationMin = input.durationMin
  }
  if (input.note !== undefined) data.note = input.note?.trim() || null
  if (input.date != null) data.date = toUTC(checkISO(input.date))
  if (Object.keys(data).length > 0) await db.workoutSession.update({ where: { id: sessionId }, data })
  return sessionDetail(userId, sessionId, tz)
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  const existing = await db.workoutSession.findFirst({ where: { id: sessionId, userId } })
  if (!existing) throw new HttpError('Session not found', 404)
  await db.workoutSession.delete({ where: { id: sessionId } })
}

/* ---------- sets ---------- */

export interface AddSetInput {
  exerciseId?: string
  name?: string
  muscleGroup?: string
  equipment?: string
  weightGrams?: number | null
  reps?: number | null
  durationSeconds?: number | null
  isWarmup?: boolean
}

export async function addSet(userId: string, sessionId: string, input: AddSetInput, tz: string): Promise<WorkoutSessionDetailDTO> {
  const session = await db.workoutSession.findFirst({ where: { id: sessionId, userId } })
  if (!session) throw new HttpError('Session not found', 404)

  let exerciseId = input.exerciseId
  if (exerciseId) {
    const ex = await db.exercise.findFirst({ where: { id: exerciseId, userId } })
    if (!ex) throw new HttpError('Exercise not found', 404)
  } else {
    if (!input.name?.trim()) throw new HttpError('Provide exerciseId or name', 422)
    const ex = await upsertExercise(userId, { name: input.name, muscleGroup: input.muscleGroup, equipment: input.equipment })
    exerciseId = ex.id
  }

  const weightGrams = input.weightGrams ?? null
  const reps = input.reps ?? null
  const durationSeconds = input.durationSeconds ?? null
  if (weightGrams != null && (!Number.isInteger(weightGrams) || weightGrams < 0 || weightGrams > MAX_LOAD_GRAMS)) {
    throw new HttpError(`weightGrams must be 0–${MAX_LOAD_GRAMS}`, 422)
  }
  if (reps != null && (!Number.isInteger(reps) || reps < 0 || reps > MAX_REPS)) throw new HttpError(`reps must be 0–${MAX_REPS}`, 422)
  if (durationSeconds != null && (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > MAX_SECONDS)) {
    throw new HttpError(`durationSeconds must be 0–${MAX_SECONDS}`, 422)
  }
  const hasReps = reps != null && reps > 0
  const hasSeconds = durationSeconds != null && durationSeconds > 0
  if (!hasReps && !hasSeconds) throw new HttpError('A set needs reps or seconds', 422)

  const count = await db.setLog.count({ where: { sessionId } })
  const perExerciseCount = await db.setLog.count({ where: { sessionId, exerciseId } })
  await db.setLog.create({
    data: {
      userId,
      sessionId,
      exerciseId,
      order: count,
      setNumber: perExerciseCount + 1,
      weightGrams: weightGrams && weightGrams > 0 ? weightGrams : null,
      reps: hasReps ? reps : null,
      durationSeconds: hasSeconds ? durationSeconds : null,
      isWarmup: input.isWarmup ?? false,
    },
  })
  return sessionDetail(userId, sessionId, tz)
}

export async function deleteSet(userId: string, setId: string): Promise<void> {
  const existing = await db.setLog.findFirst({ where: { id: setId, userId } })
  if (!existing) throw new HttpError('Set not found', 404)
  await db.setLog.delete({ where: { id: setId } })
}

/* ======================= nutrition ======================= */

function shapeProfile(p: {
  calorieTarget: number
  proteinTargetG: number
  proteinPerKgMilli: number
  weeklyGainTargetG: number
}) {
  return {
    calorieTarget: p.calorieTarget,
    proteinTargetG: p.proteinTargetG,
    proteinPerKgMilli: p.proteinPerKgMilli,
    weeklyGainTargetG: p.weeklyGainTargetG,
  }
}

export async function getNutrition(userId: string, tz: string, dateParam?: string): Promise<NutritionPayloadDTO> {
  const today = todayISO(tz)
  const mealsDate = dateParam ? checkISO(dateParam) : today
  if (mealsDate > today) throw new HttpError('Cannot load meals for a future day', 422)
  const since = toUTC(shiftISO(today, -34)) // 35-day window for month-ish history
  const [profile, days, latestWeight, mealRows, mealDaySums] = await Promise.all([
    db.nutritionProfile.findUnique({ where: { userId } }),
    db.nutritionDay.findMany({
      where: { userId, date: { gte: since, lte: toUTC(today) } },
      orderBy: { date: 'asc' },
    }),
    db.bodyMetric.findFirst({ where: { userId, kind: 'weight' }, orderBy: [{ date: 'desc' }] }),
    db.mealEntry.findMany({
      where: { userId, date: toUTC(mealsDate) },
      orderBy: { createdAt: 'asc' },
    }),
    // per-day meal sums across the same window, so history and adherence see
    // the meal log too (Decision #70 combine — this used to be quick-adds only)
    db.mealEntry.groupBy({
      by: ['date'],
      where: { userId, date: { gte: since, lte: toUTC(today) } },
      _sum: { proteinG: true, caloriesKcal: true },
    }),
  ])
  const dayDTOs = mergeDailyNutrition(
    days.map((d) => ({
      iso: d.date.toISOString().slice(0, 10),
      caloriesKcal: d.caloriesKcal,
      proteinG: d.proteinG,
    })),
    mealDaySums.map((r) => ({
      iso: r.date.toISOString().slice(0, 10),
      proteinG: r._sum.proteinG ?? 0,
      caloriesKcal: r._sum.caloriesKcal ?? 0,
    })),
  )
  const mealDTOs: MealEntryDTO[] = mealRows.map((e) => ({
    id: e.id,
    date: e.date.toISOString().slice(0, 10),
    mealType: e.mealType,
    name: e.name,
    caloriesKcal: e.caloriesKcal,
    proteinG: e.proteinG,
    carbsG: e.carbsG,
    fatG: e.fatG,
    createdAt: e.createdAt.toISOString(),
  }))
  const latestWeightKg = latestWeight ? latestWeight.valueMilli / 1000 : null
  return {
    profile: profile ? shapeProfile(profile) : null,
    suggestions: latestWeightKg != null ? suggestNutrition(latestWeightKg, (profile?.proteinPerKgMilli ?? 1800) / 1000) : null,
    latestWeightKg,
    days: dayDTOs,
    adherence30: proteinAdherence(dayDTOs, profile?.proteinTargetG ?? 113),
    meals: { date: mealsDate, entries: mealDTOs, totals: sumMealEntries(mealDTOs) },
  }
}

export async function saveNutritionDay(
  userId: string,
  input: { date: string; proteinG?: number | null; caloriesKcal?: number | null },
  tz: string,
): Promise<NutritionPayloadDTO> {
  checkISO(input.date)
  const { proteinG, caloriesKcal } = input
  if (proteinG != null && (!Number.isInteger(proteinG) || proteinG < 0 || proteinG > 500)) {
    throw new HttpError('proteinG must be 0–500', 422)
  }
  if (caloriesKcal != null && (!Number.isInteger(caloriesKcal) || caloriesKcal < 0 || caloriesKcal > 10_000)) {
    throw new HttpError('caloriesKcal must be 0–10000', 422)
  }
  const bothNull = (proteinG == null || proteinG === 0) && (caloriesKcal == null || caloriesKcal === 0)
  if (bothNull) {
    await db.nutritionDay.deleteMany({ where: { userId, date: toUTC(input.date) } })
  } else {
    await db.nutritionDay.upsert({
      where: { userId_date: { userId, date: toUTC(input.date) } },
      create: { userId, date: toUTC(input.date), proteinG: proteinG ?? null, caloriesKcal: caloriesKcal ?? null },
      update: { proteinG: proteinG ?? null, caloriesKcal: caloriesKcal ?? null },
    })
  }
  // the meal panel follows the day that was just edited (today unless the
  // save targeted a past day — future days carry no meal log)
  const today = todayISO(tz)
  return getNutrition(userId, tz, input.date > today ? undefined : input.date)
}

export async function updateNutritionProfile(
  userId: string,
  input: { calorieTarget?: number; proteinTargetG?: number; proteinPerKgMilli?: number; weeklyGainTargetG?: number },
  tz: string,
): Promise<NutritionPayloadDTO> {
  const ranges: Record<string, [number, number]> = {
    calorieTarget: [1200, 6000],
    proteinTargetG: [30, 400],
    proteinPerKgMilli: [800, 3000],
    weeklyGainTargetG: [50, 2000],
  }
  const mutable = input as Record<string, number | undefined>
  for (const [k, [lo, hi]] of Object.entries(ranges)) {
    const v = mutable[k]
    if (v != null && (!Number.isInteger(v) || v < lo || v > hi)) {
      throw new HttpError(`${k} must be ${lo}–${hi}`, 422)
    }
  }
  await db.nutritionProfile.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  })
  return getNutrition(userId, tz)
}

/* ---------- meal entries (Phase 19, Decision #70) ---------- */

export interface MealEntryInput {
  date: string
  mealType?: string
  name: string
  caloriesKcal?: number | null
  proteinG?: number | null
  carbsG?: number | null
  fatG?: number | null
}

function validateMeal(input: MealEntryInput & { name: string }, today: string) {
  if (!input.name.trim()) throw new HttpError('Meal name is required', 422)
  if (input.name.trim().length > 120) throw new HttpError('Meal name must be 120 characters or fewer', 422)
  if (input.mealType != null && !isMealTypeKey(input.mealType)) throw new HttpError('Unknown meal type', 422)
  if (input.date > today) throw new HttpError('Cannot log a meal for a future day', 422)
  for (const [k, hi] of [['caloriesKcal', 5000], ['proteinG', 500], ['carbsG', 1000], ['fatG', 500]] as const) {
    const v = input[k]
    if (v != null && (!Number.isInteger(v) || v < 0 || v > hi)) throw new HttpError(`${k} must be 0–${hi}`, 422)
  }
}

function isMealTypeKey(s: string): boolean {
  return ['breakfast', 'lunch', 'dinner', 'snack'].includes(s)
}

export async function addMealEntry(userId: string, input: MealEntryInput, tz: string): Promise<NutritionPayloadDTO> {
  const today = todayISO(tz)
  checkISO(input.date)
  const name = input.name.trim()
  validateMeal({ ...input, name }, today)
  await db.mealEntry.create({
    data: {
      userId,
      date: toUTC(input.date),
      mealType: input.mealType ?? 'snack',
      name,
      caloriesKcal: input.caloriesKcal ?? null,
      proteinG: input.proteinG ?? null,
      carbsG: input.carbsG ?? null,
      fatG: input.fatG ?? null,
    },
  })
  return getNutrition(userId, tz, input.date)
}

export async function deleteMealEntry(userId: string, entryId: string, tz: string): Promise<NutritionPayloadDTO> {
  const existing = await db.mealEntry.findFirst({ where: { id: entryId, userId } })
  if (!existing) throw new HttpError('Meal entry not found', 404)
  const date = existing.date.toISOString().slice(0, 10)
  await db.mealEntry.delete({ where: { id: entryId } })
  return getNutrition(userId, tz, date)
}

/* ======================= summary (Today card + hub) ======================= */

function fmtSet(weightGrams: number | null, reps: number | null): string {
  const w = weightGrams != null ? `${gramsToKg(weightGrams)}kg` : 'BW'
  return reps != null ? `${w}×${reps}` : w
}

export async function fitnessSummary(userId: string, tz: string): Promise<FitnessSummaryDTO> {
  const today = todayISO(tz)
  const todayDate = toUTC(today)
  const since7 = toUTC(shiftISO(today, -6))

  const [activePlan, recentSessions, openSessions, lastClosed, weekSessions, weightRows, profile, nutritionDays, weekMealSums] =
    await Promise.all([
      db.workoutPlan.findFirst({
        where: { userId, active: true },
        include: { days: { orderBy: { order: 'asc' }, include: { exercises: { orderBy: { order: 'asc' }, include: { exercise: true } } } } },
      }),
      db.workoutSession.findMany({
        where: { userId, date: { gte: toUTC(shiftISO(today, -60)) } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 20,
        include: SESSION_INCLUDE,
      }),
      db.workoutSession.findFirst({
        where: { userId, durationMin: 0, date: { gte: toUTC(shiftISO(today, -1)) } },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { sets: true } } },
      }),
      db.workoutSession.findFirst({
        where: { userId, durationMin: { gt: 0 } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      db.workoutSession.findMany({
        where: { userId, date: { gte: since7, lte: todayDate } },
        include: SESSION_INCLUDE,
      }),
      db.bodyMetric.findMany({
        where: { userId, kind: 'weight', date: { gte: toUTC(shiftISO(today, -120)) } },
        orderBy: { date: 'asc' },
      }),
      db.nutritionProfile.findUnique({ where: { userId } }),
      db.nutritionDay.findMany({
        where: { userId, date: { gte: toUTC(shiftISO(today, -6)), lte: todayDate } },
      }),
      // meal log sums per day — without these the Today card and the hub's
      // Protein tile undercount anyone who logs meals instead of quick-adds
      db.mealEntry.groupBy({
        by: ['date'],
        where: { userId, date: { gte: toUTC(shiftISO(today, -6)), lte: todayDate } },
        _sum: { proteinG: true, caloriesKcal: true },
      }),
    ])

  /* --- next workout: rotation over the active plan's days --- */
  let nextWorkout: FitnessSummaryDTO['nextWorkout'] = null
  if (activePlan && activePlan.days.length > 0) {
    const lastOnPlan = recentSessions.find((s) => s.planId === activePlan.id)
    const next = nextPlanDay(
      activePlan.days.map((d) => ({ id: d.id, order: d.order, label: d.label })),
      lastOnPlan?.planDayId ?? null,
    )
    const day = activePlan.days.find((d) => d.id === next.id)
    if (day) {
      nextWorkout = {
        planId: activePlan.id,
        planName: activePlan.name,
        planEmoji: activePlan.emoji,
        planDayId: day.id,
        label: day.label,
        focus: day.focus,
        rotationHint:
          activePlan.days.length > 1 && lastOnPlan
            ? `Next up after ${lastOnPlan.label} — day ${day.order + 1} of ${activePlan.days.length}`
            : null,
        exercises: day.exercises.map(shapePlanExercise),
      }
    }
  }

  /* --- week stats --- */
  const weekVolumeG = weekSessions.reduce(
    (sum, s) => sum + sessionVolumeGrams(s.sets.map((x) => ({ weightGrams: x.weightGrams, reps: x.reps, isWarmup: x.isWarmup }))),
    0,
  )
  const week = {
    sessions: weekSessions.filter((s) => s.durationMin > 0).length,
    minutes: weekSessions.reduce((sum, s) => sum + s.durationMin, 0),
    volumeKg: gramsToKg(weekVolumeG),
  }

  /* --- weight trend vs bulk target --- */
  const weightPoints = weightRows.map((r) => ({ iso: r.date.toISOString().slice(0, 10), g: r.valueMilli }))
  const pace = bulkPace(weightPoints, profile?.weeklyGainTargetG ?? 250)
  const latestWeight = weightPoints.length > 0 ? weightPoints[weightPoints.length - 1] : null
  const weight = latestWeight
    ? {
        latestKg: gramsToKg(latestWeight.g),
        kgPerWeek: pace.kgPerWeek,
        verdict: pace.verdict,
        spanDays: pace.spanDays,
        weeklyTargetG: profile?.weeklyGainTargetG ?? 250,
      }
    : null

  /* --- nutrition today + week (quick-adds AND meal log, Decision #70) --- */
  const weekNutritionRows = mergeDailyNutrition(
    nutritionDays.map((d) => ({
      iso: d.date.toISOString().slice(0, 10),
      proteinG: d.proteinG,
      caloriesKcal: d.caloriesKcal,
    })),
    weekMealSums.map((r) => ({
      iso: r.date.toISOString().slice(0, 10),
      proteinG: r._sum.proteinG ?? 0,
      caloriesKcal: r._sum.caloriesKcal ?? 0,
    })),
  )
  const todayDay = weekNutritionRows.find((d) => d.iso === today)
  const weekNutrition = proteinAdherence(weekNutritionRows, profile?.proteinTargetG ?? 113)

  /* --- progression highlights: last two appearances per exercise --- */
  const byExercise = new Map<string, { name: string; perDate: Map<string, SetLike[]> }>()
  for (const s of [...recentSessions].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    for (const set of s.sets) {
      if (set.isWarmup) continue
      if (!byExercise.has(set.exerciseId)) byExercise.set(set.exerciseId, { name: set.exercise.name, perDate: new Map() })
      const entry = byExercise.get(set.exerciseId)!
      if (!entry.perDate.has(s.date.toISOString().slice(0, 10))) entry.perDate.set(s.date.toISOString().slice(0, 10), [])
      entry.perDate.get(s.date.toISOString().slice(0, 10))!.push({ weightGrams: set.weightGrams, reps: set.reps })
    }
  }
  const highlights: FitnessHighlightDTO[] = []
  for (const [exerciseId, { name, perDate }] of byExercise) {
    const dates = [...perDate.keys()].sort()
    if (dates.length < 2) continue
    const prevTop = topSet(perDate.get(dates[dates.length - 2])!)
    const curTop = topSet(perDate.get(dates[dates.length - 1])!)
    const prog = progressionDelta(curTop, prevTop)
    if (!prog || !curTop || !prevTop) continue
    highlights.push({
      exerciseId,
      name,
      direction: prog.direction,
      weightDeltaG: prog.weightDeltaG,
      est1RMDeltaG: prog.est1RMDeltaG,
      fromLabel: fmtSet(prevTop.weightGrams, prevTop.reps),
      toLabel: fmtSet(curTop.weightGrams, curTop.reps),
      date: dates[dates.length - 1],
    })
  }
  highlights.sort((a, b) => {
    const rank = { up: 0, flat: 1, down: 2 } as const
    return rank[a.direction] - rank[b.direction] || Math.abs(b.est1RMDeltaG) - Math.abs(a.est1RMDeltaG)
  })

  return {
    today,
    activePlan: activePlan ? { id: activePlan.id, name: activePlan.name, emoji: activePlan.emoji, dayCount: activePlan.days.length } : null,
    nextWorkout,
    openSession: openSessions ? { id: openSessions.id, label: openSessions.label, setCount: openSessions._count.sets } : null,
    lastSession: lastClosed ? { id: lastClosed.id, date: lastClosed.date.toISOString().slice(0, 10), label: lastClosed.label, durationMin: lastClosed.durationMin } : null,
    week,
    weight,
    nutrition: {
      proteinG: todayDay?.proteinG ?? null,
      caloriesKcal: todayDay?.caloriesKcal ?? null,
      proteinTargetG: profile?.proteinTargetG ?? null,
      calorieTarget: profile?.calorieTarget ?? null,
      week: weekNutrition,
    },
    highlights: highlights.slice(0, 3),
  }
}

/* ======================= per-exercise progress (Progress panel) ======================= */

export async function exerciseProgress(userId: string, exerciseId: string, tz: string, sinceDays = 180): Promise<ExerciseProgressDTO> {
  const ex = await db.exercise.findFirst({ where: { id: exerciseId, userId } })
  if (!ex) throw new HttpError('Exercise not found', 404)
  const since = toUTC(shiftISO(todayISO(tz), -sinceDays))
  const sets = await db.setLog.findMany({
    where: { userId, exerciseId, isWarmup: false, session: { durationMin: { gt: 0 }, date: { gte: since } } },
    orderBy: { createdAt: 'asc' },
    include: { session: { select: { date: true } } },
  })
  const perDate = new Map<string, SetLike[]>()
  for (const s of sets) {
    const iso = s.session.date.toISOString().slice(0, 10)
    if (!perDate.has(iso)) perDate.set(iso, [])
    perDate.get(iso)!.push({ weightGrams: s.weightGrams, reps: s.reps })
  }
  const sessions = [...perDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dateSets]) => {
      const top = topSet(dateSets)
      return {
        date,
        topWeightGrams: top?.weightGrams ?? null,
        topReps: top?.reps ?? null,
        est1RMGrams: top ? est1RMGrams(top.weightGrams, top.reps) : 0,
        volumeGrams: sessionVolumeGrams(dateSets),
        setCount: dateSets.length,
      }
    })
  const first = sessions[0]
  const last = sessions[sessions.length - 1]
  const delta = first && last && first !== last ? last.est1RMGrams - first.est1RMGrams : null
  const direction = delta == null ? null : delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const)
  return {
    exerciseId,
    name: ex.name,
    muscleGroup: ex.muscleGroup as MuscleGroup,
    sessions,
    est1RMDeltaG: delta,
    direction,
  }
}

/** Exercises the user has actually trained (for the Progress panel picker). */
export async function trainedExercises(userId: string): Promise<{ exercises: { exerciseId: string; name: string; sessionCount: number; lastDate: string | null }[] }> {
  const rows = await db.setLog.groupBy({
    by: ['exerciseId'],
    where: { userId, isWarmup: false },
    _count: true,
    _max: { createdAt: true },
  })
  const ids = rows.map((r) => r.exerciseId)
  const exs = await db.exercise.findMany({ where: { id: { in: ids } } })
  const nameOf = new Map(exs.map((e) => [e.id, e.name] as const))
  return {
    exercises: rows
      .map((r) => ({
        exerciseId: r.exerciseId,
        name: nameOf.get(r.exerciseId) ?? 'Unknown',
        sessionCount: r._count,
        lastDate: r._max.createdAt ? r._max.createdAt.toISOString().slice(0, 10) : null,
      }))
      .sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? '')),
  }
}

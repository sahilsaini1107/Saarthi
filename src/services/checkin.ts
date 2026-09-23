// Daily coach check-in service (Phase 23). User-scoped throughout; the maths
// lives in lib/checkin.ts.
//
// Decision #79 — the check-in stores ONLY what nothing else stores. Weight is
// a BodyMetric, protein is NutritionDay + MealEntry, training is a
// WorkoutSession or a Workout. This service READS those to work out what is
// already answered and prompts only for the gaps, so no figure is ever kept in
// two places and the check-in can never disagree with the screen it came from.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { shiftISO, todayISO, toUTC } from '@/lib/date'
import {
  checkInAverages,
  checkInPrompts,
  checkInStreak,
  completeness,
  normaliseScale,
  readiness,
  type CheckInRowLike,
} from '@/lib/checkin'
import { mergeDailyNutrition } from '@/lib/meals'
import type { CheckInDayDTO, CheckInPayloadDTO } from '@/lib/types'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const HISTORY_DAYS = 30

export interface CheckInInput {
  date: string
  energy?: number | null
  soreness?: number | null
  stress?: number | null
  sleepQuality?: number | null
  sleepMinutes?: number | null
  steps?: number | null
  waterMl?: number | null
  note?: string | null
}

function validate(input: CheckInInput, today: string): void {
  if (!ISO_RE.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (input.date > today) throw new HttpError('Cannot check in for a future day', 422)
  for (const key of ['energy', 'soreness', 'stress', 'sleepQuality'] as const) {
    const v = input[key]
    if (v != null && normaliseScale(v) == null) throw new HttpError(`${key} must be a whole number 1–5`, 422)
  }
  if (input.sleepMinutes != null && (!Number.isInteger(input.sleepMinutes) || input.sleepMinutes < 0 || input.sleepMinutes > 1440)) {
    throw new HttpError('Sleep must be between 0 and 24 hours', 422)
  }
  if (input.steps != null && (!Number.isInteger(input.steps) || input.steps < 0 || input.steps > 200_000)) {
    throw new HttpError('Steps must be between 0 and 200000', 422)
  }
  if (input.waterMl != null && (!Number.isInteger(input.waterMl) || input.waterMl < 0 || input.waterMl > 20_000)) {
    throw new HttpError('Water must be between 0 and 20000 ml', 422)
  }
  if (input.note != null && input.note.length > 500) throw new HttpError('Note must be 500 characters or fewer', 422)
}

type CheckInRow = {
  date: Date
  energy: number | null
  soreness: number | null
  stress: number | null
  sleepQuality: number | null
  sleepMinutes: number | null
  steps: number | null
  waterMl: number | null
  note: string | null
}

function shapeDay(r: CheckInRow): CheckInDayDTO {
  const iso = r.date.toISOString().slice(0, 10)
  return {
    iso,
    energy: r.energy,
    soreness: r.soreness,
    stress: r.stress,
    sleepQuality: r.sleepQuality,
    sleepMinutes: r.sleepMinutes,
    steps: r.steps,
    waterMl: r.waterMl,
    note: r.note,
    readiness: readiness(r),
  }
}

/**
 * Everything the check-in screen needs for one day: the stored answers, what
 * the rest of Saarthi already knows about that day, the resulting prompt list,
 * the streak and a 30-day trend.
 */
export async function getCheckIn(userId: string, tz: string, dateParam?: string): Promise<CheckInPayloadDTO> {
  const today = todayISO(tz)
  const date = dateParam ?? today
  if (!ISO_RE.test(date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (date > today) throw new HttpError('Cannot check in for a future day', 422)

  const since = shiftISO(today, -(HISTORY_DAYS - 1))
  const dateUTC = toUTC(date)

  const [row, history, weightToday, latestWeight, sessionToday, workoutToday, manualDay, mealSums, nutritionProfile] =
    await Promise.all([
      db.dailyCheckIn.findUnique({ where: { userId_date: { userId, date: dateUTC } } }),
      db.dailyCheckIn.findMany({
        where: { userId, date: { gte: toUTC(since), lte: toUTC(today) } },
        orderBy: { date: 'asc' },
      }),
      db.bodyMetric.findFirst({ where: { userId, kind: 'weight', date: dateUTC } }),
      db.bodyMetric.findFirst({ where: { userId, kind: 'weight' }, orderBy: { date: 'desc' } }),
      db.workoutSession.findFirst({
        where: { userId, date: dateUTC },
        orderBy: { createdAt: 'desc' },
        select: { id: true, label: true, durationMin: true },
      }),
      db.workout.findFirst({ where: { userId, date: dateUTC }, orderBy: { createdAt: 'desc' } }),
      db.nutritionDay.findUnique({ where: { userId_date: { userId, date: dateUTC } } }),
      db.mealEntry.groupBy({
        by: ['date'],
        where: { userId, date: dateUTC },
        _sum: { proteinG: true, caloriesKcal: true },
      }),
      db.nutritionProfile.findUnique({ where: { userId } }),
    ])

  // protein for the day, both sources combined (Decision #71)
  const merged = mergeDailyNutrition(
    manualDay ? [{ iso: date, proteinG: manualDay.proteinG, caloriesKcal: manualDay.caloriesKcal }] : [],
    mealSums.map((m) => ({
      iso: m.date.toISOString().slice(0, 10),
      proteinG: m._sum.proteinG ?? 0,
      caloriesKcal: m._sum.caloriesKcal ?? 0,
    })),
  )
  const dayNutrition = merged.find((d) => d.iso === date) ?? null

  const feelAnswered = (['energy', 'soreness', 'stress', 'sleepQuality'] as const).filter(
    (k) => normaliseScale(row?.[k] ?? null) != null,
  ).length

  const trainingLabel = sessionToday
    ? `${sessionToday.label}${sessionToday.durationMin > 0 ? ` · ${sessionToday.durationMin} min` : ' · in progress'}`
    : workoutToday
      ? `${workoutToday.type} · ${workoutToday.minutes} min`
      : null

  const prompts = checkInPrompts({
    weightLoggedToday: weightToday != null,
    latestWeightKg: weightToday ? weightToday.valueMilli / 1000 : null,
    trainedToday: sessionToday != null || workoutToday != null,
    trainingLabel,
    proteinG: dayNutrition?.proteinG ?? null,
    proteinTargetG: nutritionProfile?.proteinTargetG ?? null,
    sleepMinutes: row?.sleepMinutes ?? null,
    steps: row?.steps ?? null,
    feelAnswered,
  })

  const historyDTOs = history.map((h) => shapeDay(h as CheckInRow))
  const rowsForAverages: CheckInRowLike[] = historyDTOs.map((d) => ({
    iso: d.iso,
    energy: d.energy,
    soreness: d.soreness,
    stress: d.stress,
    sleepQuality: d.sleepQuality,
    sleepMinutes: d.sleepMinutes,
    steps: d.steps,
    waterMl: d.waterMl,
  }))

  return {
    date,
    today,
    day: row ? shapeDay(row as CheckInRow) : null,
    prompts,
    completeness: completeness(prompts),
    streak: checkInStreak(historyDTOs.map((d) => d.iso), today),
    history: historyDTOs,
    averages30: checkInAverages(rowsForAverages),
    openSessionId: sessionToday && sessionToday.durationMin === 0 ? sessionToday.id : null,
    proteinTargetG: nutritionProfile?.proteinTargetG ?? null,
  }
}

/**
 * Upsert one day's check-in. Only the fields PRESENT in the payload are
 * written, so answering one question never blanks the others — and an explicit
 * null clears that one answer.
 */
export async function saveCheckIn(userId: string, input: CheckInInput, tz: string): Promise<CheckInPayloadDTO> {
  const today = todayISO(tz)
  validate(input, today)

  const data: Record<string, number | string | null> = {}
  for (const key of ['energy', 'soreness', 'stress', 'sleepQuality', 'sleepMinutes', 'steps', 'waterMl'] as const) {
    if (input[key] !== undefined) data[key] = input[key] ?? null
  }
  if (input.note !== undefined) data.note = input.note?.trim() || null
  if (Object.keys(data).length === 0) throw new HttpError('Nothing to save', 422)

  await db.dailyCheckIn.upsert({
    where: { userId_date: { userId, date: toUTC(input.date) } },
    create: { userId, date: toUTC(input.date), ...data },
    update: data,
  })
  return getCheckIn(userId, tz, input.date)
}

export async function deleteCheckIn(userId: string, date: string, tz: string): Promise<CheckInPayloadDTO> {
  if (!ISO_RE.test(date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  await db.dailyCheckIn.deleteMany({ where: { userId, date: toUTC(date) } })
  return getCheckIn(userId, tz, date)
}

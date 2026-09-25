// Body service: workout log + body-metric series (weight trend etc).
// Every query is user-scoped. Trend math lives in lib/body.ts.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { shiftISO, todayISO, toUTC, isoDayUTC } from '@/lib/date'
import {
  ageFromBirthYear,
  bmiMilli,
  idealWeightG,
  isSex,
  leanMassG,
  metricBand,
  mifflinStJeorBMR,
  weekWorkoutStats,
  weightTrend,
} from '@/lib/body'
import { bulkPace, sessionVolumeGrams } from '@/lib/fitness'
import { suggestTargets, type BodyGoal } from '@/lib/coach-targets'
import { BODY_METRIC_GROUPS, BODY_METRIC_KINDS, bodyMetricMax, bodyMetricMeta } from '@/lib/constants'
import type {
  BodyCompositionDTO,
  BodyMetricSeries,
  BodyProfileDTO,
  CompositionGroupDTO,
  CompositionMetricDTO,
  WorkoutDTO,
  WorkoutsPayload,
} from '@/lib/types'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const WORKOUT_TYPES = ['strength', 'cardio', 'yoga', 'sports', 'walk', 'hiit', 'other']
const INTENSITIES = ['light', 'moderate', 'hard']

export interface WorkoutInput {
  date: string
  type: string
  minutes: number
  intensity?: string
  note?: string | null
}

function validateWorkout(input: WorkoutInput) {
  if (!ISO_RE.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (!WORKOUT_TYPES.includes(input.type)) throw new HttpError('Unknown workout type', 422)
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440) {
    throw new HttpError('Minutes must be 1–1440', 422)
  }
  if (input.intensity != null && !INTENSITIES.includes(input.intensity)) {
    throw new HttpError('Intensity must be light, moderate or hard', 422)
  }
}

function shapeWorkout(w: {
  id: string
  date: Date
  type: string
  minutes: number
  intensity: string
  note: string | null
  createdAt: Date
}): WorkoutDTO {
  return {
    id: w.id,
    date: w.date.toISOString().slice(0, 10),
    type: w.type,
    minutes: w.minutes,
    intensity: w.intensity,
    note: w.note,
    createdAt: w.createdAt.toISOString(),
    source: 'quick',
  }
}

/**
 * A finished strength session shaped as a workout row. Only closed sessions
 * (durationMin > 0) count — an open one is still in progress and its minutes
 * are not known yet. Intensity is 'moderate' because sessions don't carry an
 * RPE field; the note shows the volume moved instead.
 */
function shapeSessionAsWorkout(s: {
  id: string
  date: Date
  label: string
  durationMin: number
  createdAt: Date
  volumeGrams: number
}): WorkoutDTO {
  return {
    id: s.id,
    date: s.date.toISOString().slice(0, 10),
    type: 'strength',
    minutes: s.durationMin,
    intensity: 'moderate',
    note: s.volumeGrams > 0 ? `${s.label} · ${Math.round(s.volumeGrams / 1000)} kg moved` : s.label,
    createdAt: s.createdAt.toISOString(),
    source: 'session',
  }
}

export async function listWorkouts(userId: string, tz: string): Promise<WorkoutsPayload> {
  const today = todayISO(tz)
  const weekStart = shiftISO(today, -6) // trailing 7 days including today
  const monthStart = `${today.slice(0, 7)}-01`

  // Closed strength sessions count as movement here too — Life Score already
  // adds both (services/lifescore.ts), so Body showing only quick `Workout`
  // rows made the same week look emptier than it was.
  const closedSession = { userId, durationMin: { gt: 0 } } as const
  const sessionSelect = {
    id: true,
    date: true,
    label: true,
    durationMin: true,
    createdAt: true,
    sets: { select: { weightGrams: true, reps: true, isWarmup: true } },
  } as const

  const [recent, recentSessions, monthAgg, monthSessionAgg, totals, totalSessionAgg] = await Promise.all([
    db.workout.findMany({ where: { userId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 60 }),
    db.workoutSession.findMany({
      where: closedSession,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 60,
      select: sessionSelect,
    }),
    db.workout.aggregate({
      where: { userId, date: { gte: toUTC(monthStart), lte: toUTC(today) } },
      _sum: { minutes: true },
    }),
    db.workoutSession.aggregate({
      where: { ...closedSession, date: { gte: toUTC(monthStart), lte: toUTC(today) } },
      _sum: { durationMin: true },
    }),
    db.workout.aggregate({ where: { userId }, _sum: { minutes: true }, _count: true }),
    db.workoutSession.aggregate({ where: closedSession, _sum: { durationMin: true }, _count: true }),
  ])

  const [weekRows, weekSessionRows] = await Promise.all([
    db.workout.findMany({
      where: { userId, date: { gte: toUTC(weekStart), lte: toUTC(today) } },
      select: { date: true, minutes: true, type: true },
    }),
    db.workoutSession.findMany({
      where: { ...closedSession, date: { gte: toUTC(weekStart), lte: toUTC(today) } },
      select: { date: true, durationMin: true },
    }),
  ])

  const sessionRows = recentSessions.map((s) =>
    shapeSessionAsWorkout({ ...s, volumeGrams: sessionVolumeGrams(s.sets) }),
  )
  const workouts = [...recent.map(shapeWorkout), ...sessionRows].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )

  return {
    workouts,
    weekStats: weekWorkoutStats(
      [
        ...weekRows.map((w) => ({ date: isoDayUTC(w.date), minutes: w.minutes, type: w.type })),
        ...weekSessionRows.map((s) => ({ date: isoDayUTC(s.date), minutes: s.durationMin, type: 'strength' })),
      ],
      weekStart,
    ),
    weekStart,
    monthMinutes: (monthAgg._sum.minutes ?? 0) + (monthSessionAgg._sum.durationMin ?? 0),
    totals: {
      count: totals._count + totalSessionAgg._count,
      minutes: (totals._sum.minutes ?? 0) + (totalSessionAgg._sum.durationMin ?? 0),
    },
  }
}

export async function addWorkout(userId: string, input: WorkoutInput, tz: string): Promise<WorkoutDTO> {
  validateWorkout(input)
  const row = await db.workout.create({
    data: {
      userId,
      date: toUTC(input.date),
      type: input.type,
      minutes: input.minutes,
      intensity: input.intensity ?? 'moderate',
      note: input.note?.trim() || null,
    },
  })
  return shapeWorkout(row)
}

export async function deleteWorkout(userId: string, workoutId: string): Promise<void> {
  const existing = await db.workout.findFirst({ where: { id: workoutId, userId } })
  if (!existing) throw new HttpError('Workout not found', 404)
  await db.workout.delete({ where: { id: workoutId } })
}

/* ---------- body metrics ---------- */

export interface MetricInput {
  kind: string
  date: string
  /** value in milli-units (72.5 kg = 72500) */
  valueMilli: number
  note?: string | null
}

function validateMetric(input: MetricInput) {
  if (!(BODY_METRIC_KINDS as readonly string[]).includes(input.kind)) {
    throw new HttpError('Unknown measurement kind', 422)
  }
  if (!ISO_RE.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  const max = bodyMetricMax(input.kind)
  if (!Number.isInteger(input.valueMilli) || input.valueMilli < 1 || input.valueMilli > max) {
    throw new HttpError(
      `${bodyMetricMeta(input.kind).label} must be a positive milli-unit integer up to ${max} (e.g. 72500 = 72.5)`,
      422,
    )
  }
}

/** One measurement per (kind, day) — re-entering upserts. */
export async function saveMetric(userId: string, input: MetricInput, tz: string): Promise<BodyMetricSeries> {
  validateMetric(input)
  await db.bodyMetric.upsert({
    where: { userId_kind_date: { userId, kind: input.kind, date: toUTC(input.date) } },
    create: { userId, kind: input.kind, date: toUTC(input.date), valueMilli: input.valueMilli, note: input.note?.trim() || null },
    update: { valueMilli: input.valueMilli, note: input.note?.trim() || null },
  })
  return metricSeries(userId, input.kind, tz)
}

export async function deleteMetric(userId: string, metricId: string, tz: string): Promise<BodyMetricSeries> {
  const existing = await db.bodyMetric.findFirst({ where: { id: metricId, userId } })
  if (!existing) throw new HttpError('Measurement not found', 404)
  await db.bodyMetric.delete({ where: { id: metricId } })
  return metricSeries(userId, existing.kind, tz)
}

export async function metricSeries(userId: string, kind: string, tz: string, days = 365): Promise<BodyMetricSeries> {
  if (!(BODY_METRIC_KINDS as readonly string[]).includes(kind)) {
    throw new HttpError('Unknown measurement kind', 422)
  }
  const today = todayISO(tz)
  const since = shiftISO(today, -days)
  const rows = await db.bodyMetric.findMany({
    where: { userId, kind, date: { gte: toUTC(since), lte: toUTC(today) } },
    orderBy: { date: 'asc' },
  })
  // `id` rides along so the UI can correct or delete a single reading; the
  // trend maths in lib/body.ts only reads iso/valueMilli and ignores it.
  const points = rows.map((r) => ({ id: r.id, iso: isoDayUTC(r.date), valueMilli: r.valueMilli }))
  const trend = weightTrend(points)
  const unit = kind === 'weight' ? 'kg' : kind === 'body_fat' ? '%' : kind === 'other' ? '' : 'cm'
  return {
    kind,
    unit,
    points,
    latest: trend.latest,
    delta7dMilli: trend.delta7dMilli,
    delta30dMilli: trend.delta30dMilli,
    minMilli: trend.minMilli,
    maxMilli: trend.maxMilli,
    avg7: trend.avg7,
  }
}

/** All kinds that actually have data — for the Body screen list. */
export async function allMetricSeries(userId: string, tz: string): Promise<BodyMetricSeries[]> {
  const kinds = await db.bodyMetric.findMany({
    where: { userId },
    distinct: ['kind'],
    select: { kind: true },
  })
  const out: BodyMetricSeries[] = []
  for (const { kind } of kinds) out.push(await metricSeries(userId, kind, tz))
  return out.sort((a, b) => (a.kind === 'weight' ? -1 : b.kind === 'weight' ? 1 : a.kind.localeCompare(b.kind)))
}

/* ================= Phase 22 — body profile & composition ================= */

export interface BodyProfileInput {
  heightMilliCm?: number | null
  birthYear?: number | null
  sex?: string | null
  goalWeightG?: number | null
}

function shapeProfile(
  row: { heightMilliCm: number | null; birthYear: number | null; sex: string | null; goalWeightG: number | null } | null,
  today: string,
): BodyProfileDTO {
  return {
    heightMilliCm: row?.heightMilliCm ?? null,
    birthYear: row?.birthYear ?? null,
    sex: row?.sex ?? null,
    goalWeightG: row?.goalWeightG ?? null,
    age: ageFromBirthYear(row?.birthYear ?? null, today),
  }
}

export async function getBodyProfile(userId: string, tz: string): Promise<BodyProfileDTO> {
  const row = await db.bodyProfile.findUnique({ where: { userId } })
  return shapeProfile(row, todayISO(tz))
}

export async function saveBodyProfile(userId: string, input: BodyProfileInput, tz: string): Promise<BodyProfileDTO> {
  const currentYear = Number(todayISO(tz).slice(0, 4))
  if (
    input.heightMilliCm != null &&
    (!Number.isInteger(input.heightMilliCm) || input.heightMilliCm < 50_000 || input.heightMilliCm > 260_000)
  ) {
    throw new HttpError('Height must be between 50 and 260 cm', 422)
  }
  if (
    input.birthYear != null &&
    (!Number.isInteger(input.birthYear) || input.birthYear < currentYear - 120 || input.birthYear > currentYear)
  ) {
    throw new HttpError('Birth year looks wrong', 422)
  }
  if (input.sex != null && !isSex(input.sex)) throw new HttpError('Sex must be male, female or other', 422)
  if (
    input.goalWeightG != null &&
    (!Number.isInteger(input.goalWeightG) || input.goalWeightG < 20_000 || input.goalWeightG > 400_000)
  ) {
    throw new HttpError('Goal weight must be between 20 and 400 kg', 422)
  }
  await db.bodyProfile.upsert({ where: { userId }, create: { userId, ...input }, update: input })
  return getBodyProfile(userId, tz)
}

/**
 * Save several readings for one day in a single call — the whole smart-scale
 * panel in one go. Each kind upserts on (user, kind, date) exactly like the
 * single-metric path, so re-weighing on the same day replaces rather than
 * duplicates. A null value DELETES that kind's reading for the day, which is
 * how a mistyped figure gets removed without a separate call.
 */
export async function saveMetricsBulk(
  userId: string,
  input: { date: string; values: Record<string, number | null> },
  tz: string,
): Promise<BodyCompositionDTO> {
  if (!ISO_RE.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (input.date > todayISO(tz)) throw new HttpError('Cannot log a measurement for a future day', 422)

  const entries = Object.entries(input.values)
  if (entries.length === 0) throw new HttpError('Nothing to save', 422)
  for (const [kind, value] of entries) {
    if (!(BODY_METRIC_KINDS as readonly string[]).includes(kind)) {
      throw new HttpError(`Unknown measurement kind: ${kind}`, 422)
    }
    const max = bodyMetricMax(kind)
    if (value != null && (!Number.isInteger(value) || value < 1 || value > max)) {
      throw new HttpError(`${bodyMetricMeta(kind).label} must be between 0 and ${max / 1000}`, 422)
    }
  }

  const date = toUTC(input.date)
  await db.$transaction(
    entries.map(([kind, value]) =>
      value == null
        ? db.bodyMetric.deleteMany({ where: { userId, kind, date } })
        : db.bodyMetric.upsert({
            where: { userId_kind_date: { userId, kind, date } },
            create: { userId, kind, date, valueMilli: value },
            update: { valueMilli: value },
          }),
    ),
  )
  return bodyComposition(userId, tz)
}

/**
 * The composition panel. Logged readings always win; anything the user has not
 * logged but Saarthi can compute honestly (BMI, lean mass, BMR, ideal weight)
 * is filled in and flagged `derived`, so a scale that reports a figure and
 * Saarthi's own arithmetic never fight over the same cell.
 */
export async function bodyComposition(
  userId: string,
  tz: string,
  goal: BodyGoal = 'lean_bulk',
): Promise<BodyCompositionDTO> {
  const today = todayISO(tz)
  const [profileRow, allSeries, nutritionProfile] = await Promise.all([
    db.bodyProfile.findUnique({ where: { userId } }),
    allMetricSeries(userId, tz),
    db.nutritionProfile.findUnique({ where: { userId } }),
  ])
  const profile = shapeProfile(profileRow, today)
  const sex = profile.sex && isSex(profile.sex) ? profile.sex : null

  const byKind = new Map(allSeries.map((s) => [s.kind, s]))
  const latestOf = (kind: string) => byKind.get(kind)?.latest ?? null
  const weightG = latestOf('weight')?.valueMilli ?? null

  // figures Saarthi can compute from what is already logged
  const derived: Record<string, number | null> = {
    bmi: bmiMilli(weightG, profile.heightMilliCm),
    fat_free_weight: leanMassG(weightG, latestOf('body_fat')?.valueMilli ?? null),
    bmr: mifflinStJeorBMR(weightG, profile.heightMilliCm, profile.age, sex),
    ideal_weight: idealWeightG(profile.heightMilliCm),
  }

  const groups: CompositionGroupDTO[] = BODY_METRIC_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    metrics: g.kinds.flatMap((kind): CompositionMetricDTO[] => {
      const series = byKind.get(kind)
      const logged = series?.latest ?? null
      const derivedValue = derived[kind] ?? null
      const valueMilli = logged?.valueMilli ?? derivedValue
      if (valueMilli == null) return []
      const meta = bodyMetricMeta(kind)
      return [
        {
          kind,
          label: meta.label,
          unit: meta.unit,
          emoji: meta.emoji,
          valueMilli,
          iso: logged?.iso ?? null,
          delta30dMilli: series?.delta30dMilli ?? null,
          band: metricBand(kind, valueMilli, sex),
          derived: logged == null,
        },
      ]
    }),
  })).filter((g) => g.metrics.length > 0)

  const suggestionRaw = weightG != null ? suggestTargets(weightG / 1000, goal) : null
  const weightSeries = byKind.get('weight')
  const weeklyTargetG = nutritionProfile?.weeklyGainTargetG ?? suggestionRaw?.weeklyChangeG ?? 250
  const paceRaw = weightSeries
    ? bulkPace(
        weightSeries.points.map((p) => ({ iso: p.iso, g: p.valueMilli })),
        weeklyTargetG,
      )
    : null

  let goalProgress: BodyCompositionDTO['goalProgress'] = null
  if (profile.goalWeightG != null && weightG != null) {
    const deltaG = profile.goalWeightG - weightG
    // an ETA only means something when the trend actually points at the goal
    const perWeekG = paceRaw?.kgPerWeek != null ? paceRaw.kgPerWeek * 1000 : null
    const weeksToGoal =
      perWeekG != null && perWeekG !== 0 && Math.sign(perWeekG) === Math.sign(deltaG)
        ? Math.round(Math.abs(deltaG / perWeekG) * 10) / 10
        : null
    goalProgress = { goalWeightG: profile.goalWeightG, deltaG, weeksToGoal }
  }

  return {
    profile,
    groups,
    series: allSeries,
    latestWeightG: weightG,
    suggestion: suggestionRaw ? { goal, ...suggestionRaw } : null,
    pace: paceRaw ? { ...paceRaw, weeklyTargetG } : null,
    goalProgress,
  }
}

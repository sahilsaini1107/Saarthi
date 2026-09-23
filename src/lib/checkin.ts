// Daily coach check-in (Phase 23). Pure — no clock, no DB, injectable "today",
// same contract as lib/habits.ts and lib/body.ts.
//
// What a coach actually asks a client each day: did you weigh in, did you
// train, did you hit protein, how did you sleep, how do you feel. Most of
// those answers already live elsewhere in Saarthi, so this module is mostly
// about deciding WHAT IS STILL MISSING and what the answers add up to.

import { shiftISO } from './date'

/* ---------------- subjective scales ---------------- */

export const SCALE_MIN = 1
export const SCALE_MAX = 5

/** 1–5 pickers, worded so the low end always means "bad day". */
export const CHECKIN_SCALES = [
  {
    key: 'energy',
    label: 'Energy',
    emoji: '⚡',
    /** true when 5 is good (energy, sleep quality); false when 5 is bad (soreness, stress) */
    higherIsBetter: true,
    labels: ['Drained', 'Low', 'Okay', 'Good', 'Great'],
  },
  {
    key: 'sleepQuality',
    label: 'Sleep quality',
    emoji: '😴',
    higherIsBetter: true,
    labels: ['Awful', 'Poor', 'Okay', 'Good', 'Deep'],
  },
  {
    key: 'soreness',
    label: 'Soreness',
    emoji: '🪫',
    higherIsBetter: false,
    labels: ['None', 'Mild', 'Noticeable', 'Sore', 'Wrecked'],
  },
  {
    key: 'stress',
    label: 'Stress',
    emoji: '🌪️',
    higherIsBetter: false,
    labels: ['Calm', 'Light', 'Moderate', 'High', 'Maxed'],
  },
] as const

export type ScaleKey = (typeof CHECKIN_SCALES)[number]['key']

export function isScaleKey(s: string): s is ScaleKey {
  return CHECKIN_SCALES.some((x) => x.key === s)
}

export function scaleMeta(key: string) {
  return CHECKIN_SCALES.find((x) => x.key === key) ?? CHECKIN_SCALES[0]
}

/** Valid 1–5 integer, or null. Anything else is treated as not answered. */
export function normaliseScale(v: number | null | undefined): number | null {
  if (v == null || !Number.isInteger(v) || v < SCALE_MIN || v > SCALE_MAX) return null
  return v
}

/* ---------------- training readiness ---------------- */

export type ReadinessVerdict = 'push' | 'train' | 'easy' | 'rest'

export interface Readiness {
  /** 1.00–5.00, two decimals */
  score: number
  verdict: ReadinessVerdict
  label: string
  /** which inputs actually contributed — the score is honest about its basis */
  basis: ScaleKey[]
  /** plain-English reason, naming the weakest input */
  reason: string
}

const VERDICT_LABEL: Record<ReadinessVerdict, string> = {
  push: 'Good day to push',
  train: 'Train as planned',
  easy: 'Keep it easy',
  rest: 'Rest or deload',
}

export interface ReadinessInput {
  energy?: number | null
  sleepQuality?: number | null
  soreness?: number | null
  stress?: number | null
}

/**
 * Training readiness from the four subjective scales, 1–5.
 *
 * Soreness and stress are INVERTED (6 − v) so every input points the same way:
 * higher is always better. The score is the mean of whichever inputs were
 * actually answered — an unanswered scale is skipped, never treated as a
 * neutral 3, because a missing answer is not the same as an average day.
 *
 * Returns null below two answered inputs: one number is a mood, not a signal.
 */
export function readiness(input: ReadinessInput): Readiness | null {
  const parts: { key: ScaleKey; value: number }[] = []
  for (const scale of CHECKIN_SCALES) {
    const raw = normaliseScale(input[scale.key])
    if (raw == null) continue
    parts.push({ key: scale.key, value: scale.higherIsBetter ? raw : SCALE_MAX + 1 - raw })
  }
  if (parts.length < 2) return null

  const mean = parts.reduce((s, p) => s + p.value, 0) / parts.length
  const score = Math.round(mean * 100) / 100
  const verdict: ReadinessVerdict = score >= 4.25 ? 'push' : score >= 3.25 ? 'train' : score >= 2.25 ? 'easy' : 'rest'

  // name the weakest contributor — that is the thing worth acting on
  const weakest = parts.reduce((w, p) => (p.value < w.value ? p : w))
  const meta = scaleMeta(weakest.key)
  const reason =
    weakest.value >= 4
      ? 'Everything is reading well today.'
      : `${meta.label} is the limiter today${meta.higherIsBetter ? '' : ' (higher = worse)'}.`

  return { score, verdict, label: VERDICT_LABEL[verdict], basis: parts.map((p) => p.key), reason }
}

/* ---------------- streak ---------------- */

/**
 * Consecutive days checked in, ending today.
 *
 * Grace rule (same as habits, Decision #13): a check-in missing for TODAY does
 * not break the streak — the day is not over. The run is then counted back
 * from yesterday.
 */
export function checkInStreak(dates: readonly string[], today: string): number {
  const done = new Set(dates)
  let cursor = done.has(today) ? today : shiftISO(today, -1)
  let streak = 0
  while (done.has(cursor)) {
    streak += 1
    cursor = shiftISO(cursor, -1)
  }
  return streak
}

/* ---------------- what is still missing ---------------- */

export type PromptKey = 'weight' | 'training' | 'protein' | 'sleep' | 'feel' | 'steps'

export interface PromptState {
  key: PromptKey
  label: string
  emoji: string
  answered: boolean
  /** what the user already answered, for the summary line */
  detail: string | null
}

export interface CheckInContext {
  weightLoggedToday: boolean
  latestWeightKg: number | null
  trainedToday: boolean
  trainingLabel: string | null
  proteinG: number | null
  proteinTargetG: number | null
  sleepMinutes: number | null
  steps: number | null
  /** number of 1–5 scales answered */
  feelAnswered: number
}

/**
 * The daily prompt list, in the order a coach would run through it. Each entry
 * says whether it is answered and what the answer was — the UI shows the gaps
 * rather than asking for things already recorded elsewhere.
 */
export function checkInPrompts(ctx: CheckInContext): PromptState[] {
  const proteinDone = ctx.proteinG != null && ctx.proteinG > 0
  return [
    {
      key: 'weight',
      label: 'Weigh-in',
      emoji: '⚖️',
      answered: ctx.weightLoggedToday,
      detail: ctx.weightLoggedToday && ctx.latestWeightKg != null ? `${ctx.latestWeightKg} kg` : null,
    },
    {
      key: 'training',
      label: 'Training',
      emoji: '🏋️',
      answered: ctx.trainedToday,
      detail: ctx.trainingLabel,
    },
    {
      key: 'protein',
      label: 'Protein',
      emoji: '🥛',
      answered: proteinDone,
      detail: proteinDone ? `${ctx.proteinG}${ctx.proteinTargetG ? ` / ${ctx.proteinTargetG}` : ''} g` : null,
    },
    {
      key: 'sleep',
      label: 'Sleep',
      emoji: '😴',
      answered: ctx.sleepMinutes != null && ctx.sleepMinutes > 0,
      detail: ctx.sleepMinutes ? formatSleep(ctx.sleepMinutes) : null,
    },
    {
      key: 'feel',
      label: 'How you feel',
      emoji: '⚡',
      answered: ctx.feelAnswered >= 2,
      detail: ctx.feelAnswered > 0 ? `${ctx.feelAnswered}/4 answered` : null,
    },
    {
      key: 'steps',
      label: 'Steps',
      emoji: '👟',
      answered: ctx.steps != null && ctx.steps > 0,
      detail: ctx.steps ? ctx.steps.toLocaleString('en-IN') : null,
    },
  ]
}

/** 0–100, how much of today's check-in is done. */
export function completeness(prompts: readonly PromptState[]): number {
  if (prompts.length === 0) return 0
  return Math.round((prompts.filter((p) => p.answered).length / prompts.length) * 100)
}

/** "7h 30m" from minutes. */
export function formatSleep(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`
}

/** "7:30" or "7.5" typed by a user → minutes. Null when unparsable. */
export function parseSleepInput(input: string): number | null {
  const t = input.trim()
  if (t === '') return null
  if (t.includes(':')) {
    const [h, m] = t.split(':')
    const hh = Number(h)
    const mm = Number(m)
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || mm < 0 || mm >= 60) return null
    return Math.round(hh * 60 + mm)
  }
  const hours = Number(t)
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null
  return Math.round(hours * 60)
}

/* ---------------- trends ---------------- */

export interface CheckInRowLike {
  iso: string
  energy: number | null
  soreness: number | null
  stress: number | null
  sleepQuality: number | null
  sleepMinutes: number | null
  steps: number | null
  waterMl: number | null
}

export interface CheckInAverages {
  /** mean over the days that ANSWERED each field — nulls are skipped, not zeroed */
  energy: number | null
  soreness: number | null
  stress: number | null
  sleepQuality: number | null
  sleepMinutes: number | null
  steps: number | null
  waterMl: number | null
  loggedDays: number
}

function meanOf(rows: readonly CheckInRowLike[], pick: (r: CheckInRowLike) => number | null): number | null {
  const vals = rows.map(pick).filter((v): v is number => v != null && Number.isFinite(v))
  if (vals.length === 0) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
}

/** Averages across a window. Each field averages only the days that answered it. */
export function checkInAverages(rows: readonly CheckInRowLike[]): CheckInAverages {
  return {
    energy: meanOf(rows, (r) => r.energy),
    soreness: meanOf(rows, (r) => r.soreness),
    stress: meanOf(rows, (r) => r.stress),
    sleepQuality: meanOf(rows, (r) => r.sleepQuality),
    sleepMinutes: meanOf(rows, (r) => r.sleepMinutes),
    steps: meanOf(rows, (r) => r.steps),
    waterMl: meanOf(rows, (r) => r.waterMl),
    loggedDays: rows.length,
  }
}

import { describe, expect, it } from 'vitest'
import {
  checkInAverages,
  checkInPrompts,
  checkInStreak,
  completeness,
  formatSleep,
  isScaleKey,
  normaliseScale,
  parseSleepInput,
  readiness,
  type CheckInContext,
  type CheckInRowLike,
} from '@/lib/checkin'

const ctx = (over: Partial<CheckInContext> = {}): CheckInContext => ({
  weightLoggedToday: false,
  latestWeightKg: null,
  trainedToday: false,
  trainingLabel: null,
  proteinG: null,
  proteinTargetG: null,
  sleepMinutes: null,
  steps: null,
  feelAnswered: 0,
  ...over,
})

const row = (over: Partial<CheckInRowLike> = {}): CheckInRowLike => ({
  iso: '2026-09-23',
  energy: null,
  soreness: null,
  stress: null,
  sleepQuality: null,
  sleepMinutes: null,
  steps: null,
  waterMl: null,
  ...over,
})

describe('normaliseScale', () => {
  it('accepts 1–5 integers only', () => {
    expect(normaliseScale(1)).toBe(1)
    expect(normaliseScale(5)).toBe(5)
    expect(normaliseScale(0)).toBeNull()
    expect(normaliseScale(6)).toBeNull()
    expect(normaliseScale(3.5)).toBeNull()
    expect(normaliseScale(null)).toBeNull()
    expect(normaliseScale(undefined)).toBeNull()
  })

  it('guards the scale keys', () => {
    expect(isScaleKey('energy')).toBe(true)
    expect(isScaleKey('vibes')).toBe(false)
  })
})

describe('readiness', () => {
  it('inverts soreness and stress so higher always means better', () => {
    // energy 5, sleep 5, soreness 1 (=5), stress 1 (=5) → all fives
    const r = readiness({ energy: 5, sleepQuality: 5, soreness: 1, stress: 1 })!
    expect(r.score).toBe(5)
    expect(r.verdict).toBe('push')
  })

  it('reads a wrecked day as rest', () => {
    const r = readiness({ energy: 1, sleepQuality: 1, soreness: 5, stress: 5 })!
    expect(r.score).toBe(1)
    expect(r.verdict).toBe('rest')
    expect(r.label).toBe('Rest or deload')
  })

  it('averages only the answered inputs, never treating a blank as a neutral 3', () => {
    const answered = readiness({ energy: 5, sleepQuality: 5 })!
    expect(answered.score).toBe(5)
    expect(answered.basis).toEqual(['energy', 'sleepQuality'])
    // if blanks counted as 3 this would be 4, not 5
  })

  it('needs at least two answers — one number is a mood, not a signal', () => {
    expect(readiness({ energy: 5 })).toBeNull()
    expect(readiness({})).toBeNull()
    expect(readiness({ energy: 4, stress: 2 })).not.toBeNull()
  })

  it('names the weakest input as the limiter', () => {
    const r = readiness({ energy: 5, sleepQuality: 5, soreness: 5 })!
    expect(r.reason).toContain('Soreness')
  })

  it('says so when nothing is holding you back', () => {
    expect(readiness({ energy: 5, sleepQuality: 4 })!.reason).toContain('reading well')
  })

  it('sits on the documented verdict boundaries', () => {
    // 4 and 5 → mean 4.5 → push; 3 and 4 → 3.5 → train
    expect(readiness({ energy: 4, sleepQuality: 5 })!.verdict).toBe('push')
    expect(readiness({ energy: 3, sleepQuality: 4 })!.verdict).toBe('train')
    expect(readiness({ energy: 2, sleepQuality: 3 })!.verdict).toBe('easy')
    expect(readiness({ energy: 1, sleepQuality: 2 })!.verdict).toBe('rest')
  })

  it('ignores an out-of-range value rather than clamping it', () => {
    // 9 is not a valid answer, so only sleepQuality counts → under two inputs
    expect(readiness({ energy: 9, sleepQuality: 4 })).toBeNull()
  })
})

describe('checkInStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(checkInStreak(['2026-09-21', '2026-09-22', '2026-09-23'], '2026-09-23')).toBe(3)
  })

  it('does not break when today is not yet done (grace rule)', () => {
    expect(checkInStreak(['2026-09-21', '2026-09-22'], '2026-09-23')).toBe(2)
  })

  it('breaks on a genuinely missed day', () => {
    expect(checkInStreak(['2026-09-20', '2026-09-22', '2026-09-23'], '2026-09-23')).toBe(2)
  })

  it('is zero with no history at all', () => {
    expect(checkInStreak([], '2026-09-23')).toBe(0)
  })

  it('is zero once two days have been missed', () => {
    expect(checkInStreak(['2026-09-20'], '2026-09-23')).toBe(0)
  })
})

describe('checkInPrompts + completeness', () => {
  it('starts with everything unanswered', () => {
    const prompts = checkInPrompts(ctx())
    expect(prompts.every((p) => !p.answered)).toBe(true)
    expect(completeness(prompts)).toBe(0)
  })

  it('marks what other parts of the app already recorded', () => {
    const prompts = checkInPrompts(
      ctx({
        weightLoggedToday: true,
        latestWeightKg: 62.8,
        trainedToday: true,
        trainingLabel: 'Workout A',
        proteinG: 120,
        proteinTargetG: 130,
      }),
    )
    const by = Object.fromEntries(prompts.map((p) => [p.key, p]))
    expect(by.weight.detail).toBe('62.8 kg')
    expect(by.training.detail).toBe('Workout A')
    expect(by.protein.detail).toBe('120 / 130 g')
    expect(completeness(prompts)).toBe(50) // 3 of 6
  })

  it('needs two feel answers before "how you feel" counts as done', () => {
    const one = checkInPrompts(ctx({ feelAnswered: 1 })).find((p) => p.key === 'feel')!
    const two = checkInPrompts(ctx({ feelAnswered: 2 })).find((p) => p.key === 'feel')!
    expect(one.answered).toBe(false)
    expect(one.detail).toBe('1/4 answered')
    expect(two.answered).toBe(true)
  })

  it('does not count a zero-protein day as answered', () => {
    const p = checkInPrompts(ctx({ proteinG: 0 })).find((x) => x.key === 'protein')!
    expect(p.answered).toBe(false)
  })

  it('reaches 100 when everything is in', () => {
    const prompts = checkInPrompts(
      ctx({
        weightLoggedToday: true,
        latestWeightKg: 62.8,
        trainedToday: true,
        trainingLabel: 'Rest day',
        proteinG: 130,
        sleepMinutes: 450,
        feelAnswered: 4,
        steps: 8200,
      }),
    )
    expect(completeness(prompts)).toBe(100)
  })
})

describe('sleep formatting and parsing', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatSleep(450)).toBe('7h 30m')
    expect(formatSleep(480)).toBe('8h')
    expect(formatSleep(0)).toBe('0h')
  })

  it('parses both "7:30" and "7.5"', () => {
    expect(parseSleepInput('7:30')).toBe(450)
    expect(parseSleepInput('7.5')).toBe(450)
    expect(parseSleepInput(' 8 ')).toBe(480)
  })

  it('refuses nonsense', () => {
    expect(parseSleepInput('')).toBeNull()
    expect(parseSleepInput('abc')).toBeNull()
    expect(parseSleepInput('0')).toBeNull()
    expect(parseSleepInput('25')).toBeNull()
    expect(parseSleepInput('7:75')).toBeNull()
  })
})

describe('checkInAverages', () => {
  it('averages each field over the days that answered it', () => {
    const avg = checkInAverages([
      row({ energy: 4, steps: 8000 }),
      row({ iso: '2026-09-22', energy: 2 }),
      row({ iso: '2026-09-21', steps: 10_000 }),
    ])
    expect(avg.energy).toBe(3) // only the two days that answered
    expect(avg.steps).toBe(9000)
    expect(avg.loggedDays).toBe(3)
  })

  it('returns null for a field nobody answered, never 0', () => {
    expect(checkInAverages([row(), row()]).energy).toBeNull()
  })

  it('handles an empty window', () => {
    const avg = checkInAverages([])
    expect(avg.loggedDays).toBe(0)
    expect(avg.sleepMinutes).toBeNull()
  })
})

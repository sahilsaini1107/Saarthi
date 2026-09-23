import { describe, expect, it } from 'vitest'
import {
  EPLEY_MAX_REPS,
  bulkPace,
  est1RMGrams,
  gramsToKg,
  nextPlanDay,
  progressionDelta,
  proteinAdherence,
  round2,
  sessionVolumeGrams,
  setSeconds,
  setVolumeGrams,
  suggestNutrition,
  sessionsInWindow,
  topSet,
} from '@/lib/fitness'
import { FOUNDATION_AB, PROTEIN_CHIPS } from '@/lib/fitness-presets'

/* ---------- rounding & conversions ---------- */

describe('round2 / gramsToKg', () => {
  it('rounds half-up at 2 decimals', () => {
    expect(round2(2.675)).toBe(2.68)
    expect(round2(1.004)).toBe(1)
    expect(round2(0.005)).toBe(0.01)
  })
  it('grams → kg at 2 decimals', () => {
    expect(gramsToKg(10000)).toBe(10)
    expect(gramsToKg(12345)).toBe(12.35)
    expect(gramsToKg(500)).toBe(0.5)
  })
})

/* ---------- est 1RM (Epley) ---------- */

describe('est1RMGrams', () => {
  it('Epley formula: 100 kg × 10 reps → 133.33 kg', () => {
    expect(est1RMGrams(100_000, 10)).toBe(133_333)
  })
  it('single rep → the weight itself', () => {
    expect(est1RMGrams(80_000, 1)).toBe(80_000)
    expect(est1RMGrams(80_000, 0)).toBe(80_000)
  })
  it('null reps treated as 1RM', () => {
    expect(est1RMGrams(60_000, null)).toBe(60_000)
  })
  it('reps above the cap are clamped', () => {
    expect(est1RMGrams(40_000, 50)).toBe(est1RMGrams(40_000, EPLEY_MAX_REPS))
    expect(est1RMGrams(40_000, 20)).toBe(Math.round(40_000 * (1 + 20 / 30)))
  })
  it('bodyweight (null weight) → 0 signal', () => {
    expect(est1RMGrams(null, 12)).toBe(0)
  })
})

/* ---------- volume ---------- */

describe('setVolumeGrams / sessionVolumeGrams', () => {
  it('weight × reps; bodyweight and timed sets contribute 0', () => {
    expect(setVolumeGrams(50_000, 8)).toBe(400_000)
    expect(setVolumeGrams(null, 15)).toBe(0)
    expect(setVolumeGrams(20_000, null)).toBe(0)
  })
  it('session volume excludes warm-ups', () => {
    expect(
      sessionVolumeGrams([
        { weightGrams: 20_000, reps: 10, isWarmup: true },
        { weightGrams: 50_000, reps: 8 },
        { weightGrams: 52_500, reps: 6 },
      ]),
    ).toBe(400_000 + 315_000)
  })
})

/* ---------- top set ---------- */

describe('topSet', () => {
  it('picks the highest est-1RM working set', () => {
    const best = topSet([
      { weightGrams: 70_000, reps: 10 },
      { weightGrams: 90_000, reps: 1 },
      { weightGrams: 60_000, reps: 12 },
    ])
    // 70×(1+10/30)=93.33 vs 90 vs 60×(1+12/30)=84 — 70 kg × 10 wins
    expect(best?.weightGrams).toBe(70_000)
  })
  it('ties break on heavier absolute weight', () => {
    // 60 kg × 10 = 80 RM; 80 kg × ? — craft a tie: 60×(1+10/30)=80 vs 80×1
    const best = topSet([
      { weightGrams: 60_000, reps: 10 },
      { weightGrams: 80_000, reps: 1 },
    ])
    expect(best?.weightGrams).toBe(80_000)
  })
  it('ignores warm-ups entirely', () => {
    const best = topSet([
      { weightGrams: 200_000, reps: 1, isWarmup: true },
      { weightGrams: 40_000, reps: 8 },
    ])
    expect(best?.weightGrams).toBe(40_000)
  })
  it('empty / all-warm-up → null', () => {
    expect(topSet([])).toBeNull()
    expect(topSet([{ weightGrams: 10_000, reps: 5, isWarmup: true }])).toBeNull()
  })
})

/* ---------- progression ---------- */

describe('progressionDelta', () => {
  it('weight up at same reps → up', () => {
    expect(progressionDelta({ weightGrams: 52_500, reps: 8 }, { weightGrams: 50_000, reps: 8 })?.direction).toBe('up')
  })
  it('same weight, more reps → up', () => {
    expect(progressionDelta({ weightGrams: 50_000, reps: 10 }, { weightGrams: 50_000, reps: 8 })?.direction).toBe('up')
  })
  it('inside the 0.5% noise band → flat (maintaining)', () => {
    // 50→50.2 kg at same reps is +0.4% → flat
    expect(progressionDelta({ weightGrams: 50_200, reps: 8 }, { weightGrams: 50_000, reps: 8 })?.direction).toBe('flat')
  })
  it('drop beyond band → down', () => {
    expect(progressionDelta({ weightGrams: 45_000, reps: 8 }, { weightGrams: 50_000, reps: 8 })?.direction).toBe('down')
  })
  it('reports deltas including repsDelta (null for timed sets)', () => {
    const p = progressionDelta({ weightGrams: 52_500, reps: 9 }, { weightGrams: 50_000, reps: 8 })
    expect(p?.weightDeltaG).toBe(2_500)
    expect(p?.repsDelta).toBe(1)
    const timed = progressionDelta({ weightGrams: null, reps: null, durationSeconds: 45 }, { weightGrams: null, reps: null, durationSeconds: 30 })
    expect(timed).toBeNull() // no load signal at all
  })
  it('missing side → null', () => {
    expect(progressionDelta(null, { weightGrams: 50_000, reps: 8 })).toBeNull()
  })
})

/* ---------- plan rotation ---------- */

describe('nextPlanDay', () => {
  const days = [
    { id: 'a', order: 0, label: 'Workout A' },
    { id: 'b', order: 1, label: 'Workout B' },
  ]
  it('no history → first day', () => {
    expect(nextPlanDay(days, null).id).toBe('a')
  })
  it('after A → B (alternation emerges naturally)', () => {
    expect(nextPlanDay(days, 'a').id).toBe('b')
  })
  it('after B wraps to A', () => {
    expect(nextPlanDay(days, 'b').id).toBe('a')
  })
  it('three-day rotation wraps too', () => {
    const three = [...days, { id: 'c', order: 2, label: 'Workout C' }]
    expect(nextPlanDay(three, 'c').id).toBe('a')
    expect(nextPlanDay(three, 'a').id).toBe('b')
  })
  it('single-day plan always returns that day', () => {
    expect(nextPlanDay([days[0]], days[0].id).id).toBe('a')
  })
  it('unknown last day id → first day', () => {
    expect(nextPlanDay(days, 'nope').id).toBe('a')
  })
  it('order takes precedence over insertion order', () => {
    const shuffled = [
      { id: 'b', order: 1, label: 'B' },
      { id: 'a', order: 0, label: 'A' },
    ]
    expect(nextPlanDay(shuffled, null).id).toBe('a')
  })
})

/* ---------- bulk pace ---------- */

describe('bulkPace', () => {
  it('needs 2 points', () => {
    expect(bulkPace([{ iso: '2026-09-01', g: 62_800 }], 250).verdict).toBe('insufficient')
  })
  it('needs ≥7 days span', () => {
    expect(bulkPace([{ iso: '2026-09-01', g: 62_800 }, { iso: '2026-09-05', g: 63_000 }], 250).verdict).toBe('insufficient')
  })
  it('28 days +1.0 kg → 0.25 kg/week, on track for 250 g target', () => {
    const pace = bulkPace([{ iso: '2026-08-01', g: 62_800 }, { iso: '2026-08-29', g: 63_800 }], 250)
    expect(pace.kgPerWeek).toBe(0.25)
    expect(pace.verdict).toBe('on_track')
  })
  it('losing weight → slow', () => {
    const pace = bulkPace([{ iso: '2026-08-01', g: 63_800 }, { iso: '2026-08-29', g: 62_800 }], 250)
    expect(pace.verdict).toBe('slow')
    expect(pace.kgPerWeek).toBe(-0.25)
  })
  it('above 1.5× target → fast', () => {
    const pace = bulkPace([{ iso: '2026-08-01', g: 62_800 }, { iso: '2026-08-29', g: 64_600 }], 250)
    expect(pace.kgPerWeek).toBe(0.45)
    expect(pace.verdict).toBe('fast')
  })
  it('partial windows are honest: 9 days +0.3 kg → ~0.23 kg/wk', () => {
    const pace = bulkPace([{ iso: '2026-08-01', g: 62_800 }, { iso: '2026-08-10', g: 63_100 }], 250)
    expect(pace.kgPerWeek).toBeCloseTo(0.23, 2)
    expect(pace.verdict).toBe('on_track')
  })
  it('exactly at the slow boundary (0.5× target) is on_track', () => {
    // target 250 → boundary 125 g/week → 500 g over 28 days → 0.125 rounds to 0.13
    const pace = bulkPace([{ iso: '2026-08-01', g: 62_800 }, { iso: '2026-08-29', g: 63_300 }], 250)
    expect(pace.kgPerWeek).toBe(0.13)
    expect(pace.verdict).toBe('on_track')
  })
})

/* ---------- nutrition ---------- */

describe('suggestNutrition', () => {
  it('coach defaults for 62.8 kg: 113 g protein, 2512 kcal', () => {
    expect(suggestNutrition(62.8)).toEqual({ proteinTargetG: 113, calorieTarget: 2512 })
  })
  it('respects custom per-kg rates', () => {
    expect(suggestNutrition(70, 2.0, 44)).toEqual({ proteinTargetG: 140, calorieTarget: 3080 })
  })
})

describe('proteinAdherence', () => {
  const days = [
    { iso: '2026-09-01', proteinG: 120, caloriesKcal: 2500 },
    { iso: '2026-09-02', proteinG: 100, caloriesKcal: 2400 },
    { iso: '2026-09-03', proteinG: null, caloriesKcal: 2100 },
    { iso: '2026-09-04', proteinG: 0, caloriesKcal: null },
  ]
  it('counts only logged days, averages over them', () => {
    const a = proteinAdherence(days, 113)
    expect(a.loggedDays).toBe(2)
    expect(a.hitDays).toBe(1)
    expect(a.avgG).toBe(110)
    expect(a.hitRate).toBe(0.5)
  })
  it('empty window → zeros with null rate', () => {
    expect(proteinAdherence([], 113)).toEqual({ hitDays: 0, loggedDays: 0, avgG: 0, hitRate: null })
  })
})

/* ---------- weekly window ---------- */

describe('sessionsInWindow', () => {
  it('trailing 7 days inclusive of today', () => {
    const sessions = [
      { date: '2026-09-07', durationMin: 45 }, // just outside (window starts 09-08)
      { date: '2026-09-08', durationMin: 45 },
      { date: '2026-09-13', durationMin: 60 },
      { date: '2026-09-14', durationMin: 50 }, // today
      { date: '2026-09-06', durationMin: 30 }, // outside
    ]
    const inWindow = sessionsInWindow(sessions, '2026-09-14')
    expect(inWindow).toHaveLength(3)
    expect(inWindow.reduce((s, x) => s + x.durationMin, 0)).toBe(155)
  })
})

/* ---------- presets integrity ---------- */

describe('FOUNDATION_AB preset', () => {
  it('matches the coach plan: A/B two days, A has the six prescribed exercises', () => {
    expect(FOUNDATION_AB.days).toHaveLength(2)
    const a = FOUNDATION_AB.days[0]
    expect(a.label).toBe('Workout A')
    expect(a.exercises.map((e) => e.name)).toEqual([
      'Squat',
      'Bench Press',
      'Lat Pulldown',
      'Romanian Deadlift',
      'Dumbbell Lateral Raise',
      'Plank',
    ])
    expect(a.exercises[0].sets).toBe(3)
    expect(a.exercises[0].repMin).toBe(8)
    expect(a.exercises[0].repMax).toBe(12)
  })
  it('plank is a timed exercise (no reps)', () => {
    const plank = FOUNDATION_AB.days[0].exercises[5]
    expect(plank.secondsMin).toBe(20)
    expect(plank.secondsMax).toBe(45)
    expect(plank.repMin).toBeUndefined()
  })
  it('every chip carries protein and kcal estimates', () => {
    for (const chip of PROTEIN_CHIPS) {
      expect(chip.proteinG).toBeGreaterThan(0)
      expect(chip.kcal).toBeGreaterThan(0)
    }
  })
})

/* ---------- timed sets helper ---------- */

describe('setSeconds', () => {
  it('returns seconds for timed sets, 0 otherwise', () => {
    expect(setSeconds({ weightGrams: null, reps: null, durationSeconds: 45 })).toBe(45)
    expect(setSeconds({ weightGrams: 50_000, reps: 8 })).toBe(0)
    expect(setSeconds({ weightGrams: 50_000, reps: 8, durationSeconds: 0 })).toBe(0)
  })
})

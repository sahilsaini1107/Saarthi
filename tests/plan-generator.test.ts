import { describe, expect, it } from 'vitest'
import {
  GENERATOR_GOALS,
  SPLIT_BY_DAYS,
  generatePlan,
  weeklySetVolume,
  type GeneratorInput,
} from '@/lib/plan-generator'

const input = (over: Partial<GeneratorInput> = {}): GeneratorInput => ({
  goal: 'muscle',
  daysPerWeek: 3,
  equipment: 'gym',
  ...over,
})

describe('generatePlan — split selection by day count', () => {
  it('maps 2/3/4/5/6 days to the documented splits', () => {
    expect(SPLIT_BY_DAYS[2]).toEqual(['full_a', 'full_b'])
    expect(SPLIT_BY_DAYS[3]).toEqual(['push', 'pull', 'legs'])
    expect(SPLIT_BY_DAYS[4]).toEqual(['upper', 'lower', 'push', 'pull'])
    expect(SPLIT_BY_DAYS[5]).toEqual(['push', 'pull', 'legs', 'upper', 'lower'])
    expect(SPLIT_BY_DAYS[6]).toEqual(['push', 'pull', 'legs', 'push', 'pull', 'legs'])
  })

  it('produces that many days, labeled A..F in order', () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const plan = generatePlan(input({ daysPerWeek: days }))
      expect(plan.days).toHaveLength(days)
      plan.days.forEach((d, i) => {
        expect(d.label).toBe(`Workout ${'ABCDEF'[i]}`)
        expect(d.focus.length).toBeGreaterThan(0)
      })
    }
  })

  it('rejects impossible day counts and unknown enums', () => {
    expect(() => generatePlan(input({ daysPerWeek: 1 }))).toThrow('2 and 6')
    expect(() => generatePlan(input({ daysPerWeek: 7 }))).toThrow()
    expect(() => generatePlan(input({ daysPerWeek: 3.5 }))).toThrow()
    expect(() => generatePlan(input({ goal: 'yolo' as never }))).toThrow()
  })
})

describe('generatePlan — goal tunes prescriptions only', () => {
  it('strength: 4 sets of 4–6 with 180s rest on main lifts', () => {
    const plan = generatePlan(input({ goal: 'strength', daysPerWeek: 3 }))
    const squat = plan.days[2].exercises[0] // legs day, main squat
    expect(squat.sets).toBe(4)
    expect(squat.repMin).toBe(4)
    expect(squat.repMax).toBe(6)
    expect(squat.restSeconds).toBe(180)
    // auxiliary moves keep 3 sets of 6–10
    const calf = plan.days[2].exercises[3]
    expect(calf.sets).toBe(3)
    expect(calf.repMin).toBe(6)
    expect(calf.repMax).toBe(10)
    expect(calf.restSeconds).toBe(120)
  })

  it('muscle: 3 sets of 8–12 mains, 10–15 aux', () => {
    const plan = generatePlan(input({ goal: 'muscle' }))
    const main = plan.days[0].exercises[0]
    expect(main.sets).toBe(3)
    expect([main.repMin, main.repMax]).toEqual([8, 12])
    const aux = plan.days[0].exercises[4] // triceps
    expect([aux.repMin, aux.repMax]).toEqual([10, 15])
    expect(aux.restSeconds).toBe(90)
  })

  it('lean: higher reps, short rest, 2-set accessories', () => {
    const plan = generatePlan(input({ goal: 'lean' }))
    const main = plan.days[0].exercises[0]
    expect([main.repMin, main.repMax]).toEqual([10, 15])
    expect(main.restSeconds).toBe(90)
    const aux = plan.days[0].exercises[4]
    expect(aux.sets).toBe(2)
    expect([aux.repMin, aux.repMax]).toEqual([12, 20])
  })

  it('general matches its balanced config', () => {
    const plan = generatePlan(input({ goal: 'general' }))
    const main = plan.days[0].exercises[0]
    expect([main.repMin, main.repMax]).toEqual([8, 12])
    expect(main.restSeconds).toBe(120)
    expect(plan.days[0].exercises[4].sets).toBe(2)
  })

  it('timed core stays seconds-based for every goal', () => {
    for (const goal of GENERATOR_GOALS) {
      const plan = generatePlan(input({ goal: goal.key, daysPerWeek: 4 }))
      const plank = plan.days[0].exercises.find((e) => e.name === 'Plank')!
      expect(plank.secondsMin).toBe(20)
      expect(plank.secondsMax).toBe(45)
      expect(plank.repMin).toBeUndefined()
      expect(plank.restSeconds).toBe(60)
    }
  })
})

describe('generatePlan — equipment tiers', () => {
  it('gym tier uses barbells/machines/cables', () => {
    const plan = generatePlan(input({ equipment: 'gym' }))
    const names = plan.days.flatMap((d) => d.exercises.map((e) => e.name))
    expect(names).toContain('Barbell Bench Press')
    expect(names).toContain('Back Squat')
    expect(names).toContain('Lat Pulldown')
  })

  it('dumbbells tier swaps to dumbbell/bodyweight forms — no barbells anywhere', () => {
    const plan = generatePlan(input({ equipment: 'dumbbells' }))
    for (const day of plan.days) {
      for (const ex of day.exercises) {
        expect(ex.equipment).not.toBe('barbell')
        expect(ex.equipment).not.toBe('machine')
        expect(ex.equipment).not.toBe('cable')
      }
    }
    expect(plan.days[0].exercises[0].name).toBe('Dumbbell Bench Press')
  })

  it('bodyweight tier is fully bodyweight and still complete', () => {
    const plan = generatePlan(input({ equipment: 'bodyweight' }))
    for (const day of plan.days) {
      expect(day.exercises.length).toBeGreaterThanOrEqual(5)
      for (const ex of day.exercises) expect(ex.equipment).toBe('bodyweight')
    }
    const names = plan.days.flatMap((d) => d.exercises.map((e) => e.name))
    expect(names).toContain('Push-up')
    expect(names).toContain('Pull-up')
  })
})

describe('generatePlan — structure sanity', () => {
  it('is deterministic — same input, byte-identical plan', () => {
    expect(generatePlan(input({ daysPerWeek: 4, goal: 'lean', equipment: 'dumbbells' }))).toEqual(
      generatePlan(input({ daysPerWeek: 4, goal: 'lean', equipment: 'dumbbells' })),
    )
  })

  it('names are unique within a day and every exercise has a valid prescription', () => {
    for (const days of [2, 3, 4, 5, 6]) {
      for (const equipment of ['gym', 'dumbbells', 'bodyweight'] as const) {
        for (const goal of ['strength', 'muscle', 'lean', 'general'] as const) {
          const plan = generatePlan(input({ daysPerWeek: days, equipment, goal }))
          for (const day of plan.days) {
            const names = day.exercises.map((e) => e.name)
            expect(new Set(names).size).toBe(names.length)
            for (const ex of day.exercises) {
              const hasReps = ex.repMin != null && ex.repMax != null
              const hasSeconds = ex.secondsMin != null && ex.secondsMax != null
              expect(hasReps || hasSeconds).toBe(true)
              expect(ex.sets).toBeGreaterThanOrEqual(2)
              expect(ex.sets).toBeLessThanOrEqual(4)
              expect(ex.restSeconds).toBeGreaterThanOrEqual(60)
            }
          }
        }
      }
    }
  })

  it('plan name and note describe goal + equipment; 6-day note warns about the double PPL', () => {
    const p4 = generatePlan(input({ daysPerWeek: 4, goal: 'strength', equipment: 'dumbbells' }))
    expect(p4.name).toBe('4-day Strength (dumbbells)')
    expect(p4.emoji).toBe('🏋️')
    expect(p4.note).toContain('4–6 reps')
    const p6 = generatePlan(input({ daysPerWeek: 6 }))
    expect(p6.note).toContain('PPL twice')
  })
})

describe('weeklySetVolume', () => {
  it('sums sets per muscle group across days, sorted desc', () => {
    const plan = generatePlan(input({ daysPerWeek: 3, goal: 'muscle' }))
    const vol = weeklySetVolume(plan)
    const byMuscle = new Map(vol.map((v) => [v.muscleGroup, v.sets]))
    // push day: chest 3+3, shoulders 3+3, arms 3 · pull: back 3+3+3, shoulders 3, arms 3 · legs: legs 12, core 3
    expect(byMuscle.get('chest')).toBe(6)
    expect(byMuscle.get('back')).toBe(9)
    expect(byMuscle.get('shoulders')).toBe(9)
    expect(byMuscle.get('legs')).toBe(12)
    expect(byMuscle.get('arms')).toBe(6)
    expect(byMuscle.get('core')).toBe(3)
    expect(vol).toEqual([...vol].sort((a, b) => b.sets - a.sets || a.muscleGroup.localeCompare(b.muscleGroup)))
  })

  it('matches the plan\u2019s total set count', () => {
    const plan = generatePlan(input({ daysPerWeek: 4, goal: 'lean' }))
    const total = weeklySetVolume(plan).reduce((s, v) => s + v.sets, 0)
    const expected = plan.days.reduce((s, d) => s + d.exercises.reduce((s2, e) => s2 + e.sets, 0), 0)
    expect(total).toBe(expected)
  })

  it('empty plan → empty volume', () => {
    expect(weeklySetVolume({ name: 'x', emoji: 'x', note: null as never, days: [] })).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  CORE_FLOW,
  FOUNDATION_AB,
  FULL_BODY_THREE_DAY,
  MOBILITY_FLOW,
  PLAN_PRESETS,
  PLAN_PRESET_LEVELS,
  PPL_SIX_DAY,
  PROTEIN_CHIPS,
  UPPER_LOWER_FOUR_DAY,
} from '@/lib/fitness-presets'

const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full_body', 'cardio', 'other']
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other']

describe('plan presets are structurally valid', () => {
  it('exposes every preset with a unique id', () => {
    const ids = PLAN_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('foundation_ab')
    expect(ids).toContain('ppl_6')
    expect(ids).toContain('upper_lower_4')
    expect(ids).toContain('full_body_3')
  })

  it('gives every preset a level line for the picker', () => {
    for (const p of PLAN_PRESETS) {
      expect(PLAN_PRESET_LEVELS[p.id], `missing level for ${p.id}`).toBeTruthy()
    }
  })

  it('uses only muscle groups and equipment the API accepts', () => {
    for (const preset of PLAN_PRESETS) {
      for (const day of preset.days) {
        for (const ex of day.exercises) {
          expect(MUSCLE_GROUPS, `${preset.id}/${ex.name}`).toContain(ex.muscleGroup)
          expect(EQUIPMENT, `${preset.id}/${ex.name}`).toContain(ex.equipment)
        }
      }
    }
  })

  it('prescribes either reps or seconds on every exercise, never neither', () => {
    for (const preset of PLAN_PRESETS) {
      for (const day of preset.days) {
        for (const ex of day.exercises) {
          const hasReps = ex.repMin != null && ex.repMax != null
          const hasSeconds = ex.secondsMin != null && ex.secondsMax != null
          expect(hasReps || hasSeconds, `${preset.id}/${ex.name} prescribes nothing`).toBe(true)
          expect(hasReps && hasSeconds, `${preset.id}/${ex.name} prescribes both`).toBe(false)
        }
      }
    }
  })

  it('keeps every range the right way round and every set count sane', () => {
    for (const preset of PLAN_PRESETS) {
      for (const day of preset.days) {
        for (const ex of day.exercises) {
          expect(ex.sets).toBeGreaterThanOrEqual(1)
          expect(ex.sets).toBeLessThanOrEqual(10)
          if (ex.repMin != null && ex.repMax != null) expect(ex.repMax).toBeGreaterThanOrEqual(ex.repMin)
          if (ex.secondsMin != null && ex.secondsMax != null) expect(ex.secondsMax).toBeGreaterThanOrEqual(ex.secondsMin)
          if (ex.restSeconds != null) {
            expect(ex.restSeconds).toBeGreaterThanOrEqual(10)
            expect(ex.restSeconds).toBeLessThanOrEqual(600)
          }
        }
      }
    }
  })

  it('names each exercise once per day — a duplicate would collide on (user, name)', () => {
    for (const preset of PLAN_PRESETS) {
      for (const day of preset.days) {
        const names = day.exercises.map((e) => e.name)
        expect(new Set(names).size, `${preset.id}/${day.label} repeats an exercise`).toBe(names.length)
      }
    }
  })

  it('keeps names inside the 80-character API limit', () => {
    for (const preset of PLAN_PRESETS) {
      expect(preset.name.length).toBeLessThanOrEqual(80)
      for (const day of preset.days) {
        expect(day.label.length).toBeLessThanOrEqual(60)
        for (const ex of day.exercises) expect(ex.name.length).toBeLessThanOrEqual(80)
      }
    }
  })
})

describe('preset shapes match their descriptions', () => {
  it('PPL runs three distinct days', () => {
    expect(PPL_SIX_DAY.days.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs'])
  })

  it('Upper/Lower alternates four days', () => {
    expect(UPPER_LOWER_FOUR_DAY.days.map((d) => d.label)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B'])
  })

  it('Full Body is a single rotating day', () => {
    expect(FULL_BODY_THREE_DAY.days).toHaveLength(1)
    expect(FULL_BODY_THREE_DAY.days[0].exercises.every((e) => e.sets >= 3)).toBe(true)
  })

  it('Foundation A/B alternates two days', () => {
    expect(FOUNDATION_AB.days).toHaveLength(2)
  })

  it('the core flow is entirely bodyweight', () => {
    expect(CORE_FLOW.days[0].exercises.every((e) => e.equipment === 'bodyweight')).toBe(true)
  })

  it('mobility covers upper body, spine and ankles', () => {
    expect(MOBILITY_FLOW.days.map((d) => d.label)).toEqual(['Upper Body', 'Spine', 'Ankles'])
  })
})

describe('protein chips', () => {
  it('has a unique id and positive portion for every chip', () => {
    const ids = PROTEIN_CHIPS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of PROTEIN_CHIPS) {
      expect(c.proteinG).toBeGreaterThan(0)
      expect(c.kcal).toBeGreaterThan(0)
    }
  })
})

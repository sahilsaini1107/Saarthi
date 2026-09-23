import { describe, expect, it } from 'vitest'
import { defaultRestSeconds, formatRest, REST_MAX_S, REST_MIN_S } from '@/lib/rest-timer'

// Rest defaults follow the coach plan: 2–3 min compounds, 60–120 s isolation.
// A plan-declared restSeconds always wins.

describe('defaultRestSeconds', () => {
  it('declared plan rest wins and is clamped to 10–600', () => {
    expect(defaultRestSeconds({ restSeconds: 120 })).toBe(120)
    expect(defaultRestSeconds({ restSeconds: 5 })).toBe(REST_MIN_S)
    expect(defaultRestSeconds({ restSeconds: 99_999 })).toBe(REST_MAX_S)
    expect(defaultRestSeconds({ restSeconds: 90.6 })).toBe(91)
  })

  it('null/undefined/NaN declared rest falls through to equipment defaults', () => {
    expect(defaultRestSeconds({ restSeconds: null, equipment: 'barbell' })).toBe(150)
    expect(defaultRestSeconds({ restSeconds: Number.NaN })).toBe(90)
  })

  it('equipment bands', () => {
    expect(defaultRestSeconds({ equipment: 'barbell' })).toBe(150) // middle of 2–3 min
    expect(defaultRestSeconds({ equipment: 'machine' })).toBe(120)
    expect(defaultRestSeconds({ equipment: 'cable' })).toBe(105)
    expect(defaultRestSeconds({ equipment: 'dumbbell' })).toBe(90) // middle of 60–120 s
    expect(defaultRestSeconds({ equipment: 'bodyweight' })).toBe(75)
    expect(defaultRestSeconds({ equipment: 'other' })).toBe(90)
    expect(defaultRestSeconds({})).toBe(90)
  })

  it('timed holds rest 60 s regardless of equipment', () => {
    expect(defaultRestSeconds({ timed: true, equipment: 'barbell' })).toBe(60)
    expect(defaultRestSeconds({ timed: true })).toBe(60)
  })

  it('every default sits inside the coach bands', () => {
    for (const equipment of ['barbell', 'machine', 'cable', 'dumbbell', 'bodyweight', 'other']) {
      const s = defaultRestSeconds({ equipment })
      expect(s).toBeGreaterThanOrEqual(60)
      expect(s).toBeLessThanOrEqual(180)
    }
  })
})

describe('formatRest', () => {
  it('mm:ss face', () => {
    expect(formatRest(150)).toBe('2:30')
    expect(formatRest(60)).toBe('1:00')
    expect(formatRest(9)).toBe('0:09')
    expect(formatRest(0)).toBe('0:00')
    expect(formatRest(-3)).toBe('0:00')
  })
})

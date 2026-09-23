import { describe, expect, it } from 'vitest'
import { REVISION_LADDER_DAYS, applyRevision, isRevisionDue, nextRevisionGapDays, pacing, startRevisionLadder } from '@/lib/study'

// Hand-traced pacing + revision-ladder scenarios.
// Ladder (Decision #20): [3, 7, 14, 30, 90] days; forgotten → shortest gap.

describe('revision ladder', () => {
  it('gaps follow the ladder and graduate after the last rung', () => {
    expect(REVISION_LADDER_DAYS).toEqual([3, 7, 14, 30, 90])
    expect(nextRevisionGapDays(0)).toBe(3)
    expect(nextRevisionGapDays(1)).toBe(7)
    expect(nextRevisionGapDays(4)).toBe(90)
    expect(nextRevisionGapDays(5)).toBeNull()
  })
  it('a successful revision schedules the next rung', () => {
    const r = applyRevision(0, 'revised', '2026-09-06')
    expect(r).toEqual({ stage: 1, nextRevisionAt: '2026-09-13', graduated: false }) // +7 days
  })
  it('a forgotten revision restarts at the shortest gap', () => {
    const r = applyRevision(3, 'forgot', '2026-09-06')
    expect(r).toEqual({ stage: 0, nextRevisionAt: '2026-09-09', graduated: false }) // +3 days
  })
  it('graduates after the final rung', () => {
    const r = applyRevision(4, 'revised', '2026-09-06')
    expect(r).toEqual({ stage: 5, nextRevisionAt: null, graduated: true })
  })
  it('first study schedules revision #1 three days out', () => {
    expect(startRevisionLadder('2026-09-06')).toEqual({ revisionStage: 0, nextRevisionAt: '2026-09-09' })
  })
  it('isRevisionDue: done + scheduled today-or-earlier only', () => {
    expect(isRevisionDue({ status: 'done', nextRevisionAt: '2026-09-06' }, '2026-09-06')).toBe(true)
    expect(isRevisionDue({ status: 'done', nextRevisionAt: '2026-09-01' }, '2026-09-06')).toBe(true) // overdue
    expect(isRevisionDue({ status: 'done', nextRevisionAt: '2026-09-07' }, '2026-09-06')).toBe(false)
    expect(isRevisionDue({ status: 'learning', nextRevisionAt: '2026-09-06' }, '2026-09-06')).toBe(false)
    expect(isRevisionDue({ status: 'done', nextRevisionAt: null }, '2026-09-06')).toBe(false) // graduated
  })
})

describe('pacing', () => {
  // 10-unit syllabus, 2026-09-01 → 2026-09-10 = 10 planned days.
  // On 2026-09-06: elapsed = 6 (start day counts), expected = 60%.
  const base = { startDate: '2026-09-01', targetEndDate: '2026-09-10', today: '2026-09-06', totalUnits: 10 }

  it('counts the start day as day 1', () => {
    const r = pacing({ ...base, doneUnits: 0 })
    expect(r.elapsedDays).toBe(6)
    expect(r.totalDays).toBe(10)
    expect(r.expectedPct).toBeCloseTo(0.6, 6)
  })

  it('at_risk: ≥25pp behind and projects the finish from observed pace', () => {
    const r = pacing({ ...base, doneUnits: 3 }) // actual 30%, delta −30pp
    expect(r.health).toBe('at_risk')
    expect(r.actualPct).toBeCloseTo(0.3, 6)
    expect(r.deltaPct).toBeCloseTo(-30, 6)
    expect(r.unitsPerDay).toBeCloseTo(0.5, 6) // 3 units / 6 days
    expect(r.projectedEndDate).toBe('2026-09-20') // 7 left / 0.5 = 14 days
  })

  it('behind band (−25,−10]', () => {
    expect(pacing({ ...base, doneUnits: 5 }).health).toBe('behind') // −10pp exactly
    expect(pacing({ ...base, doneUnits: 6 }).health).toBe('on_track') // 0pp
  })
  it('+10pp exactly lands in ahead', () => {
    expect(pacing({ ...base, doneUnits: 7 }).health).toBe('ahead') // 70 − 60 = +10pp
  })

  it('past the deadline with units left is at_risk', () => {
    const r = pacing({ ...base, today: '2026-09-15', doneUnits: 3 })
    expect(r.health).toBe('at_risk')
    expect(r.expectedPct).toBe(1) // clamped
  })

  it('finishing every unit reports done regardless of dates', () => {
    const r = pacing({ ...base, today: '2026-09-01', doneUnits: 10 })
    expect(r.health).toBe('done')
    expect(r.actualPct).toBe(1)
  })

  it('no target end → no_target with null expectations', () => {
    const r = pacing({ startDate: '2026-09-01', targetEndDate: null, today: '2026-09-06', totalUnits: 10, doneUnits: 2 })
    expect(r.health).toBe('no_target')
    expect(r.expectedPct).toBeNull()
    expect(r.totalDays).toBeNull()
    expect(r.projectedEndDate).toBe('2026-09-30') // 8 left at 2-in-6-days pace = 24 days
  })

  it('no units → no projection', () => {
    const r = pacing({ ...base, doneUnits: 0 })
    expect(r.unitsPerDay).toBe(0)
    expect(r.projectedEndDate).toBeNull()
  })

  it('month + leap-year safe elapsed math', () => {
    const r = pacing({ startDate: '2024-02-27', targetEndDate: '2024-03-05', today: '2024-02-29', totalUnits: 7, doneUnits: 2 })
    expect(r.elapsedDays).toBe(3) // 27th, 28th, 29th (leap day exists)
    expect(r.totalDays).toBe(8) // Feb 27 → Mar 5 inclusive
  })
})

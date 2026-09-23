// Phase 15 — Life Principles pure math + the Dincharya preset invariants.
// All functions take an injectable "today" so tests control time (Decision #8).

import { describe, expect, it } from 'vitest'
import {
  adherenceRate,
  breaksInWindow,
  categoryMeta,
  checksByDay,
  dayStatus,
  isPrincipleCategory,
  isPrincipleStatus,
  keptStreak,
  lastBreak,
  longestKeptRun,
  recentDayStrip,
  toChecks,
  type CheckLike,
} from '@/lib/principles'
import { computeLifeScore, principleScore } from '@/lib/lifescore'
import { DINCHARYA } from '@/lib/dincharya'

const T = '2026-09-20' // a Sunday, per the fixed test clock

function checks(spec: Record<string, 'kept' | 'broken' | 'na'>): CheckLike[] {
  return Object.entries(spec).map(([date, status]) => ({ date, status }))
}

describe('toChecks + guards', () => {
  it('drops rows with unknown status and normalises dates to ISO', () => {
    const rows = [
      { date: new Date('2026-09-19T00:00:00.000Z'), status: 'kept' },
      { date: new Date('2026-09-18T00:00:00.000Z'), status: 'kinda' },
    ]
    expect(toChecks(rows)).toEqual([{ date: '2026-09-19', status: 'kept' }])
  })

  it('status/category guards', () => {
    expect(isPrincipleStatus('kept')).toBe(true)
    expect(isPrincipleStatus('BROKEN')).toBe(false)
    expect(isPrincipleCategory('money')).toBe(true)
    expect(isPrincipleCategory('fame')).toBe(false)
    expect(categoryMeta('nope')).toMatchObject({ label: 'Character', emoji: '🧭' })
  })

  it('checksByDay + dayStatus lookups', () => {
    const byDay = checksByDay([{ date: '2026-09-19', status: 'broken' }])
    expect(dayStatus(byDay, '2026-09-19')).toBe('broken')
    expect(dayStatus(byDay, '2026-09-18')).toBeNull()
  })
})

describe('adherenceRate — kept / judged, na and unmarked excluded', () => {
  it('kept / (kept + broken)', () => {
    const c = checks({ '2026-09-17': 'kept', '2026-09-18': 'kept', '2026-09-19': 'broken', '2026-09-20': 'kept' })
    // window 17..20 → 3 kept, 1 broken
    expect(adherenceRate(c, '2026-09-17', T, T)).toBe(0.75)
  })

  it('na days are excluded from the denominator (explicit skips are not judged)', () => {
    const c = checks({ '2026-09-18': 'kept', '2026-09-19': 'na', '2026-09-20': 'broken' })
    expect(adherenceRate(c, '2026-09-18', T, T)).toBe(0.5)
  })

  it('unmarked days never count against you', () => {
    const c = checks({ '2026-09-20': 'kept' })
    // 30-day window with one kept day → 1.0, not 1/30
    expect(adherenceRate(c, '2026-08-22', T, T)).toBe(1)
  })

  it('null when nothing was judged in the window (no data ≠ 0%)', () => {
    expect(adherenceRate(checks({ '2026-09-19': 'na' }), '2026-09-01', T, T)).toBeNull()
    expect(adherenceRate([], '2026-09-01', T, T)).toBeNull()
  })

  it('window bounds are inclusive; end after today clamps to today', () => {
    const c = checks({ '2026-09-01': 'kept', '2026-09-20': 'broken' })
    expect(adherenceRate(c, '2026-09-01', '2026-09-01', T)).toBe(1)
    expect(adherenceRate(c, '2026-09-01', '2026-12-31', T)).toBe(0.5) // only the 20th is broken ≤ today
  })

  it('empty window (start > end) → null', () => {
    expect(adherenceRate(checks({ '2026-09-01': 'kept' }), '2026-10-01', '2026-09-01', T)).toBeNull()
  })
})

describe('keptStreak — grace rule and na handling', () => {
  it('counts consecutive kept days ending today', () => {
    const c = checks({ '2026-09-18': 'kept', '2026-09-19': 'kept', '2026-09-20': 'kept' })
    expect(keptStreak(c, T)).toBe(3)
  })

  it('a broken day stops the streak', () => {
    const c = checks({ '2026-09-18': 'kept', '2026-09-19': 'broken', '2026-09-20': 'kept' })
    expect(keptStreak(c, T)).toBe(1)
  })

  it('na days continue the streak without extending it', () => {
    const c = checks({ '2026-09-17': 'kept', '2026-09-18': 'na', '2026-09-19': 'kept', '2026-09-20': 'na' })
    expect(keptStreak(c, T)).toBe(2)
  })

  it('grace: unreviewed today does not break the streak (day is not over)', () => {
    const c = checks({ '2026-09-18': 'kept', '2026-09-19': 'kept' })
    expect(keptStreak(c, T)).toBe(2)
  })

  it('a broken TODAY is a broken streak — grace does not excuse it', () => {
    const c = checks({ '2026-09-17': 'kept', '2026-09-18': 'kept', '2026-09-20': 'broken' })
    expect(keptStreak(c, T)).toBe(0)
  })

  it('an unreviewed PAST day stops the walk (a rule you forgot is not kept)', () => {
    const c = checks({ '2026-09-15': 'kept', '2026-09-20': 'kept' })
    expect(keptStreak(c, T)).toBe(1)
  })
})

describe('longestKeptRun — full-history best run', () => {
  it('finds the best consecutive run', () => {
    const c = checks({
      '2026-09-01': 'kept',
      '2026-09-02': 'kept',
      '2026-09-03': 'kept',
      '2026-09-04': 'broken',
      '2026-09-05': 'kept',
      '2026-09-06': 'kept',
    })
    expect(longestKeptRun(c)).toBe(3)
  })

  it('na continues a run without adding to it', () => {
    const c = checks({ '2026-09-01': 'kept', '2026-09-02': 'na', '2026-09-03': 'kept' })
    expect(longestKeptRun(c)).toBe(2)
  })

  it('gaps inside the entry range reset the run (untracked ≠ kept)', () => {
    const c = checks({ '2026-09-01': 'kept', '2026-09-02': 'kept', '2026-09-05': 'kept', '2026-09-06': 'kept', '2026-09-07': 'kept' })
    expect(longestKeptRun(c)).toBe(3)
  })

  it('empty history → 0', () => {
    expect(longestKeptRun([])).toBe(0)
  })
})

describe('breaks + lastBreak', () => {
  it('counts broken days inside the window only', () => {
    const c = checks({ '2026-08-01': 'broken', '2026-09-10': 'broken', '2026-09-15': 'broken', '2026-09-19': 'na' })
    expect(breaksInWindow(c, '2026-09-01', T, T)).toBe(2)
    expect(breaksInWindow(c, '2026-09-11', '2026-09-15', T)).toBe(1)
  })

  it('future end date clamps to today', () => {
    const c = checks({ '2026-09-10': 'broken' })
    expect(breaksInWindow(c, '2026-09-01', '2026-12-31', T)).toBe(1)
  })

  it('lastBreak returns the most recent broken day', () => {
    const c = checks({ '2026-09-05': 'broken', '2026-09-15': 'broken', '2026-09-18': 'kept' })
    expect(lastBreak(c)).toBe('2026-09-15')
    expect(lastBreak(checks({ '2026-09-15': 'kept' }))).toBeNull()
  })
})

describe('recentDayStrip', () => {
  it('14 cells ending at today, chronological, future always false here', () => {
    const c = checks({ '2026-09-20': 'kept', '2026-09-19': 'broken' })
    const strip = recentDayStrip(c, T, 14)
    expect(strip).toHaveLength(14)
    expect(strip[strip.length - 1]).toEqual({ iso: T, status: 'kept', future: false })
    expect(strip[strip.length - 2].status).toBe('broken')
    expect(strip[0]).toEqual({ iso: '2026-09-07', status: null, future: false })
    expect(strip.every((d) => !d.future)).toBe(true)
  })
})

describe('principleScore + Life Score growth pillar integration', () => {
  it('ratio → percentage, clamped, null passes through', () => {
    expect(principleScore(null)).toBeNull()
    expect(principleScore(Number.NaN)).toBeNull()
    expect(principleScore(0.75)).toBe(75)
    expect(principleScore(1.5)).toBe(100)
    expect(principleScore(-1)).toBe(0)
  })

  it('growth pillar: principles join the mean only when present', () => {
    // all required components null = "no data" for everything else
    const base = {
      savingsRatePct: null,
      budgetOnTrackRatio: null,
      netWorthUp: null,
      habitRate30: null,
      workoutMinutes7d: null,
      studyMinutes7d: null,
      journalEntries30d: null,
      moodScore: null,
      skinStreak: null,
      goalJournalMinutes7d: null,
    }
    // untouched → component skipped, growth stays null
    expect(computeLifeScore({ ...base }).growth.score).toBeNull()
    // only principles judged → growth = 80
    const only = computeLifeScore({ ...base, principleAdherence30: 0.8 })
    expect(only.growth.score).toBe(80)
    // joins the mean with an existing component: (100 + 80) / 2 = 90
    const both = computeLifeScore({ ...base, studyMinutes7d: 120, principleAdherence30: 0.8 })
    expect(both.growth.score).toBe(90)
    // explicitly null behaves like absent (backward compatible payloads)
    const explicitNull = computeLifeScore({ ...base, principleAdherence30: null, studyMinutes7d: 120 })
    expect(explicitNull.growth.score).toBe(100)
  })
})

describe('DINCHARYA preset — routine-service invariants', () => {
  it('fits the routine builder limits: ≤20 steps, titles ≤80 chars, minutes 0–240 or null', () => {
    expect(DINCHARYA.steps.length).toBeLessThanOrEqual(20)
    expect(DINCHARYA.steps.length).toBeGreaterThan(0)
    for (const s of DINCHARYA.steps) {
      expect(s.title.trim().length).toBeGreaterThan(0)
      expect(s.title.length).toBeLessThanOrEqual(80)
      if (s.minutes !== null) {
        expect(Number.isInteger(s.minutes)).toBe(true)
        expect(s.minutes).toBeGreaterThanOrEqual(0)
        expect(s.minutes).toBeLessThanOrEqual(240)
      }
    }
  })

  it('has a name and emoji the builder accepts', () => {
    expect(DINCHARYA.name.trim().length).toBeGreaterThan(0)
    expect(DINCHARYA.name.length).toBeLessThanOrEqual(60)
    expect(DINCHARYA.emoji.length).toBeGreaterThan(0)
  })

  it('ends with the sleep-by-22:30 step and starts with waking before sunrise', () => {
    expect(DINCHARYA.steps[0].title.toLowerCase()).toContain('wake')
    expect(DINCHARYA.steps[DINCHARYA.steps.length - 1].title.toLowerCase()).toContain('22:30')
  })
})

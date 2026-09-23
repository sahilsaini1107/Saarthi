import { describe, expect, it } from 'vitest'
import {
  journalStreaks,
  sumMinutesByDay,
  timeProgress,
  toContributionDays,
} from '@/lib/milestone'

/* ---------- sumMinutesByDay ---------- */

describe('sumMinutesByDay', () => {
  it('empty logs → empty map', () => {
    expect(sumMinutesByDay([]).size).toBe(0)
  })

  it('aggregates multiple milestones logging the same day', () => {
    const byDay = sumMinutesByDay([
      { iso: '2026-09-10', minutes: 45 },
      { iso: '2026-09-10', minutes: 30 },
      { iso: '2026-09-11', minutes: 90 },
    ])
    expect(byDay.get('2026-09-10')).toBe(75)
    expect(byDay.get('2026-09-11')).toBe(90)
    expect(byDay.size).toBe(2)
  })

  it('ignores zero/negative/non-finite minutes', () => {
    const byDay = sumMinutesByDay([
      { iso: '2026-09-10', minutes: 0 },
      { iso: '2026-09-10', minutes: -5 },
      { iso: '2026-09-10', minutes: Number.NaN },
      { iso: '2026-09-11', minutes: 20 },
    ])
    expect(byDay.get('2026-09-10')).toBeUndefined()
    expect(byDay.get('2026-09-11')).toBe(20)
    expect(byDay.size).toBe(1)
  })
})

/* ---------- timeProgress ---------- */

describe('timeProgress', () => {
  it('no target (null/undefined/0) → null', () => {
    expect(timeProgress(120, null)).toBeNull()
    expect(timeProgress(120, undefined)).toBeNull()
    expect(timeProgress(120, 0)).toBeNull()
  })

  it('zero total → 0, not null', () => {
    expect(timeProgress(0, 2400)).toBe(0)
  })

  it('partial progress is exact', () => {
    expect(timeProgress(90, 240)).toBe(0.375)
    expect(timeProgress(600, 2400)).toBe(0.25)
  })

  it('caps at 1 — over-planning never shows >100%', () => {
    expect(timeProgress(3000, 2400)).toBe(1)
    expect(timeProgress(2400, 2400)).toBe(1)
  })
})

/* ---------- toContributionDays ---------- */

describe('toContributionDays', () => {
  it('maps minutes into sorted contribution-day inputs', () => {
    const days = toContributionDays(
      new Map([
        ['2026-09-11', 60],
        ['2026-09-10', 30],
      ]),
    )
    expect(days).toEqual([
      { iso: '2026-09-10', amountMilli: 30, tasksDone: 0 },
      { iso: '2026-09-11', amountMilli: 60, tasksDone: 0 },
    ])
  })

  it('empty map → empty array', () => {
    expect(toContributionDays(new Map())).toEqual([])
  })
})

/* ---------- journalStreaks ---------- */

describe('journalStreaks', () => {
  const today = '2026-09-12' // Saturday

  it('no logs → 0/0', () => {
    expect(journalStreaks(new Map(), today)).toEqual({ current: 0, best: 0 })
  })

  it('today logged → run ends today', () => {
    const byDay = new Map([
      ['2026-09-10', 45],
      ['2026-09-11', 30],
      ['2026-09-12', 60],
    ])
    expect(journalStreaks(byDay, today)).toEqual({ current: 3, best: 3 })
  })

  it('today NOT logged → grace: yesterday still anchors the run', () => {
    const byDay = new Map([
      ['2026-09-09', 45],
      ['2026-09-10', 30],
      ['2026-09-11', 60],
    ])
    expect(journalStreaks(byDay, today)).toEqual({ current: 3, best: 3 })
  })

  it('a gap breaks the current run but best keeps the history', () => {
    const byDay = new Map([
      ['2026-09-01', 45],
      ['2026-09-02', 30],
      ['2026-09-03', 60],
      ['2026-09-11', 20],
      ['2026-09-12', 20],
    ])
    expect(journalStreaks(byDay, today)).toEqual({ current: 2, best: 3 })
  })

  it('a logged TODAY with a gap before it → current run is just today', () => {
    const byDay = new Map([
      ['2026-09-05', 45],
      ['2026-09-12', 30],
    ])
    expect(journalStreaks(byDay, today)).toEqual({ current: 1, best: 1 })
  })
})

import { describe, expect, it } from 'vitest'
import {
  formatMinutes,
  levelForCheckIn,
  levelsForValues,
  rollupMonths,
  rollupWeeks,
  trailingWindow,
  weekStartISO,
} from '@/lib/effort-grid'

/* ---------- trailing window ---------- */

describe('trailingWindow', () => {
  const today = '2026-09-12' // Saturday

  it('null/undefined start → null (nothing to render yet)', () => {
    expect(trailingWindow(null, today)).toBeNull()
    expect(trailingWindow(undefined, today)).toBeNull()
  })

  it('future start → null (habit starts tomorrow = no grid today)', () => {
    expect(trailingWindow('2026-09-13', today)).toBeNull()
  })

  it('start today → single-day window', () => {
    expect(trailingWindow('2026-09-12', today)).toEqual({ start: today, end: today })
  })

  it('young habit → exact [start, today] window', () => {
    expect(trailingWindow('2026-09-01', today)).toEqual({ start: '2026-09-01', end: today })
  })

  it('ancient habit → capped to the LAST 400 days', () => {
    const w = trailingWindow('2019-01-01', today)
    expect(w).toEqual({ start: '2025-08-09', end: today })
    // span is exactly 400 inclusive days
    expect(Math.round((Date.UTC(2026, 8, 12) - Date.UTC(2025, 7, 9)) / 86_400_000) + 1).toBe(400)
  })

  it('custom cap respected (60 days)', () => {
    const w = trailingWindow('2026-01-01', today, 60)
    expect(w).toEqual({ start: '2026-07-15', end: today })
  })

  it('leap-safe: 366-day window incl. Feb 29 is NOT capped at 400', () => {
    const w = trailingWindow('2023-03-01', '2024-02-29')
    expect(w).toEqual({ start: '2023-03-01', end: '2024-02-29' })
  })
})

/* ---------- habit levels ---------- */

describe('levelForCheckIn', () => {
  it('done → L4 (full block), missed/rest → L0', () => {
    expect(levelForCheckIn(true)).toBe(4)
    expect(levelForCheckIn(false)).toBe(0)
  })
})

/* ---------- value levels (study minutes) ---------- */

describe('levelsForValues', () => {
  it('zero minutes → L0', () => {
    expect(levelsForValues([{ iso: '2026-09-01', value: 0 }])).toEqual([0])
  })

  it('under 4 nonzero days → any effort shows L2', () => {
    const levels = levelsForValues([
      { iso: '2026-09-01', value: 15 },
      { iso: '2026-09-02', value: 0 },
      { iso: '2026-09-03', value: 90 },
    ])
    expect(levels).toEqual([2, 0, 2])
  })

  it('quartile boundaries (nearest-rank on 5 nonzero values)', () => {
    // sorted [10,20,30,40,50] → q1=20, q2=30, q3=40
    const days = [10, 0, 20, 30, 40, 50].map((v, i) => ({ iso: `2026-09-0${i + 1}`, value: v }))
    expect(levelsForValues(days)).toEqual([1, 0, 2, 3, 4, 4])
  })

  it('8 values: quartiles land mid-distribution', () => {
    // sorted [10..80] → q1=20, q2=40, q3=60; 20 is not < q1 so it shows L2
    const days = Array.from({ length: 8 }, (_, i) => ({ iso: `2026-09-0${i + 1}`, value: (i + 1) * 10 }))
    expect(levelsForValues(days)).toEqual([1, 2, 2, 3, 3, 4, 4, 4])
  })
})

/* ---------- week roll-ups ---------- */

describe('rollupWeeks', () => {
  it('weekStartISO is Monday-anchored', () => {
    expect(weekStartISO('2026-09-12')).toBe('2026-09-07') // Saturday → Mon
    expect(weekStartISO('2026-09-07')).toBe('2026-09-07') // Monday → itself
    expect(weekStartISO('2026-09-13')).toBe('2026-09-07') // Sunday → previous Mon
  })

  it('current week is partial (end = today), past weeks run Mon..Sun', () => {
    const byDay = new Map<string, number>([
      ['2026-09-07', 1],
      ['2026-09-09', 1],
      ['2026-08-31', 1], // Monday last week
      ['2026-09-06', 1], // Sunday last week
    ])
    const weeks = rollupWeeks(byDay, '2026-09-12', 3)
    expect(weeks).toHaveLength(3)
    expect(weeks[0]).toEqual({ start: '2026-08-24', end: '2026-08-30', total: 0, activeDays: 0, current: false })
    expect(weeks[1]).toEqual({ start: '2026-08-31', end: '2026-09-06', total: 2, activeDays: 2, current: false })
    expect(weeks[2]).toEqual({ start: '2026-09-07', end: '2026-09-12', total: 2, activeDays: 2, current: true })
  })

  it('sums VALUES not just days (study minutes roll-up)', () => {
    const byDay = new Map<string, number>([
      ['2026-09-07', 45],
      ['2026-09-08', 30],
    ])
    const [current] = rollupWeeks(byDay, '2026-09-12', 1)
    expect(current.total).toBe(75)
    expect(current.activeDays).toBe(2)
  })

  it('week spanning a month boundary is one week', () => {
    const byDay = new Map<string, number>([
      ['2026-12-28', 1], // Monday
      ['2027-01-03', 1], // Sunday
    ])
    const [current] = rollupWeeks(byDay, '2027-01-03', 1)
    expect(current).toEqual({ start: '2026-12-28', end: '2027-01-03', total: 2, activeDays: 2, current: true })
  })

  it('leap day belongs to its own week', () => {
    // 2024-02-29 was a Thursday; its week runs Mon 2024-02-26 .. Sun 2024-03-03
    const byDay = new Map<string, number>([['2024-02-29', 60]])
    const [current] = rollupWeeks(byDay, '2024-03-01', 1)
    expect(current.start).toBe('2024-02-26')
    expect(current.total).toBe(60)
  })
})

/* ---------- month roll-ups ---------- */

describe('rollupMonths', () => {
  it('current month is partial, prior months full', () => {
    const byDay = new Map<string, number>([
      ['2026-07-15', 1],
      ['2026-08-02', 1],
      ['2026-09-01', 1],
      ['2026-09-11', 1],
    ])
    const months = rollupMonths(byDay, '2026-09-12', 3)
    expect(months.map((m) => m.monthKey)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(months[0]).toEqual({ monthKey: '2026-07', total: 1, activeDays: 1, current: false })
    expect(months[2]).toEqual({ monthKey: '2026-09', total: 2, activeDays: 2, current: true })
  })

  it('month with no activity still returned (rhythm is information)', () => {
    const months = rollupMonths(new Map([['2026-09-01', 5]]), '2026-09-12', 2)
    expect(months[0]).toEqual({ monthKey: '2026-08', total: 0, activeDays: 0, current: false })
    expect(months[1].total).toBe(5)
  })

  it('leap February includes the 29th', () => {
    const byDay = new Map<string, number>([['2024-02-29', 25]])
    const feb = rollupMonths(byDay, '2024-03-01', 2)[0]
    expect(feb.monthKey).toBe('2024-02')
    expect(feb.total).toBe(25)
    expect(feb.activeDays).toBe(1)
  })

  it('crosses the year boundary correctly', () => {
    const months = rollupMonths(new Map([['2026-12-31', 1]]), '2027-01-10', 2)
    expect(months.map((m) => m.monthKey)).toEqual(['2026-12', '2027-01'])
  })
})

/* ---------- formatting ---------- */

describe('formatMinutes', () => {
  it('renders minutes, hours and mixes', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(60)).toBe('1h')
    expect(formatMinutes(75)).toBe('1h 15m')
    expect(formatMinutes(600)).toBe('10h')
  })
})

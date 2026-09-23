import { describe, expect, it } from 'vitest'
import { byDate, historyMonthStats, monthMatrix } from '@/lib/workout-history'

// Hand-traced calendar scenarios. Monday-start grids (ISO convention).

const S = (id: string, date: string, durationMin = 60, volumeGrams = 10_000) => ({
  id,
  date,
  label: `W${id}`,
  durationMin,
  volumeGrams,
})

describe('monthMatrix', () => {
  it('August 2026 starts on a Saturday → 2 lead cells from July, 5 rows', () => {
    // 2026-08-01 is a Saturday (offset 5); 31 days → 36 cells → 6 rows.
    const rows = monthMatrix(2026, 8)
    expect(rows.length).toBe(6)
    expect(rows[0][0].iso).toBe('2026-07-27') // Monday
    expect(rows[0][0].inMonth).toBe(false)
    expect(rows[0][5].iso).toBe('2026-08-01') // Saturday slot
    expect(rows[0][5].inMonth).toBe(true)
    expect(rows[0][6].iso).toBe('2026-08-02')
    expect(rows.flat().every((c) => rows.flat().filter((x) => x.iso === c.iso).length === 1)).toBe(true)
  })

  it('February 2027 (28 days, starts Monday) fits exactly 4 rows', () => {
    const rows = monthMatrix(2027, 2)
    expect(rows.length).toBe(4)
    expect(rows[0][0].iso).toBe('2027-02-01')
    expect(rows[0][0].inMonth).toBe(true)
    expect(rows[3][6].iso).toBe('2027-02-28')
  })

  it('every row has exactly 7 cells Mon..Sun', () => {
    for (const rows of [monthMatrix(2026, 9), monthMatrix(2024, 2), monthMatrix(2026, 12)]) {
      for (const row of rows) {
        expect(row).toHaveLength(7)
      }
    }
  })

  it('leap February 2024 has 29 in-month days', () => {
    const inMonth = monthMatrix(2024, 2).flat().filter((c) => c.inMonth)
    expect(inMonth).toHaveLength(29)
  })

  it('rejects bad months', () => {
    expect(() => monthMatrix(2026, 13)).toThrow()
    expect(() => monthMatrix(2026, 0)).toThrow()
  })
})

describe('byDate', () => {
  it('groups and sorts deterministically', () => {
    const map = byDate([S('b', '2026-09-02'), S('a', '2026-09-01'), S('c', '2026-09-02')])
    expect(map.get('2026-09-01')?.map((s) => s.id)).toEqual(['a'])
    expect(map.get('2026-09-02')?.map((s) => s.id)).toEqual(['b', 'c'])
    expect(map.size).toBe(2)
  })
})

describe('historyMonthStats', () => {
  const sessions = [
    S('1', '2026-09-01', 45, 2_000_000),
    S('2', '2026-09-03', 60, 3_500_000),
    S('3', '2026-09-03', 30, 500_000),
    S('4', '2026-08-30', 90, 9_999_990), // previous month — excluded
    S('5', '2026-10-01', 20, 100_000), // next month — excluded
  ]

  it('aggregates only the requested month', () => {
    const stats = historyMonthStats(sessions, 2026, 9)
    expect(stats.sessions).toBe(3)
    expect(stats.minutes).toBe(135)
    expect(stats.volumeKg).toBe(6000) // 2_000_000 + 3_500_000 + 500_000 g = 6 t
    expect(stats.days).toBe(2) // two distinct training days
  })

  it('cross-checks August and October isolation', () => {
    expect(historyMonthStats(sessions, 2026, 8)).toEqual({ sessions: 1, minutes: 90, volumeKg: 9999.99, days: 1 })
    expect(historyMonthStats(sessions, 2026, 10)).toEqual({ sessions: 1, minutes: 20, volumeKg: 100, days: 1 })
  })

  it('empty month zeroes out', () => {
    expect(historyMonthStats(sessions, 2025, 1)).toEqual({ sessions: 0, minutes: 0, volumeKg: 0, days: 0 })
  })
})

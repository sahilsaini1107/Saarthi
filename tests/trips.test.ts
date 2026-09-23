// Phase 5.2 — trip phase, duration and daily-series math.
import { describe, expect, it } from 'vitest'
import { daysLeftInTrip, daysUntilStart, tripDaySeries, tripDurationDays, tripPeakDay, tripPhase, tripTotalSpendPaise } from '@/lib/trips'

describe('tripPhase', () => {
  it('planned → ongoing → past', () => {
    expect(tripPhase('2026-10-10', '2026-10-15', '2026-10-01')).toBe('planned')
    expect(tripPhase('2026-10-10', '2026-10-15', '2026-10-12')).toBe('ongoing')
    expect(tripPhase('2026-10-10', '2026-10-15', '2026-10-16')).toBe('past')
  })

  it('start day is ongoing; end day is still ongoing (last day counts)', () => {
    expect(tripPhase('2026-10-10', '2026-10-15', '2026-10-10')).toBe('ongoing')
    expect(tripPhase('2026-10-10', '2026-10-15', '2026-10-15')).toBe('ongoing')
  })

  it('open-ended trip never becomes past', () => {
    expect(tripPhase('2026-01-01', null, '2026-09-06')).toBe('ongoing')
  })
})

describe('tripDurationDays', () => {
  it('inclusive count: 10th–15th = 6 days', () => {
    expect(tripDurationDays('2026-10-10', '2026-10-15', '2026-10-01')).toBe(6)
  })

  it('ongoing open-ended: start..today', () => {
    expect(tripDurationDays('2026-09-01', null, '2026-09-06')).toBe(6)
  })

  it('ongoing with end: capped at end even if today is later', () => {
    // today 2026-10-01 is inside the trip: duration start..min(end,…)=end? No —
    // ongoing means today ≤ end, so duration = start..end (the planned length).
    expect(tripDurationDays('2026-09-25', '2026-10-05', '2026-10-01')).toBe(11)
  })

  it('past trip: full planned range regardless of today', () => {
    expect(tripDurationDays('2026-08-28', '2026-09-02', '2026-09-20')).toBe(6)
  })

  it('planned trip: full range; same-day trip = 1', () => {
    expect(tripDurationDays('2026-11-01', '2026-11-10', '2026-09-06')).toBe(10)
    expect(tripDurationDays('2026-11-01', null, '2026-09-06')).toBe(1)
  })
})

describe('countdowns', () => {
  it('daysUntilStart — null on/after the start day (it is ongoing then)', () => {
    expect(daysUntilStart('2026-10-10', '2026-10-01')).toBe(9)
    expect(daysUntilStart('2026-10-01', '2026-10-01')).toBeNull()
    expect(daysUntilStart('2026-09-01', '2026-10-01')).toBeNull()
  })

  it('daysLeftInTrip (inclusive of today)', () => {
    expect(daysLeftInTrip('2026-10-15', '2026-10-10')).toBe(6)
    expect(daysLeftInTrip(null, '2026-10-10')).toBeNull()
    expect(daysLeftInTrip('2026-10-01', '2026-10-10')).toBeNull() // already past
  })
})

describe('tripDaySeries', () => {
  const t = (date: string, amountPaise: number, direction = 'out') => ({ date, amountPaise, direction })

  it('zero-fills inside the window, excludes out-of-window txns', () => {
    const s = tripDaySeries(
      [t('2026-10-11', 500), t('2026-10-13', 1_200), t('2026-10-09', 9_999), t('2026-10-16', 9_999), t('2026-10-13', 300, 'in')],
      '2026-10-10',
      '2026-10-15',
      '2026-10-12',
    )
    // today (12th) caps the window; 13–15 never invented
    expect(s.map((p) => p.iso)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12'])
    expect(s.map((p) => p.outPaise)).toEqual([0, 500, 0])
  })

  it('past trip: full window even after today', () => {
    const s = tripDaySeries([t('2026-08-29', 700)], '2026-08-28', '2026-08-30', '2026-09-20')
    expect(s.map((p) => p.iso)).toEqual(['2026-08-28', '2026-08-29', '2026-08-30'])
    expect(s.map((p) => p.outPaise)).toEqual([0, 700, 0])
  })

  it('aggregates same-day transactions', () => {
    const s = tripDaySeries([t('2026-10-10', 100), t('2026-10-10', 200)], '2026-10-10', null, '2026-10-10')
    expect(s).toEqual([{ iso: '2026-10-10', outPaise: 300 }])
  })

  it('planned trip → empty series', () => {
    expect(tripDaySeries([t('2026-11-01', 100)], '2026-11-01', '2026-11-05', '2026-10-01')).toEqual([])
  })

  it('open-ended ongoing trip runs start..today', () => {
    const s = tripDaySeries([], '2026-09-01', null, '2026-09-06')
    expect(s).toHaveLength(6)
    expect(s[5].iso).toBe('2026-09-06')
  })

  it('leap-day window is continuous', () => {
    const s = tripDaySeries([], '2028-02-28', '2028-03-01', '2028-03-15')
    expect(s.map((p) => p.iso)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
  })
})

describe('tripTotalSpendPaise + tripPeakDay', () => {
  it('totals all outflow regardless of window', () => {
    const txns = [{ amountPaise: 100, direction: 'out' }, { amountPaise: 50, direction: 'in' }, { amountPaise: 200, direction: 'out' }]
    expect(tripTotalSpendPaise(txns)).toBe(300)
  })

  it('peak day picks the max out day, null when nothing spent', () => {
    const series = tripDaySeries(
      [{ date: '2026-10-11', amountPaise: 500, direction: 'out' }, { date: '2026-10-12', amountPaise: 1_500, direction: 'out' }],
      '2026-10-10',
      '2026-10-12',
      '2026-10-12',
    )
    expect(tripPeakDay(series)).toBe('2026-10-12')
    expect(tripPeakDay([{ iso: '2026-10-10', outPaise: 0 }])).toBeNull()
    expect(tripPeakDay([])).toBeNull()
  })
})

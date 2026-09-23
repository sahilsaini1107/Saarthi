// Phase F — pure report-engine math: windows, deltas, buckets, series fill.
import { describe, expect, it } from 'vitest'
import {
  barPct,
  buildDailySeries,
  buildSeries,
  buildWeeklySeries,
  chooseBucket,
  daysInclusive,
  deltaPct,
  isReportDomain,
  isValidISODate,
  isValidMonthKey,
  monthWindow,
  pctPart,
  REPORT_DOMAINS,
  round2,
  seriesMax,
  seriesTotal,
  shiftWindowBack,
  windowLabel,
} from '@/lib/reports'

describe('window validation', () => {
  it('isValidISODate accepts real dates only', () => {
    expect(isValidISODate('2026-09-20')).toBe(true)
    expect(isValidISODate('2024-02-29')).toBe(true) // leap year
    expect(isValidISODate('2026-02-29')).toBe(false) // non-leap
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2026-13-01')).toBe(false)
    expect(isValidISODate('2026-00-10')).toBe(false)
    expect(isValidISODate('2026-9-3')).toBe(false) // strict 2-digit
    expect(isValidISODate('20-09-2026')).toBe(false)
    expect(isValidISODate('')).toBe(false)
  })

  it('isValidMonthKey accepts YYYY-MM between 01 and 12', () => {
    expect(isValidMonthKey('2026-09')).toBe(true)
    expect(isValidMonthKey('2026-00')).toBe(false)
    expect(isValidMonthKey('2026-13')).toBe(false)
    expect(isValidMonthKey('2026-9')).toBe(false)
    expect(isValidMonthKey('September')).toBe(false)
  })

  it('monthWindow covers every day including leap February', () => {
    expect(monthWindow('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(monthWindow('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthWindow('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthWindow('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

describe('window lengths and shifts', () => {
  it('daysInclusive counts both ends', () => {
    expect(daysInclusive('2026-09-01', '2026-09-01')).toBe(1)
    expect(daysInclusive('2026-09-01', '2026-09-30')).toBe(30)
    expect(daysInclusive('2026-09-20', '2026-09-19')).toBe(0) // inverted
  })

  it('shiftWindowBack lands exactly before the window, across month bounds', () => {
    expect(shiftWindowBack('2026-09-01', '2026-09-30')).toEqual({ from: '2026-08-02', to: '2026-08-31' })
    expect(shiftWindowBack('2026-03-01', '2026-03-31')).toEqual({ from: '2026-01-29', to: '2026-02-28' })
    // leap-day handling: window after Feb 2024 shifts across Feb 29 cleanly
    expect(shiftWindowBack('2024-03-01', '2024-03-31')).toEqual({ from: '2024-01-30', to: '2024-02-29' })
    expect(shiftWindowBack('2026-09-10', '2026-09-12')).toEqual({ from: '2026-09-07', to: '2026-09-09' })
  })
})

describe('number math', () => {
  it('round2 is 2-decimal half-up', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
    expect(round2(-1.005)).toBe(-1.01)
    expect(round2(10)).toBe(10)
  })

  it('deltaPct: null without a fair baseline, 2dp otherwise', () => {
    expect(deltaPct(120, 100)).toBe(20)
    expect(deltaPct(90, 100)).toBe(-10)
    expect(deltaPct(100, 0)).toBeNull() // no baseline
    expect(deltaPct(100, -5)).toBeNull()
    expect(deltaPct(50, 40)).toBe(25)
    expect(deltaPct(1, 3)).toBe(-66.67)
  })

  it('pctPart: share of a whole, null when whole is 0', () => {
    expect(pctPart(1, 4)).toBe(25)
    expect(pctPart(0, 0)).toBeNull()
    expect(pctPart(3, 0)).toBeNull()
    expect(pctPart(2, 3)).toBe(66.67)
  })
})

describe('bucketing', () => {
  it('chooseBucket: day for ≤31 days, week beyond', () => {
    expect(chooseBucket('2026-09-01', '2026-09-30')).toBe('day')
    expect(chooseBucket('2026-09-01', '2026-09-01')).toBe('day')
    expect(chooseBucket('2026-07-01', '2026-09-30')).toBe('week')
    expect(chooseBucket('2026-01-01', '2026-12-31')).toBe('week')
  })
})

describe('daily series', () => {
  it('fills missing days with zero and clips the future', () => {
    const daily = new Map([
      ['2026-09-01', 10],
      ['2026-09-03', 30],
    ])
    expect(buildDailySeries(daily, '2026-09-01', '2026-09-05')).toEqual([
      { label: '2026-09-01', value: 10 },
      { label: '2026-09-02', value: 0 },
      { label: '2026-09-03', value: 30 },
      { label: '2026-09-04', value: 0 },
      { label: '2026-09-05', value: 0 },
    ])
    // today clips future empty bars (mid-month report)
    expect(buildDailySeries(daily, '2026-09-01', '2026-09-30', '2026-09-03')).toHaveLength(3)
  })

  it('returns empty for an inverted window', () => {
    expect(buildDailySeries(new Map(), '2026-09-10', '2026-09-01')).toEqual([])
  })
})

describe('weekly series', () => {
  it('chunks 7-day weeks from the window start, short last week included', () => {
    const daily = new Map([
      ['2026-09-01', 1],
      ['2026-09-07', 2], // inside week 1 (Sep 1..7)
      ['2026-09-08', 4], // week 2
      ['2026-09-12', 8], // week 2
    ])
    const weeks = buildWeeklySeries(daily, '2026-09-01', '2026-09-12')
    expect(weeks).toEqual([
      { label: '2026-09-01', value: 3 },
      { label: '2026-09-08', value: 12 },
    ])
  })

  it('a 30-day window makes 5 chunks with the last one 2 days long', () => {
    const weeks = buildWeeklySeries(new Map([['2026-09-29', 5]]), '2026-09-01', '2026-09-30')
    expect(weeks).toHaveLength(5)
    expect(weeks[4]).toEqual({ label: '2026-09-29', value: 5 })
    expect(weeks[0].value).toBe(0)
  })
})

describe('buildSeries dispatch', () => {
  it('picks day buckets ≤31d and week buckets above, with labels attached', () => {
    const daily = new Map([['2026-09-02', 7]])
    const day = buildSeries(daily, '2026-09-01', '2026-09-30', 'Minutes', 'minutes')
    expect(day.bucket).toBe('day')
    expect(day.label).toBe('Minutes')
    expect(day.unit).toBe('minutes')
    expect(day.points.find((p) => p.label === '2026-09-02')?.value).toBe(7)

    const week = buildSeries(daily, '2026-07-01', '2026-09-30', 'Minutes', 'minutes')
    expect(week.bucket).toBe('week')
    expect(week.points.length).toBeGreaterThan(10)
  })
})

describe('series aggregates', () => {
  it('seriesTotal and seriesMax', () => {
    const pts = [
      { label: '2026-09-01', value: 4 },
      { label: '2026-09-02', value: 9 },
      { label: '2026-09-03', value: 0 },
    ]
    expect(seriesTotal(pts)).toBe(13)
    expect(seriesMax(pts)).toBe(9)
    expect(seriesTotal([])).toBe(0)
    expect(seriesMax([])).toBe(0)
  })

  it('barPct clamps and guards zero max', () => {
    expect(barPct(5, 10)).toBe(50)
    expect(barPct(15, 10)).toBe(100)
    expect(barPct(-1, 10)).toBe(0)
    expect(barPct(5, 0)).toBe(0)
  })
})

describe('labels and domain meta', () => {
  it('windowLabel renders same-month and cross-month windows', () => {
    expect(windowLabel('2026-09-01', '2026-09-30')).toBe('1 – 30 Sep')
    expect(windowLabel('2026-08-25', '2026-09-03')).toBe('25 Aug – 3 Sep')
  })

  it('all 13 domains registered, key check works', () => {
    expect(REPORT_DOMAINS).toHaveLength(13)
    expect(isReportDomain('money')).toBe(true)
    expect(isReportDomain('fuel')).toBe(true)
    expect(isReportDomain('life')).toBe(false) // Life Report is its own endpoint
    expect(isReportDomain('nonsense')).toBe(false)
  })
})

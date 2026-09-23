import { describe, expect, it } from 'vitest'
import {
  bestStreak,
  buildGrid,
  contributionWindow,
  countToMilli,
  currentStreak,
  dailyBenchmarkMilli,
  formatMilliAmount,
  formatMilliCount,
  formatMilliMoney,
  gridLevels,
  levelForAmount,
  levelForTasks,
  neededPerDayMilli,
  paceInfo,
  projectedFinish,
  quartilesOfNonzero,
  rupeesToMilli,
  type ContributionDayInput,
} from '@/lib/goals-grid'

const day = (iso: string, amountMilli = 0, tasksDone = 0): ContributionDayInput => ({ iso, amountMilli, tasksDone })

/* ---------- conversions ---------- */

describe('milli conversions', () => {
  it('rupees → milli is 2-decimal exact (float-artifact safe)', () => {
    expect(rupeesToMilli(123.45)).toBe(123450)
    expect(rupeesToMilli(0.01)).toBe(10)
    expect(rupeesToMilli(100000)).toBe(100000000) // ₹1L
    expect(rupeesToMilli(2.675)).toBe(2675) // the classic float trap
  })
  it('count → milli keeps 3 decimals', () => {
    expect(countToMilli(12.5)).toBe(12500)
    expect(countToMilli(1)).toBe(1000)
    expect(countToMilli(0.001)).toBe(1)
  })
  it('money formatting shows Indian grouping with 2 decimals', () => {
    expect(formatMilliMoney(123450)).toBe('₹123.45')
    expect(formatMilliMoney(100000000)).toBe('₹1,00,000.00')
  })
  it('count formatting trims trailing zeros', () => {
    expect(formatMilliCount(12500)).toBe('12.5')
    expect(formatMilliCount(1000)).toBe('1')
    expect(formatMilliCount(1250)).toBe('1.25')
  })
  it('formatMilliAmount appends the unit label for counts only', () => {
    expect(formatMilliAmount('money', null, 274000)).toBe('₹274.00')
    expect(formatMilliAmount('count', 'km', 12500)).toBe('12.5 km')
    expect(formatMilliAmount('count', null, 1000)).toBe('1')
  })
})

/* ---------- window ---------- */

describe('contributionWindow', () => {
  it('starts at the first contribution and ends at the later of target/today', () => {
    expect(contributionWindow('2026-01-10', '2026-12-31', '2026-09-12')).toEqual({ start: '2026-01-10', end: '2026-12-31' })
    expect(contributionWindow('2026-01-10', null, '2026-09-12')).toEqual({ start: '2026-01-10', end: '2026-09-12' })
  })
  it('no contributions yet → window runs from today to the future target (the commitment is visible)', () => {
    expect(contributionWindow(null, '2027-09-12', '2026-09-12')).toEqual({ start: '2026-09-12', end: '2027-09-12' })
  })
  it('past targetDate still shows late contributions up to today', () => {
    expect(contributionWindow('2026-01-10', '2026-03-01', '2026-09-12')).toEqual({ start: '2026-01-10', end: '2026-09-12' })
  })
  it('caps at the last 400 days', () => {
    const w = contributionWindow('2020-01-01', null, '2026-09-12')!
    expect(w.end).toBe('2026-09-12')
    // 400-day window inclusive of both ends
    const days = (Date.parse(`${w.end}T00:00:00Z`) - Date.parse(`${w.start}T00:00:00Z`)) / 86_400_000 + 1
    expect(days).toBe(400)
  })
  it('maxDays param lifts the cap for the untruncated pace window', () => {
    const w = contributionWindow('2020-01-01', '2027-09-12', '2026-09-12', 100_000)!
    expect(w.start).toBe('2020-01-01')
    expect(w.end).toBe('2027-09-12')
  })
})

/* ---------- benchmark & levels ---------- */

describe('dailyBenchmarkMilli', () => {
  it('divides the target across inclusive window days', () => {
    const w = { start: '2026-09-12', end: '2027-09-12' } // 366 days (2027 not leap between? 2026-09-12→2027-09-12 = 365 diff, +1)
    const b = dailyBenchmarkMilli(100000000, w)!
    expect(b).toBeCloseTo(100000000 / 366, 6)
  })
  it('null without a positive target', () => {
    expect(dailyBenchmarkMilli(null, { start: '2026-01-01', end: '2026-01-31' })).toBeNull()
    expect(dailyBenchmarkMilli(0, { start: '2026-01-01', end: '2026-01-31' })).toBeNull()
  })
})

describe('levelForAmount', () => {
  const bench = 1000 // milli/day
  it('empty stays empty', () => {
    expect(levelForAmount(0, bench, null)).toBe(0)
  })
  it('target-relative thresholds at 0.5 / 1 / 2 (exact boundaries)', () => {
    expect(levelForAmount(499, bench, null)).toBe(1)
    expect(levelForAmount(500, bench, null)).toBe(2)
    expect(levelForAmount(999, bench, null)).toBe(2)
    expect(levelForAmount(1000, bench, null)).toBe(3)
    expect(levelForAmount(1999, bench, null)).toBe(3)
    expect(levelForAmount(2000, bench, null)).toBe(4)
  })
  it('quartile fallback when no target', () => {
    const q: [number, number, number] = [100, 200, 300]
    expect(levelForAmount(50, null, q)).toBe(1)
    expect(levelForAmount(100, null, q)).toBe(2)
    expect(levelForAmount(250, null, q)).toBe(3)
    expect(levelForAmount(300, null, q)).toBe(4)
  })
  it('no yardstick at all → honest middle level', () => {
    expect(levelForAmount(1, null, null)).toBe(2)
  })
})

describe('quartilesOfNonzero', () => {
  it('null under 4 nonzero days', () => {
    expect(quartilesOfNonzero([day('2026-01-01', 500), day('2026-01-02', 300)])).toBeNull()
  })
  it('nearest-rank quartiles over sorted nonzero values', () => {
    const days = [400, 100, 300, 200, 500].map((a, i) => day(`2026-01-0${i + 1}`, a))
    expect(quartilesOfNonzero(days)).toEqual([200, 300, 400])
  })
})

describe('gridLevels', () => {
  it('metric-less goals grade by task completions', () => {
    const days = [day('2026-01-01', 0, 1), day('2026-01-02', 0, 2), day('2026-01-03', 0, 5), day('2026-01-04')]
    expect(gridLevels(days, { hasMetric: false, benchmark: null })).toEqual([2, 3, 4, 0])
  })
  it('metric goals use the benchmark; fall back to quartiles without one', () => {
    const days = [day('2026-01-01', 500), day('2026-01-02', 1000), day('2026-01-03', 2500)]
    expect(gridLevels(days, { hasMetric: true, benchmark: 1000 })).toEqual([2, 3, 4])
    // no target, only 3 nonzero days → flat middle level
    expect(gridLevels(days, { hasMetric: true, benchmark: null })).toEqual([2, 2, 2])
  })
})

describe('levelForTasks', () => {
  it('never grants L1 — no half credit for tasks', () => {
    expect(levelForTasks(0)).toBe(0)
    expect(levelForTasks(1)).toBe(2)
    expect(levelForTasks(2)).toBe(3)
    expect(levelForTasks(9)).toBe(4)
  })
})

/* ---------- streaks ---------- */

describe('streaks', () => {
  it('current streak counts back from today', () => {
    const days = [day('2026-09-10', 100), day('2026-09-11', 100), day('2026-09-12', 100)]
    expect(currentStreak(days, '2026-09-12')).toBe(3)
  })
  it('un-logged today does not break the streak (grace)', () => {
    const days = [day('2026-09-10', 100), day('2026-09-11', 100)]
    expect(currentStreak(days, '2026-09-12')).toBe(2)
  })
  it('a gap breaks the run', () => {
    const days = [day('2026-09-09', 100), day('2026-09-11', 100), day('2026-09-12', 100)]
    expect(currentStreak(days, '2026-09-12')).toBe(2)
  })
  it('zero-amount days never count', () => {
    expect(currentStreak([day('2026-09-11', 0), day('2026-09-12', 0)], '2026-09-12')).toBe(0)
  })
  it('best streak finds the longest historical run', () => {
    const days = [
      day('2026-01-01', 100), day('2026-01-02', 100), day('2026-01-03', 100),
      day('2026-01-05', 100), day('2026-01-06', 100),
    ]
    expect(bestStreak(days)).toBe(3)
  })
  it('best streak requires strict calendar adjacency (leap-safe)', () => {
    const days = [day('2024-02-28', 100), day('2024-02-29', 100), day('2024-03-01', 100), day('2024-03-03', 100)]
    expect(bestStreak(days)).toBe(3)
  })
})

/* ---------- pace ---------- */

describe('paceInfo', () => {
  const start = '2026-01-01'
  const target = '2026-12-31'
  it('needs a target', () => {
    expect(paceInfo({ totalMilli: 500, targetValueMilli: null, windowStart: start, targetDate: target, today: '2026-07-01' })).toBeNull()
  })
  it('on_track inside ±10pp', () => {
    // 181/365 elapsed ≈ 49.59% expected; 50% actual → delta +0.41pp
    const p = paceInfo({ totalMilli: 500000, targetValueMilli: 1000000, windowStart: start, targetDate: target, today: '2026-06-30' })!
    expect(p.band).toBe('on_track')
  })
  it('ahead at exactly +10pp', () => {
    // window 100 days, elapsed 50 → expected 50%; actual 60%
    const p = paceInfo({ totalMilli: 600, targetValueMilli: 1000, windowStart: '2026-01-01', targetDate: '2026-04-10', today: '2026-02-19' })!
    // 2026-01-01→2026-04-10 = 99 diff → 100 window days; elapsed 2026-01-01→2026-02-19 = 49 diff → 50 days
    expect(p.expectedPct).toBeCloseTo(50, 4)
    expect(p.actualPct).toBe(60)
    expect(p.band).toBe('ahead')
  })
  it('behind at exactly −10pp, at_risk at −25pp', () => {
    const behind = paceInfo({ totalMilli: 400, targetValueMilli: 1000, windowStart: '2026-01-01', targetDate: '2026-04-10', today: '2026-02-19' })!
    expect(behind.deltaPp).toBe(-10)
    expect(behind.band).toBe('behind')
    const risk = paceInfo({ totalMilli: 300, targetValueMilli: 1000, windowStart: '2026-01-01', targetDate: '2026-04-10', today: '2026-02-19' })!
    expect(risk.deltaPp).toBe(-20) // not yet −25
    expect(risk.band).toBe('behind')
    const risk2 = paceInfo({ totalMilli: 250, targetValueMilli: 1000, windowStart: '2026-01-01', targetDate: '2026-04-10', today: '2026-02-19' })!
    expect(risk2.deltaPp).toBe(-25)
    expect(risk2.band).toBe('at_risk')
  })
  it('past the deadline with target unmet is always at_risk', () => {
    const p = paceInfo({ totalMilli: 900, targetValueMilli: 1000, windowStart: '2026-01-01', targetDate: '2026-02-01', today: '2026-03-01' })!
    expect(p.band).toBe('at_risk')
  })
  it('hitting target past the deadline reads on_track', () => {
    const p = paceInfo({ totalMilli: 1000, targetValueMilli: 1000, windowStart: '2026-01-01', targetDate: '2026-02-01', today: '2026-03-01' })!
    expect(p.band).toBe('on_track')
  })
  it('no deadline → actual only', () => {
    const p = paceInfo({ totalMilli: 250, targetValueMilli: 1000, windowStart: start, targetDate: null, today: '2026-07-01' })!
    expect(p.actualPct).toBe(25)
    expect(p.expectedPct).toBeNull()
    expect(p.band).toBeNull()
  })
})

describe('neededPerDayMilli', () => {
  it('spreads the remaining target over remaining days (ceil)', () => {
    // ₹1L target, ₹10k done, 365 days left (2026-09-12 → 2027-09-12) → ceil(90000000/365)
    expect(neededPerDayMilli(100000000, 10000000, '2027-09-12', '2026-09-12')).toBe(Math.ceil(90000000 / 365))
  })
  it('zero once the target is met', () => {
    expect(neededPerDayMilli(1000, 1000, '2027-01-01', '2026-09-12')).toBe(0)
  })
  it('everything left when the deadline is today/past', () => {
    expect(neededPerDayMilli(1000, 400, '2026-09-12', '2026-09-12')).toBe(600)
    expect(neededPerDayMilli(1000, 400, '2026-01-01', '2026-09-12')).toBe(600)
  })
  it('null without a target', () => {
    expect(neededPerDayMilli(null, 400, '2027-01-01', '2026-09-12')).toBeNull()
  })
})

describe('projectedFinish', () => {
  it('extrapolates observed pace', () => {
    // 300 done in 30 days (window started 2026-08-13, today 2026-09-12 = 31 elapsed incl. today)
    // rate 300/31 → days needed 1000/ (300/31) = 103.33 → 104 days from start − 1
    const p = projectedFinish(300, 1000, '2026-08-13', '2026-09-12')!
    const elapsed = (Date.parse(`${p}T00:00:00Z`) - Date.parse('2026-08-13T00:00:00Z')) / 86_400_000 + 1
    expect(elapsed).toBe(Math.ceil(1000 / (300 / 31)))
  })
  it('null without data or target', () => {
    expect(projectedFinish(0, 1000, '2026-08-13', '2026-09-12')).toBeNull()
    expect(projectedFinish(300, null, '2026-08-13', '2026-09-12')).toBeNull()
  })
})

/* ---------- grid layout ---------- */

describe('buildGrid', () => {
  it('pads to Monday and anchors month labels', () => {
    // 2026-09-12 is a Saturday → pad 5 (Mon..Fri)
    const g = buildGrid({ start: '2026-09-12', end: '2026-10-12' }, '2026-09-12')
    expect(g.pad).toBe(5)
    expect(g.cells[0].iso).toBe('2026-09-12')
    expect(g.cells[0].monthStart).toBe(true)
    expect(g.cells[g.cells.length - 1].iso).toBe('2026-10-12')
    // two month labels: Sep anchors the first column region, Oct starts at its day
    expect(g.labels.map((l) => l.label)).toEqual(['Sep', 'Oct'])
    expect(g.labels[0].span).toBeGreaterThanOrEqual(1)
    expect(g.labels[1].span).toBeGreaterThanOrEqual(1)
  })
  it('marks future days for ghost rendering', () => {
    const g = buildGrid({ start: '2026-09-11', end: '2026-09-14' }, '2026-09-12')
    expect(g.cells.map((c) => c.future)).toEqual([false, false, true, true])
  })
  it('single-day window has one label and correct pad', () => {
    const g = buildGrid({ start: '2026-09-07', end: '2026-09-07' }, '2026-09-07') // a Monday
    expect(g.pad).toBe(0)
    expect(g.cells).toHaveLength(1)
    expect(g.labels).toEqual([{ label: 'Sep', span: 1 }])
  })
})

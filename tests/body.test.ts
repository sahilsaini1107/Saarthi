import { describe, expect, it } from 'vitest'
import {
  ageFromBirthYear,
  bmiBand,
  bmiMilli,
  bodyFatBand,
  bodyWaterBand,
  fatMassG,
  formatMetricDisplay,
  formatMilli,
  idealWeightG,
  leanMassG,
  metricBand,
  mifflinStJeorBMR,
  movingAverage,
  visceralFatBand,
  weekWorkoutStats,
  weightTrend,
} from '@/lib/body'

// Hand-traced body-metric scenarios. Values are integer milli-units
// (Decision #21): 72.5 kg = 72500.

describe('formatMilli', () => {
  it('prints ≤3 decimals without trailing zeros', () => {
    expect(formatMilli(72500)).toBe('72.5')
    expect(formatMilli(81200)).toBe('81.2')
    expect(formatMilli(70000)).toBe('70')
    expect(formatMilli(72555)).toBe('72.555')
    expect(formatMilli(1)).toBe('0.001')
  })
})

describe('movingAverage', () => {
  it('trailing window over calendar points', () => {
    const pts = [
      { iso: '2026-09-01', valueMilli: 10000 },
      { iso: '2026-09-02', valueMilli: 20000 },
      { iso: '2026-09-03', valueMilli: 30000 },
    ]
    expect(movingAverage(pts, 2)).toEqual([
      { iso: '2026-09-01', valueMilli: 10000 }, // 10
      { iso: '2026-09-02', valueMilli: 15000 }, // (10+20)/2
      { iso: '2026-09-03', valueMilli: 25000 }, // (20+30)/2
    ])
  })
  it('window larger than the series averages everything so far', () => {
    const pts = [
      { iso: '2026-09-01', valueMilli: 10000 },
      { iso: '2026-09-02', valueMilli: 30000 },
    ]
    expect(movingAverage(pts, 7)[1].valueMilli).toBe(20000)
  })
})

describe('weightTrend', () => {
  // series: Aug 1 → 70.0, Aug 15 → 71.0, Sep 1 → 71.5, Sep 5 → 72.0
  const series = [
    { iso: '2026-08-01', valueMilli: 70000 },
    { iso: '2026-08-15', valueMilli: 71000 },
    { iso: '2026-09-01', valueMilli: 71500 },
    { iso: '2026-09-05', valueMilli: 72000 },
  ]

  it('latest, min and max', () => {
    const t = weightTrend(series)
    expect(t.latest).toEqual({ iso: '2026-09-05', valueMilli: 72000 })
    expect(t.minMilli).toBe(70000)
    expect(t.maxMilli).toBe(72000)
  })
  it('7-day delta falls back to the newest point on/before the cutoff (no gaps padded)', () => {
    const t = weightTrend(series)
    // cutoff = Sep 5 − 7 = Aug 29 → newest ≤ cutoff is Aug 15 (71.0)
    expect(t.delta7dMilli).toBe(1000)
    // cutoff = Aug 6 → Aug 1 (70.0)
    expect(t.delta30dMilli).toBe(2000)
  })
  it('delta needs history — a lone point has none', () => {
    const t = weightTrend([{ iso: '2026-09-05', valueMilli: 72000 }])
    expect(t.delta7dMilli).toBeNull()
    expect(t.delta30dMilli).toBeNull()
  })
  it('empty series stays null-safe', () => {
    expect(weightTrend([]).latest).toBeNull()
    expect(weightTrend([]).avg7).toEqual([])
  })
})

describe('weekWorkoutStats', () => {
  // Week starting Mon 2026-08-31, [start, start+7) — half-open window.
  const workouts = [
    { date: '2026-08-30', minutes: 60, type: 'strength' }, // before window
    { date: '2026-08-31', minutes: 30, type: 'strength' }, // start day counts
    { date: '2026-09-05', minutes: 45, type: 'cardio' },
    { date: '2026-09-06', minutes: 30, type: 'walk' },
    { date: '2026-09-07', minutes: 20, type: 'hiit' }, // start+7 → excluded
  ]

  it('totals minutes, count and by-type split within the week', () => {
    expect(weekWorkoutStats(workouts, '2026-08-31')).toEqual({
      minutes: 105,
      count: 3,
      byType: { strength: 30, cardio: 45, walk: 30 },
    })
  })
  it('empty week is zeroed', () => {
    expect(weekWorkoutStats([], '2026-08-31').minutes).toBe(0)
  })
})

/* ---------- Phase 22 — body composition ---------- */

describe('ageFromBirthYear', () => {
  it('derives age from the current year', () => {
    expect(ageFromBirthYear(2001, '2026-09-23')).toBe(25)
  })

  it('returns null for missing or absurd input', () => {
    expect(ageFromBirthYear(null, '2026-09-23')).toBeNull()
    expect(ageFromBirthYear(2030, '2026-09-23')).toBeNull() // not born yet
    expect(ageFromBirthYear(1800, '2026-09-23')).toBeNull()
  })
})

describe('bmiMilli', () => {
  it('computes BMI from weight and height', () => {
    // 62.7 kg at 178.0 cm → 19.79
    expect(bmiMilli(62_700, 178_000)).toBe(19_789)
  })

  it('returns null when either input is missing', () => {
    expect(bmiMilli(null, 178_000)).toBeNull()
    expect(bmiMilli(62_700, null)).toBeNull()
    expect(bmiMilli(62_700, 0)).toBeNull()
  })
})

describe('leanMassG / fatMassG', () => {
  it('splits weight by body-fat percent', () => {
    // 70 kg at 20 % body fat → 56 kg lean, 14 kg fat
    expect(leanMassG(70_000, 20_000)).toBe(56_000)
    expect(fatMassG(70_000, 20_000)).toBe(14_000)
  })

  it('handles a 0 % reading as all-lean rather than as missing data', () => {
    expect(leanMassG(70_000, 0)).toBe(70_000)
  })

  it('returns null for missing body fat or impossible percentages', () => {
    expect(leanMassG(70_000, null)).toBeNull()
    expect(leanMassG(70_000, 100_000)).toBeNull()
    expect(leanMassG(null, 20_000)).toBeNull()
  })
})

describe('mifflinStJeorBMR', () => {
  it('matches hand maths for a male', () => {
    // 10×70 + 6.25×178 − 5×25 + 5 = 700 + 1112.5 − 125 + 5 = 1692.5 → 1693
    expect(mifflinStJeorBMR(70_000, 178_000, 25, 'male')).toBe(1693)
  })

  it('matches hand maths for a female', () => {
    // 10×60 + 6.25×165 − 5×30 − 161 = 600 + 1031.25 − 150 − 161 = 1320.25 → 1320
    expect(mifflinStJeorBMR(60_000, 165_000, 30, 'female')).toBe(1320)
  })

  it('refuses rather than guessing when sex is unknown or other', () => {
    expect(mifflinStJeorBMR(70_000, 178_000, 25, 'other')).toBeNull()
    expect(mifflinStJeorBMR(70_000, 178_000, 25, null)).toBeNull()
  })

  it('returns null when any measurement is missing', () => {
    expect(mifflinStJeorBMR(null, 178_000, 25, 'male')).toBeNull()
    expect(mifflinStJeorBMR(70_000, null, 25, 'male')).toBeNull()
    expect(mifflinStJeorBMR(70_000, 178_000, null, 'male')).toBeNull()
  })
})

describe('idealWeightG — BMI 22 midpoint', () => {
  it('scales with height', () => {
    // 22 × 1.78² = 69.70 kg
    expect(idealWeightG(178_000)).toBe(69_705)
    expect(idealWeightG(160_000)).toBe(56_320)
  })

  it('returns null without a height', () => {
    expect(idealWeightG(null)).toBeNull()
  })
})

describe('health bands', () => {
  it('bands BMI on the WHO cut-offs', () => {
    expect(bmiBand(18_400)?.level).toBe('low')
    expect(bmiBand(18_500)?.level).toBe('healthy')
    expect(bmiBand(24_900)?.level).toBe('healthy')
    expect(bmiBand(25_000)?.level).toBe('elevated')
    expect(bmiBand(30_000)?.level).toBe('high')
    expect(bmiBand(null)).toBeNull()
  })

  it('bands body fat differently by sex', () => {
    expect(bodyFatBand(15_000, 'male')?.label).toBe('fitness')
    expect(bodyFatBand(15_000, 'female')?.label).toBe('athletic')
  })

  it('will not band body fat without a sex to band against', () => {
    expect(bodyFatBand(15_000, 'other')).toBeNull()
    expect(bodyFatBand(15_000, null)).toBeNull()
  })

  it('bands visceral fat on the standard scale thresholds', () => {
    expect(visceralFatBand(9_000)?.level).toBe('healthy')
    expect(visceralFatBand(10_000)?.level).toBe('elevated')
    expect(visceralFatBand(15_000)?.level).toBe('high')
  })

  it('bands body water within sex-typical ranges', () => {
    expect(bodyWaterBand(55_000, 'male')?.level).toBe('healthy')
    expect(bodyWaterBand(40_000, 'male')?.level).toBe('low')
    expect(bodyWaterBand(55_000, 'female')?.level).toBe('healthy')
  })

  it('routes a kind to its band, and returns null where no reference exists', () => {
    expect(metricBand('bmi', 22_000, 'male')?.level).toBe('healthy')
    expect(metricBand('body_fat', 12_000, 'male')?.level).toBe('optimal')
    // a vendor "body score" has no defensible reference — better nothing than a guess
    expect(metricBand('body_score', 73_000, 'male')).toBeNull()
    expect(metricBand('muscle_mass', 50_000, 'male')).toBeNull()
  })
})

describe('formatMetricDisplay — panel rounding, not storage precision', () => {
  it('shows one decimal for measured units', () => {
    expect(formatMetricDisplay(19_808, '')).toBe('19.8')
    expect(formatMetricDisplay(69_705, 'kg')).toBe('69.7')
    expect(formatMetricDisplay(9_820, '%')).toBe('9.8')
  })

  it('drops a trailing .0 rather than printing "70.0"', () => {
    expect(formatMetricDisplay(70_000, 'kg')).toBe('70')
  })

  it('shows whole numbers for counts', () => {
    expect(formatMetricDisplay(1_592_000, 'kcal')).toBe('1592')
    expect(formatMetricDisplay(25_000, 'yrs')).toBe('25')
    expect(formatMetricDisplay(73_000, 'pts')).toBe('73')
  })
})

// Phase 5.1 — budget pace math.
import { describe, expect, it } from 'vitest'
import {
  bandFor,
  daysLeftInMonth,
  monthElapsedFraction,
  onTrackRatio,
  projectedMonthEndPaise,
  safeDailySpendPaise,
} from '@/lib/budgets'

describe('monthElapsedFraction', () => {
  it('day 1 of 30 = 1/30, last day = 1', () => {
    expect(monthElapsedFraction(1, 30)).toBeCloseTo(1 / 30, 12)
    expect(monthElapsedFraction(30, 30)).toBe(1)
  })

  it('leap February has 29 fractions, non-leap 28', () => {
    expect(monthElapsedFraction(29, 29)).toBe(1) // Feb 2028 (leap)
    expect(monthElapsedFraction(28, 28)).toBe(1) // Feb 2027
    expect(monthElapsedFraction(28, 29)).toBeCloseTo(28 / 29, 12)
  })

  it('clamps out-of-range days', () => {
    expect(monthElapsedFraction(0, 31)).toBe(0)
    expect(monthElapsedFraction(-5, 31)).toBe(0)
    expect(monthElapsedFraction(45, 31)).toBe(1)
  })
})

describe('bandFor — exact boundaries', () => {
  const f = 0.5 // half the month gone → expected 50%

  it('over strictly above 100% of budget', () => {
    // exactly 100% spent is not OVER — but at mid-month it is 50pp ahead → watch
    expect(bandFor(10_000, 10_000, f)).toBe('watch')
    expect(bandFor(10_001, 10_000, f)).toBe('over')
    // on the LAST day, 100% spent is exactly on budget
    expect(bandFor(10_000, 10_000, 1)).toBe('on_track')
  })

  it('watch at exactly 10pp ahead of calendar', () => {
    // 60% spent vs 50% expected = +10pp → watch
    expect(bandFor(6_000, 10_000, f)).toBe('watch')
    // 59.99% spent → on_track
    expect(bandFor(5_999, 10_000, f)).toBe('on_track')
  })

  it('on_track when at or behind pace', () => {
    expect(bandFor(5_000, 10_000, f)).toBe('on_track')
    expect(bandFor(0, 10_000, f)).toBe('on_track')
  })

  it('no/zero budget → none', () => {
    expect(bandFor(5_000, 0, f)).toBe('none')
    expect(bandFor(5_000, Number.NaN, f)).toBe('none')
  })

  it('day 1 with any spend ≥10% is a watch (1/30 ≈ 3.3% expected)', () => {
    // 3.33% expected; 13.4% spent → +10.07pp → watch
    expect(bandFor(1_340, 10_000, monthElapsedFraction(1, 30))).toBe('watch')
    // 13% spent → +9.67pp → still on_track
    expect(bandFor(1_300, 10_000, monthElapsedFraction(1, 30))).toBe('on_track')
  })
})

describe('projectedMonthEndPaise', () => {
  it('projects linearly: ₹3,000 by day 10 of 30 → ₹9,000', () => {
    expect(projectedMonthEndPaise(300_000, 10, 30)).toBe(900_000)
  })

  it('rounds to whole paise', () => {
    // 3/30 elapsed → ×10 projection
    expect(projectedMonthEndPaise(100, 3, 30)).toBe(1000)
    // repeating fraction still lands on an integer paise value
    expect(projectedMonthEndPaise(333, 3, 30)).toBe(3330)
  })

  it('null on degenerate days', () => {
    expect(projectedMonthEndPaise(5_000, 0, 30)).toBeNull()
    expect(projectedMonthEndPaise(5_000, -1, 30)).toBeNull()
  })

  it('leap-month projection', () => {
    // ₹2,900 by day 29 of 29 → ₹2,900
    expect(projectedMonthEndPaise(290_000, 29, 29)).toBe(290_000)
  })
})

describe('daysLeftInMonth + safeDailySpendPaise', () => {
  it('last day has 0 left', () => {
    expect(daysLeftInMonth(30, 30)).toBe(0)
    expect(daysLeftInMonth(10, 30)).toBe(20)
  })

  it('safe daily = remaining ÷ days left, floored', () => {
    expect(safeDailySpendPaise(1_000_000, 400_000, 20)).toBe(30_000) // ₹600/20d
    expect(safeDailySpendPaise(1_000_000, 401_000, 20)).toBe(29_950) // floor
  })

  it('never spreads an overshoot onto remaining days', () => {
    expect(safeDailySpendPaise(1_000_000, 1_100_000, 10)).toBe(0)
  })

  it('last day: remaining is the target', () => {
    expect(safeDailySpendPaise(1_000_000, 900_000, 0)).toBe(100_000)
  })
})

describe('onTrackRatio — Life Score input', () => {
  it('share of on_track among real budgets', () => {
    expect(onTrackRatio(['on_track', 'watch', 'over', 'on_track'])).toBe(0.5)
  })

  it('none-bands excluded; empty → null', () => {
    expect(onTrackRatio(['none', 'none'])).toBeNull()
    expect(onTrackRatio([])).toBeNull()
    expect(onTrackRatio(['none', 'on_track'])).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import {
  elapsedProgress,
  firedReminders,
  maturityAmountPaise,
  maturityDateUTC,
  reminderDatesUTC,
  reminderStatus,
} from '@/lib/fd'
import { isoDayUTC } from '@/lib/date'

// Hand-calculated reference examples (Golden Rule: verify against manual math)
describe('maturityAmountPaise', () => {
  const P = 10_000_000 // ₹1,00,000 in paise

  it('simple interest: 1,00,000 @ 7% for 12 months → 1,07,000.00', () => {
    expect(maturityAmountPaise(P, 7, 12, 'simple')).toBe(10_700_000)
  })
  it('simple interest partial year: 6 months → 1,03,500.00', () => {
    expect(maturityAmountPaise(P, 7, 6, 'simple')).toBe(10_350_000)
  })
  it('quarterly compounding (Indian FD default): 1,00,000 @ 7% → 1,07,185.90', () => {
    // (1.0175)^4 = 1.0718590312...
    expect(maturityAmountPaise(P, 7, 12, 'quarterly')).toBe(10_718_590)
  })
  it('half-yearly: (1.035)^2 → 1,07,122.50', () => {
    expect(maturityAmountPaise(P, 7, 12, 'half_yearly')).toBe(10_712_250)
  })
  it('annual: (1.07)^1 → 1,07,000.00', () => {
    expect(maturityAmountPaise(P, 7, 12, 'annual')).toBe(10_700_000)
  })
  it('monthly compounding within ±1 paise of hand calc (1.0722901)', () => {
    expect(Math.abs(maturityAmountPaise(P, 7, 12, 'monthly') - 10_722_901)).toBeLessThanOrEqual(1)
  })
  it('handles edge inputs', () => {
    expect(maturityAmountPaise(0, 7, 12, 'quarterly')).toBe(0)
    expect(maturityAmountPaise(P, 7, 0, 'quarterly')).toBe(0)
  })
})

describe('maturityDateUTC (tenure → date, month-end safe)', () => {
  it('adds tenure months preserving the anchor day', () => {
    expect(isoDayUTC(maturityDateUTC('2024-01-31', 12))).toBe('2025-01-31')
    expect(isoDayUTC(maturityDateUTC('2026-09-06', 18))).toBe('2028-03-06')
  })
  it('clamps month-end starts into shorter months', () => {
    expect(isoDayUTC(maturityDateUTC('2024-08-31', 6))).toBe('2025-02-28')
    expect(isoDayUTC(maturityDateUTC('2024-02-29', 12))).toBe('2025-02-28') // leap start
  })
})

describe('reminder ladder (30/15/7/1 days, injectable clock)', () => {
  const maturity = new Date('2026-03-10T00:00:00.000Z')

  it('produces the four reminder dates', () => {
    const dates = reminderDatesUTC(maturity).map(isoDayUTC)
    expect(dates).toEqual(['2026-02-08', '2026-02-23', '2026-03-03', '2026-03-09'])
  })

  it('reports the correct window as the clock advances', () => {
    expect(reminderStatus(maturity, new Date('2026-01-01T00:00:00Z')).level).toBe('none')
    expect(reminderStatus(maturity, new Date('2026-02-08T00:00:00Z')).level).toBe('d30')
    expect(reminderStatus(maturity, new Date('2026-02-25T00:00:00Z')).level).toBe('d15')
    expect(reminderStatus(maturity, new Date('2026-03-03T00:00:00Z')).level).toBe('d7')
    expect(reminderStatus(maturity, new Date('2026-03-09T00:00:00Z')).level).toBe('d1')
    expect(reminderStatus(maturity, new Date('2026-03-10T00:00:00Z')).level).toBe('matured')
    expect(reminderStatus(maturity, new Date('2026-04-01T00:00:00Z')).level).toBe('matured')
  })

  it('counts days left correctly across month boundaries', () => {
    expect(reminderStatus(maturity, new Date('2026-02-08T00:00:00Z')).daysLeft).toBe(30)
    expect(reminderStatus(maturity, new Date('2026-03-03T00:00:00Z')).daysLeft).toBe(7)
  })

  it('lists fired reminders, tightest first', () => {
    expect(firedReminders(maturity, new Date('2026-03-09T00:00:00Z'))).toEqual([1, 7, 15, 30])
    expect(firedReminders(maturity, new Date('2026-02-20T00:00:00Z'))).toEqual([30])
    expect(firedReminders(maturity, new Date('2026-01-01T00:00:00Z'))).toEqual([])
  })
})

describe('elapsedProgress', () => {
  it('is clamped and proportional', () => {
    expect(elapsedProgress('2026-01-01', 12, new Date('2027-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))).toBe(0)
    expect(elapsedProgress('2026-01-01', 12, new Date('2027-01-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'))).toBeCloseTo(181 / 365, 3)
    expect(elapsedProgress('2026-01-01', 12, new Date('2027-01-01T00:00:00Z'), new Date('2028-01-01T00:00:00Z'))).toBe(1)
  })
})

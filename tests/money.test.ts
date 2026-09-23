import { describe, expect, it } from 'vitest'
import {
  formatINR,
  formatINRCompact,
  formatINRSigned,
  parseAmountToPaise,
  paiseToRupees,
  sumPaise,
  toPaise,
} from '@/lib/money'

describe('toPaise (rounding to 2 decimals, half-up)', () => {
  it('rounds float artifacts correctly', () => {
    expect(toPaise(1.234)).toBe(123)
    expect(toPaise(2.675)).toBe(268) // 2.675 * 100 = 267.49999999999997 in float
    expect(toPaise(0.1 + 0.2)).toBe(30)
    expect(toPaise(100)).toBe(10000)
    expect(toPaise(NaN)).toBe(0)
    expect(toPaise(Infinity)).toBe(0)
  })
})

describe('formatINR (Indian grouping, 2 decimals)', () => {
  it('formats lakh/crore grouping', () => {
    expect(formatINR(123456789)).toBe('₹12,34,567.89')
    expect(formatINR(100)).toBe('₹1.00')
    expect(formatINR(0)).toBe('₹0.00')
    expect(formatINR(-500)).toBe('-₹5.00')
  })
  it('signed variant', () => {
    expect(formatINRSigned(5000, 'in')).toBe('+₹50.00')
    expect(formatINRSigned(5000, 'out')).toBe('-₹50.00')
  })
})

describe('formatINRCompact (Indian notation)', () => {
  it('picks the right unit', () => {
    expect(formatINRCompact(1_25_00_00_000)).toBe('₹1.25Cr')
    expect(formatINRCompact(12_50_00_000)).toBe('₹12.5L')
    expect(formatINRCompact(1_25_00_000)).toBe('₹1.25L') // ₹1,25,000
    expect(formatINRCompact(125_000)).toBe('₹1.25K')
    expect(formatINRCompact(450_50)).toBe('₹450.5')
    expect(formatINRCompact(-100_00)).toBe('-₹100')
  })
})

describe('parseAmountToPaise (user-typed input)', () => {
  it('accepts common formats', () => {
    expect(parseAmountToPaise('1,234.5')).toBe(123450)
    expect(parseAmountToPaise('₹99')).toBe(9900)
    expect(parseAmountToPaise('450')).toBe(45000)
    expect(parseAmountToPaise(' 0.01 ')).toBe(1)
  })
  it('rejects invalid input', () => {
    expect(parseAmountToPaise('abc')).toBeNull()
    expect(parseAmountToPaise('-5')).toBeNull()
    expect(parseAmountToPaise('0')).toBeNull()
    expect(parseAmountToPaise('10.999')).toBeNull()
    expect(parseAmountToPaise('')).toBeNull()
  })
})

describe('helpers', () => {
  it('paiseToRupees and sumPaise', () => {
    expect(paiseToRupees(123_45)).toBe(123.45)
    expect(sumPaise([100, 200, -50])).toBe(250)
  })
})

// RD maturity math — hand-verified against closed-form arithmetic.
import { describe, expect, it } from 'vitest'
import { rdInstallmentsPaid, rdMaturityAmountPaise, rdMaturityDateUTC, rdTotalInvestedPaise, rdValueNowPaise } from '@/lib/rd'
import { toUTC } from '@/lib/date'

describe('rdMaturityAmountPaise — quarterly (Indian bank standard)', () => {
  it('matches hand math: ₹1,200 × 6 months @ 12% quarterly = ₹7,454.16', () => {
    // i = 12%/4 = 3% per quarter; pro-rata leftover months at i/3:
    // r=6: 1.03² = 1.0609 · r=5: 1.03×1.02 = 1.0506 · r=4: 1.03×1.01 = 1.0403
    // r=3: 1.03 · r=2: 1.02 · r=1: 1.01   → Σ = 6.2118 → ×1200 = ₹7,454.16
    expect(rdMaturityAmountPaise(120000, 12, 6, 'quarterly')).toBe(745416)
  })

  it('matches hand math: ₹5,000 × 24 months @ 7.5% quarterly', () => {
    // computed independently with exact per-installment decimal expansion
    const factors = (i: number, r: number) => Math.pow(1 + i, Math.floor(r / 3)) * (1 + (i * (r % 3)) / 3)
    const i = 0.075 / 4
    let total = 0
    for (let r = 24; r >= 1; r--) total += 5000 * factors(i, r)
    expect(rdMaturityAmountPaise(500000, 7.5, 24, 'quarterly')).toBe(Math.round(total * 100))
  })

  it('installments grow by completed quarters + pro-rata leftover', () => {
    // tenure 3 → three installments, r = 3, 2, 1 @ i = 2%:
    // 1.02 + (1 + 0.02·2/3) + (1 + 0.02/3) = 3.04 exactly → ₹3,000 × 3.04 = ₹9,120
    expect(rdMaturityAmountPaise(300000, 8, 3, 'quarterly')).toBe(912000)
  })
})

describe('rdMaturityAmountPaise — simple', () => {
  it('matches hand math: ₹1,000 × 12 months @ 6% simple = ₹12,390', () => {
    // Σ_{r=12..1} 1000 × (1 + 0.005r) = 1000 × (12 + 0.005 × 78) = 12,390
    expect(rdMaturityAmountPaise(100000, 6, 12, 'simple')).toBe(1239000)
  })
})

describe('rdMaturityAmountPaise — monthly', () => {
  it('matches hand math: ₹1,000 × 3 months @ 12% monthly = ₹3,060.40', () => {
    // (1.01³ + 1.01² + 1.01) = 1.030301 + 1.0201 + 1.01 = 3.060401 → ₹3,060.40
    expect(rdMaturityAmountPaise(100000, 12, 3, 'monthly')).toBe(306040)
  })
})

describe('rdMaturityAmountPaise — ordering invariant', () => {
  it('monthly compounds ≥ simple ≥ annual for the same nominal rate', () => {
    const R = 200000, rate = 8, N = 15
    const monthly = rdMaturityAmountPaise(R, rate, N, 'monthly')
    const simple = rdMaturityAmountPaise(R, rate, N, 'simple')
    const annual = rdMaturityAmountPaise(R, rate, N, 'annual')
    expect(monthly).toBeGreaterThanOrEqual(simple)
    expect(simple).toBeGreaterThanOrEqual(annual)
  })
})

describe('rdMaturityAmountPaise — edges', () => {
  it('zero installment / zero tenure → 0', () => {
    expect(rdMaturityAmountPaise(0, 7, 12, 'quarterly')).toBe(0)
    expect(rdMaturityAmountPaise(100000, 7, 0, 'quarterly')).toBe(0)
  })
})

describe('rdMaturityDateUTC', () => {
  it('advances tenure months with anchor clamping (Jan 31 + 3m → Apr 30)', () => {
    expect(rdMaturityDateUTC('2026-01-31', 3)).toEqual(toUTC('2026-04-30'))
    expect(rdMaturityDateUTC('2026-09-06', 24)).toEqual(toUTC('2028-09-06'))
  })
})

describe('rdInstallmentsPaid', () => {
  const start = '2026-09-01'
  it('first installment is due on the start date itself', () => {
    expect(rdInstallmentsPaid(start, 12, toUTC('2026-09-01'))).toBe(1)
  })
  it('nothing before start', () => {
    expect(rdInstallmentsPaid(start, 12, toUTC('2026-08-31'))).toBe(0)
  })
  it('advances one per month', () => {
    expect(rdInstallmentsPaid(start, 12, toUTC('2026-10-01'))).toBe(2)
    expect(rdInstallmentsPaid(start, 12, toUTC('2027-02-01'))).toBe(6)
  })
  it('clamps to tenure', () => {
    expect(rdInstallmentsPaid(start, 12, toUTC('2028-01-01'))).toBe(12)
  })
})

describe('totals', () => {
  it('total invested = installment × tenure', () => {
    expect(rdTotalInvestedPaise(500000, 24)).toBe(12000000)
  })
  it('value now = paid × installment', () => {
    expect(rdValueNowPaise(500000, 7)).toBe(3500000)
  })
})

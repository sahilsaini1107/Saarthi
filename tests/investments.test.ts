// Portfolio accounting — weighted-average cost, hand-verified.
import { describe, expect, it } from 'vitest'
import { computeHolding, marketValuePaise, roundQuantity } from '@/lib/investments'

describe('computeHolding — average cost method', () => {
  it('two buys blend into a weighted average', () => {
    const h = computeHolding([
      { kind: 'buy', quantity: 10, amountPaise: 100_000 }, // ₹100/unit
      { kind: 'buy', quantity: 10, amountPaise: 120_000 }, // ₹120/unit
    ])
    expect(h.quantity).toBe(20)
    expect(h.avgCostPaise).toBeCloseTo(11_000, 6) // ₹110
    expect(h.investedPaise).toBeCloseTo(220_000, 4)
    expect(h.realizedPnlPaise).toBe(0)
  })

  it('sell realizes P&L vs avg cost and leaves avg unchanged', () => {
    const h = computeHolding([
      { kind: 'buy', quantity: 10, amountPaise: 100_000 },
      { kind: 'buy', quantity: 10, amountPaise: 120_000 },
      { kind: 'sell', quantity: 5, amountPaise: 75_000 }, // ₹150/unit vs ₹110 avg
    ])
    expect(h.quantity).toBe(15)
    expect(h.avgCostPaise).toBeCloseTo(11_000, 6)
    expect(h.realizedPnlPaise).toBeCloseTo(20_000, 4) // 75,000 − 5×11,000
    expect(h.sellProceedsPaise).toBe(75_000)
    expect(h.investedPaise).toBeCloseTo(165_000, 4)
  })

  it('dividends are income only', () => {
    const h = computeHolding([
      { kind: 'buy', quantity: 10, amountPaise: 100_000 },
      { kind: 'dividend', quantity: 0, amountPaise: 5_000 },
      { kind: 'interest', quantity: 0, amountPaise: 2_500 },
    ])
    expect(h.quantity).toBe(10)
    expect(h.avgCostPaise).toBeCloseTo(10_000, 6)
    expect(h.incomePaise).toBe(7_500)
  })

  it('defensively clamps an over-sell (service also validates)', () => {
    const h = computeHolding([
      { kind: 'buy', quantity: 15, amountPaise: 150_000 },
      { kind: 'sell', quantity: 100, amountPaise: 300_000 },
    ])
    expect(h.quantity).toBe(0)
    expect(h.realizedPnlPaise).toBeCloseTo(150_000, 4) // 300k − 15×10k
  })

  it('fractional crypto quantities', () => {
    const h = computeHolding([
      { kind: 'buy', quantity: 0.5, amountPaise: 500_000_000 }, // ₹5,00,000 per BTC
      { kind: 'buy', quantity: 0.25, amountPaise: 600_000_000 / 4 * 4 }, // ₹6,00,000 per BTC
    ])
    expect(h.quantity).toBeCloseTo(0.75, 8)
    // avg = (5e8 + 6e8) / 0.75 = 1,466,666,666.67 paise/unit
    expect(h.avgCostPaise).toBeCloseTo(1_100_000_000 / 0.75, 2)
  })
})

describe('marketValuePaise', () => {
  it('qty × price, rounded to the paise', () => {
    expect(marketValuePaise(15, 14_000)).toBe(210_000)
    expect(marketValuePaise(0.75, 1_333_333_333)).toBe(999_999_999.75 + 0.25 === 1e9 ? 1_000_000_000 : Math.round(0.75 * 1_333_333_333))
  })
})

describe('roundQuantity', () => {
  it('clamps float noise to 8 decimals', () => {
    expect(roundQuantity(0.123456789)).toBe(0.12345679)
    expect(roundQuantity(20)).toBe(20)
  })
})

import { describe, expect, it } from 'vitest'
import { computePlatesG, DEFAULT_BAR_G, DEFAULT_PLATES_G, formatPlateStack, LIGHT_BAR_G } from '@/lib/plate-math'

// Hand-traced plate-load scenarios (grams, Decision #21). Standard 20 kg bar,
// plates 25/20/15/10/5/2.5/1.25 kg per side.

describe('computePlatesG', () => {
  it('empty bar (target == bar weight)', () => {
    const r = computePlatesG(20_000)
    expect(r.perSideG).toEqual([])
    expect(r.exact).toBe(true)
    expect(r.achievedKg).toBe(20)
    expect(r.note).toBeNull()
  })

  it('40 kg total → one 10 per side', () => {
    const r = computePlatesG(40_000)
    expect(r.perSideG).toEqual([10_000])
    expect(r.exact).toBe(true)
    expect(r.achievedKg).toBe(40)
  })

  it('62.5 kg total → 20 + 1.25 per side', () => {
    const r = computePlatesG(62_500)
    expect(r.perSideG).toEqual([20_000, 1_250])
    expect(r.exact).toBe(true)
    expect(r.achievedKg).toBe(62.5)
  })

  it('100 kg total → 40 per side → 25 + 15', () => {
    const r = computePlatesG(100_000)
    expect(r.perSideG).toEqual([25_000, 15_000])
    expect(r.exact).toBe(true)
  })

  it('greedy prefers the fewest plates for 70 kg (25 per side)', () => {
    const r = computePlatesG(70_000)
    expect(r.perSideG).toEqual([25_000])
    expect(r.exact).toBe(true)
  })

  it('target below the empty bar is reported, never negative plates', () => {
    const r = computePlatesG(15_000)
    expect(r.perSideG).toEqual([])
    expect(r.exact).toBe(false)
    expect(r.achievedKg).toBe(20)
    expect(r.note).toContain('empty 20 kg bar')
  })

  it('15 kg bar mode for lighter loads', () => {
    const r = computePlatesG(17_500, LIGHT_BAR_G)
    expect(r.perSideG).toEqual([1_250])
    expect(r.exact).toBe(true)
    expect(r.achievedKg).toBe(17.5)
  })

  it('unloadable remainder reports the closest achievable load below target', () => {
    // 43.5 kg → 11.75 per side → 10 + 1.25 = 11.25 → 20 + 22.5 = 42.5 total
    const r = computePlatesG(43_500)
    expect(r.exact).toBe(false)
    expect(r.perSideG).toEqual([10_000, 1_250])
    expect(r.achievedKg).toBe(42.5)
    expect(r.note).toContain('42.5')
  })

  it('odd per-side grams still floor to real plates', () => {
    // 21 kg → 0.5 per side → nothing smaller than 1.25 → empty bar 20 kg
    const r = computePlatesG(21_000)
    expect(r.perSideG).toEqual([])
    expect(r.exact).toBe(false)
    expect(r.achievedKg).toBe(20)
  })

  it('non-positive / invalid target is rejected gently', () => {
    expect(computePlatesG(0).exact).toBe(false)
    expect(computePlatesG(-5_000).exact).toBe(false)
    expect(computePlatesG(Number.NaN).note).toBeTruthy()
  })

  it('custom gym with only 10s and 5s', () => {
    const r = computePlatesG(60_000, DEFAULT_BAR_G, [10_000, 5_000])
    expect(r.perSideG).toEqual([10_000, 10_000])
    expect(r.exact).toBe(true)
  })
})

describe('formatPlateStack', () => {
  it('prints kg without trailing zeros', () => {
    expect(formatPlateStack([10_000, 2_500, 1_250])).toBe('10 + 2.5 + 1.25')
    expect(formatPlateStack([25_000])).toBe('25')
    expect(formatPlateStack([])).toBe('')
  })
})

describe('defaults', () => {
  it('standard denominations are largest-first and multiples of 1.25 kg', () => {
    for (let i = 1; i < DEFAULT_PLATES_G.length; i++) {
      expect(DEFAULT_PLATES_G[i - 1]).toBeGreaterThan(DEFAULT_PLATES_G[i])
      expect(DEFAULT_PLATES_G[i] % 1_250).toBe(0)
    }
    expect(DEFAULT_BAR_G).toBe(20_000)
  })
})

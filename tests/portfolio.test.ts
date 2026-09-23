// Phase 4 — portfolio math: price series, allocation, net-worth trend.
import { describe, expect, it } from 'vitest'
import {
  allocationByType,
  buildPriceSeries,
  netWorthTrendSeries,
  priceChange,
  trendDelta,
} from '@/lib/portfolio'

describe('buildPriceSeries', () => {
  it('sorts shuffled input ascending', () => {
    const s = buildPriceSeries([
      { iso: '2026-09-03', pricePaise: 300 },
      { iso: '2026-09-01', pricePaise: 100 },
      { iso: '2026-09-02', pricePaise: 200 },
    ])
    expect(s.map((p) => p.iso)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
  })

  it('same-day re-entry: the later entry wins (upsert semantics)', () => {
    const s = buildPriceSeries([
      { iso: '2026-09-01', pricePaise: 100 },
      { iso: '2026-09-02', pricePaise: 200 },
      { iso: '2026-09-02', pricePaise: 250 },
      { iso: '2026-09-01', pricePaise: 150 },
    ])
    expect(s).toEqual([
      { iso: '2026-09-01', pricePaise: 150 },
      { iso: '2026-09-02', pricePaise: 250 },
    ])
  })

  it('window keeps the last N distinct days', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ iso: `2026-08-${String(i + 1).padStart(2, '0')}`, pricePaise: (i + 1) * 10 }))
    const s = buildPriceSeries(many, 3)
    expect(s.map((p) => p.iso)).toEqual(['2026-08-08', '2026-08-09', '2026-08-10'])
  })

  it('non-finite prices are dropped', () => {
    const s = buildPriceSeries([
      { iso: '2026-09-01', pricePaise: Number.NaN },
      { iso: '2026-09-02', pricePaise: 100 },
    ])
    expect(s).toHaveLength(1)
    expect(s[0].iso).toBe('2026-09-02')
  })
})

describe('priceChange', () => {
  it('computes delta and 2-dp pct: 100 → 125 = +25%', () => {
    const r = priceChange([
      { iso: '2026-09-01', pricePaise: 100 },
      { iso: '2026-09-02', pricePaise: 125 },
    ])
    expect(r).toEqual({ deltaPaise: 25, deltaPct: 25 })
  })

  it('pct keeps 2 decimals: 9900 → 10000 = +1.01%', () => {
    const r = priceChange([
      { iso: '2026-09-01', pricePaise: 9900 },
      { iso: '2026-09-02', pricePaise: 10000 },
    ])
    expect(r.deltaPct).toBe(1.01)
  })

  it('single point or zero previous price → nulls', () => {
    expect(priceChange([{ iso: '2026-09-01', pricePaise: 100 }])).toEqual({ deltaPaise: null, deltaPct: null })
    expect(
      priceChange([
        { iso: '2026-09-01', pricePaise: 0 },
        { iso: '2026-09-02', pricePaise: 100 },
      ]).deltaPct,
    ).toBeNull()
  })
})

describe('allocationByType', () => {
  it('sums by type, computes pct, sorts largest first', () => {
    const slices = allocationByType([
      { type: 'stock', valuePaise: 30000 },
      { type: 'crypto', valuePaise: 10000 },
      { type: 'stock', valuePaise: 20000 },
      { type: 'gold', valuePaise: 0 }, // zero-value positions don't count
    ])
    expect(slices).toEqual([
      { type: 'stock', label: 'Stock', emoji: '📈', valuePaise: 50000, pct: 83 },
      { type: 'crypto', label: 'Crypto', emoji: '🪙', valuePaise: 10000, pct: 17 },
    ])
  })

  it('single type → 100%', () => {
    const slices = allocationByType([{ type: 'etf', valuePaise: 4200 }])
    expect(slices).toHaveLength(1)
    expect(slices[0].pct).toBe(100)
  })

  it('nothing held → empty array (no degenerate chart)', () => {
    expect(allocationByType([])).toEqual([])
    expect(allocationByType([{ type: 'stock', valuePaise: 0 }])).toEqual([])
  })
})

const snap = (iso: string, totalPaise: number) => ({
  iso,
  totalPaise,
  liquidPaise: totalPaise,
  depositsPaise: 0,
  investmentsPaise: 0,
  assetsPaise: 0,
  liabilitiesPaise: 0,
})

describe('netWorthTrendSeries', () => {
  it('fills gaps by carrying the last known value forward', () => {
    // Window Sep 1..5, snapshots on 1 and 4 only.
    const series = netWorthTrendSeries([snap('2026-09-01', 100), snap('2026-09-04', 400)], '2026-09-05', 5)
    expect(series.map((p) => [p.iso, p.totalPaise, p.carried])).toEqual([
      ['2026-09-01', 100, false],
      ['2026-09-02', 100, true],
      ['2026-09-03', 100, true],
      ['2026-09-04', 400, false],
      ['2026-09-05', 400, true], // today without a snapshot yet still carries
    ])
  })

  it('days before the first snapshot are never invented', () => {
    const series = netWorthTrendSeries([snap('2026-09-03', 300)], '2026-09-05', 5)
    expect(series.map((p) => p.iso)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05'])
  })

  it('later same-day duplicate wins; input order is irrelevant', () => {
    const series = netWorthTrendSeries([snap('2026-09-02', 222), snap('2026-09-01', 111), snap('2026-09-02', 250)], '2026-09-02', 2)
    expect(series).toEqual([
      { ...snap('2026-09-01', 111), carried: false },
      { ...snap('2026-09-02', 250), carried: false },
    ])
  })

  it('window truncates from the far end (days=1 → only today)', () => {
    const series = netWorthTrendSeries([snap('2026-08-31', 50), snap('2026-09-01', 60)], '2026-09-01', 1)
    expect(series).toEqual([{ ...snap('2026-09-01', 60), carried: false }])
  })

  it('month boundary + leap-safe stepping works via shiftISO', () => {
    const series = netWorthTrendSeries([snap('2026-02-28', 500)], '2026-03-02', 5)
    // window starts 2026-02-26 but pre-first-snapshot days are omitted
    expect(series.map((p) => p.iso)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02'])
  })
})

describe('trendDelta', () => {
  it('delta between the two most recent points', () => {
    const r = trendDelta([snap('2026-09-01', 100000), snap('2026-09-02', 112500)])
    expect(r).toEqual({ deltaPaise: 12500, deltaPct: 12.5 })
  })

  it('fewer than two points → nulls; zero previous → null pct', () => {
    expect(trendDelta([snap('2026-09-01', 100)])).toEqual({ deltaPaise: null, deltaPct: null })
    expect(trendDelta([snap('2026-09-01', 0), snap('2026-09-02', 500)]).deltaPct).toBeNull()
  })
})

// Portfolio & net-worth trend math (Phase 4). Pure functions only.
//  • Price series: one point per day (same-day upsert convention, Decision #21)
//  • Allocation: current open positions by investment type
//  • Net-worth trend: lazy daily snapshots forward-filled across gaps —
//    days before the first snapshot are NEVER invented (Decision #24)

import { INVESTMENT_TYPE_EMOJI, INVESTMENT_TYPE_LABELS, InvestmentType } from '@/lib/investments'
import { shiftISO } from '@/lib/date'

export interface PricePoint {
  iso: string
  pricePaise: number
}

/**
 * Clean ascending series for charts: sorts, keeps the LATEST entry per day
 * (same-day re-upsert wins), and optionally trims to the last `days`
 * distinct days.
 */
export function buildPriceSeries(points: PricePoint[], days?: number): PricePoint[] {
  const byDay = new Map<string, number>()
  for (const p of points) {
    if (!Number.isFinite(p.pricePaise)) continue
    byDay.set(p.iso, p.pricePaise) // later entry for the same day replaces
  }
  const series = [...byDay.entries()]
    .map(([iso, pricePaise]) => ({ iso, pricePaise }))
    .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0))
  return days !== undefined && series.length > days ? series.slice(-days) : series
}

/** Latest price vs the previous distinct day. Nulls when it can't be computed. */
export function priceChange(series: PricePoint[]): { deltaPaise: number | null; deltaPct: number | null } {
  if (series.length < 2) return { deltaPaise: null, deltaPct: null }
  const prev = series[series.length - 2].pricePaise
  const cur = series[series.length - 1].pricePaise
  const deltaPaise = cur - prev
  return {
    deltaPaise,
    deltaPct: prev > 0 ? Math.round((deltaPaise / prev) * 10000) / 100 : null, // 2-dp
  }
}

export interface AllocationSlice {
  type: InvestmentType
  label: string
  emoji: string
  valuePaise: number
  /** share of the total, 0..100 rounded for display */
  pct: number
}

/**
 * Allocation of OPEN positions by investment type, largest first.
 * Empty (not zero-slices) when there is nothing held — callers render their
 * empty state instead of a degenerate chart.
 */
export function allocationByType(positions: { type: InvestmentType; valuePaise: number }[]): AllocationSlice[] {
  const totals = new Map<InvestmentType, number>()
  let total = 0
  for (const p of positions) {
    if (!Number.isFinite(p.valuePaise) || p.valuePaise <= 0) continue
    totals.set(p.type, (totals.get(p.type) ?? 0) + p.valuePaise)
    total += p.valuePaise
  }
  if (total <= 0) return []
  return [...totals.entries()]
    .map(([type, valuePaise]) => ({
      type,
      label: INVESTMENT_TYPE_LABELS[type],
      emoji: INVESTMENT_TYPE_EMOJI[type],
      valuePaise,
      pct: Math.round((valuePaise / total) * 100),
    }))
    .sort((a, b) => b.valuePaise - a.valuePaise || a.label.localeCompare(b.label))
}

export interface TrendSnapshot {
  iso: string
  totalPaise: number
  liquidPaise: number
  depositsPaise: number
  investmentsPaise: number
  assetsPaise: number
  liabilitiesPaise: number
}

export interface TrendPoint extends TrendSnapshot {
  /** true when this day's value is carried forward from an earlier snapshot */
  carried: boolean
}

/**
 * Expand sparse daily snapshots into a continuous per-day series covering the
 * last `days` days ending `todayIso` (inclusive). Gap days carry the last
 * known values forward; days before the FIRST snapshot are omitted — history
 * the system never saw is never fabricated. Duplicates for one day: the
 * later entry wins. Output is ascending by day.
 */
export function netWorthTrendSeries(snapshots: TrendSnapshot[], todayIso: string, days: number): TrendPoint[] {
  const byDay = new Map<string, TrendSnapshot>()
  for (const s of snapshots) byDay.set(s.iso, s) // later entry for the same day wins

  const start = shiftISO(todayIso, -(Math.max(1, days) - 1))
  const out: TrendPoint[] = []
  let lastKnown: TrendSnapshot | null = null
  for (let iso = start; iso <= todayIso; iso = shiftISO(iso, 1)) {
    const snap = byDay.get(iso)
    if (snap) {
      lastKnown = snap
      out.push({ ...snap, carried: false })
    } else if (lastKnown) {
      out.push({ ...lastKnown, iso, carried: true })
    }
    // else: before the first snapshot — no invented history
  }
  return out
}

/** Absolute + pct change between the two most recent points of an ascending series. */
export function trendDelta(series: { iso: string; totalPaise: number }[]): { deltaPaise: number | null; deltaPct: number | null } {
  if (series.length < 2) return { deltaPaise: null, deltaPct: null }
  const prev = series[series.length - 2].totalPaise
  const cur = series[series.length - 1].totalPaise
  const deltaPaise = cur - prev
  return {
    deltaPaise,
    deltaPct: prev > 0 ? Math.round((deltaPaise / prev) * 10000) / 100 : null,
  }
}

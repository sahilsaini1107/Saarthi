'use client'

// Price-history charts (Phase 4). Sparklines ride along on holding rows;
// the full chart lives in the investment sheet. Direction-coloured:
// up = income green, down = expense red (matches the P&L semantics).

import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import type { PricePoint } from '@/lib/portfolio'
import { formatINRCompact } from '@/lib/money'

export const CHART_TEAL = '#0D9488'
export const CHART_INCOME = '#16A34A'
export const CHART_EXPENSE = '#DC2626'

/** Colour follows the visible trend: last point vs first point. */
export function directionColor(points: { pricePaise: number }[]): string {
  if (points.length < 2) return CHART_TEAL
  return points[points.length - 1].pricePaise >= points[0].pricePaise ? CHART_INCOME : CHART_EXPENSE
}

/** Mini chart for holding rows (≤72px wide). Null until 2+ points exist. */
export function PriceSparkline({ points, width = 72, height = 34 }: { points: PricePoint[]; width?: number; height?: number }) {
  if (points.length < 2) return null
  const color = directionColor(points)
  return (
    <div style={{ width, height }} aria-hidden className="shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 3, right: 0, bottom: 0, left: 0 }}>
          <Area type="monotone" dataKey="pricePaise" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.12} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Full-width chart for the investment sheet. */
export function PriceHistoryChart({ points }: { points: PricePoint[] }) {
  if (points.length < 2) return null
  const color = directionColor(points)
  return (
    <div className="h-36 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis
            width={54}
            tick={{ fontSize: 10 }}
            tickFormatter={(v: number) => formatINRCompact(v)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number | string) => formatINRCompact(Number(value))}
            labelFormatter={(label) => String(label)}
            contentStyle={{ borderRadius: 12, border: '1px solid rgba(128,128,128,.3)', fontSize: 12 }}
          />
          <Area type="monotone" dataKey="pricePaise" stroke={color} strokeWidth={2} fill="url(#priceFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

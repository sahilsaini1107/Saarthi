'use client'

// Composition panel (Phase 22) — the grid a smart scale's app shows, plus the
// figures Saarthi derives, plus a band where a published reference range
// actually exists. A metric with no defensible band shows no verdict at all:
// a made-up "normal" is worse than silence.

import { useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDeleteBodyMetric } from '@/hooks/queries'
import { formatMetricDisplay, formatMilli } from '@/lib/body'
import { formatDayLabel } from '@/lib/date'
import type { BodyMetricSeries, CompositionMetricDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

const TONE: Record<string, string> = {
  income: 'bg-income/10 text-income',
  warn: 'bg-warn/10 text-warn',
  expense: 'bg-expense/10 text-expense',
  muted: 'bg-muted text-muted-foreground',
}

export function MetricCard({
  metric,
  series,
  goalMilli,
}: {
  metric: CompositionMetricDTO
  series: BodyMetricSeries | undefined
  goalMilli?: number | null
}) {
  const [open, setOpen] = useState(false)
  const hasHistory = (series?.points.length ?? 0) >= 2
  const delta = metric.delta30dMilli

  return (
    <div className="rounded-2xl border bg-card p-3">
      <button
        type="button"
        onClick={() => hasHistory && setOpen(!open)}
        disabled={!hasHistory}
        className="w-full text-left disabled:cursor-default"
      >
        <div className="flex items-start justify-between gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{metric.label}</span>
          <span className="shrink-0 text-sm" aria-hidden>
            {metric.emoji}
          </span>
        </div>
        <p className="mt-0.5 text-xl font-bold tabular-nums tracking-tight">
          {formatMetricDisplay(metric.valueMilli ?? 0, metric.unit)}
          {metric.unit && <span className="ml-0.5 text-xs font-medium text-muted-foreground">{metric.unit}</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {metric.band && (
            <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase', TONE[metric.band.tone] ?? TONE.muted)}>
              {metric.band.label}
            </span>
          )}
          {metric.derived && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
              calculated
            </span>
          )}
          {delta != null && delta !== 0 && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              30d {delta > 0 ? '+' : ''}
              {formatMetricDisplay(delta, '')}
            </span>
          )}
          {hasHistory && <ChevronDown className={cn('ml-auto size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />}
        </div>
      </button>

      {open && series && <MetricDetail series={series} goalMilli={goalMilli} />}
    </div>
  )
}

function MetricDetail({ series, goalMilli }: { series: BodyMetricSeries; goalMilli?: number | null }) {
  const del = useDeleteBodyMetric({ success: 'Reading removed' })
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // Weight gets the 7-point average line (day-to-day noise is water, not fat);
  // everything else is measured rarely enough that raw points read better.
  const useAverage = series.kind === 'weight' && series.avg7.length >= 3
  const data = series.points.map((p) => {
    const avg = series.avg7.find((a) => a.iso === p.iso)
    return {
      date: p.iso.slice(5),
      value: p.valueMilli / 1000,
      avg: avg ? avg.valueMilli / 1000 : null,
    }
  })

  // Recharts' ifOverflow="extendDomain" does not reliably stretch an 'auto'
  // domain, so the range is computed here: a goal line you cannot see is
  // pointless, and seeing the gap is the whole reason to draw one.
  const values = data.map((d) => d.value)
  const goalKg = goalMilli != null ? goalMilli / 1000 : null
  const lo = Math.min(...values, ...(goalKg != null ? [goalKg] : []))
  const hi = Math.max(...values, ...(goalKg != null ? [goalKg] : []))
  const pad = Math.max((hi - lo) * 0.08, 0.2)
  const domain: [number, number] = [Math.round((lo - pad) * 10) / 10, Math.round((hi + pad) * 10) / 10]

  return (
    <div className="mt-2 border-t pt-2">
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -22 }}>
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={36} domain={domain} />
            <Tooltip
              contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid var(--border)', background: 'var(--card)' }}
              formatter={(v, name: string) => [v == null ? '—' : `${v} ${series.unit}`, name === 'avg' ? '7-pt avg' : 'reading']}
            />
            {goalMilli != null && (
              <ReferenceLine
                y={goalMilli / 1000}
                stroke="var(--primary)"
                strokeDasharray="4 3"
                strokeOpacity={0.6}
                label={{ value: 'goal', fontSize: 9, fill: 'var(--muted-foreground)', position: 'insideTopRight' }}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke={useAverage ? 'var(--muted-foreground)' : 'var(--primary)'}
              strokeWidth={useAverage ? 1 : 2}
              dot={{ r: 2 }}
              strokeOpacity={useAverage ? 0.5 : 1}
            />
            {useAverage && <Line type="monotone" dataKey="avg" stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-1 text-[10px] text-muted-foreground">
        {series.minMilli != null && series.maxMilli != null
          ? `range ${formatMilli(series.minMilli)}–${formatMilli(series.maxMilli)} ${series.unit}`
          : ''}
        {useAverage ? ' · line is the 7-point average' : ''}
      </p>

      <div className="mt-2 flex flex-col gap-1">
        {[...series.points]
          .reverse()
          .slice(0, 6)
          .map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1 text-[11px]">
              <span className="flex-1 text-muted-foreground">{formatDayLabel(p.iso)}</span>
              <span className="tabular-nums font-medium">
                {formatMilli(p.valueMilli)} {series.unit}
              </span>
              <button
                type="button"
                aria-label={confirmId === p.id ? 'Confirm delete reading' : 'Delete reading'}
                disabled={del.isPending}
                onClick={() => {
                  if (confirmId !== p.id) {
                    setConfirmId(p.id)
                    return
                  }
                  del.mutate(p.id, { onSettled: () => setConfirmId(null) })
                }}
                className={cn(
                  'rounded p-0.5 text-muted-foreground hover:text-expense',
                  confirmId === p.id && 'text-expense',
                )}
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        {confirmId && <p className="text-[10px] text-expense">Tap the bin again to delete that reading.</p>}
      </div>
    </div>
  )
}

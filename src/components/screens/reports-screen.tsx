'use client'

// Reports hub (Phase F / task 20) — one screen, two views:
//  · Monthly Life Report (default): cross-pillar sections + Life Score snapshot
//  · 13 per-domain reports over a chosen window with prev-window deltas
// Everything renders from the shared report shape; print-to-PDF is the
// browser's own print dialog with print: variants hiding the app chrome.

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip, EmptyState, ErrorCard, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { useUi } from '@/components/saarthi-app'
import { useDomainReport, useLifeReport } from '@/hooks/queries'
import { currentMonthKey, formatMonthLabel, shiftISO, shiftMonthKey, todayISO } from '@/lib/date'
import { formatMinutes } from '@/lib/effort-grid'
import { formatINRCompact } from '@/lib/money'
import { REPORT_DOMAINS, monthWindow } from '@/lib/reports'
import type { ReportDomain, ReportSeries } from '@/lib/reports'
import type { DomainReportPayload, LifeReportPayload, ReportRow, ReportStat } from '@/services/reports'
import { cn } from '@/lib/utils'

type RangePreset = 'this_month' | 'last_month' | '30d' | '90d' | 'custom'

const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
]

function windowFor(preset: RangePreset, today: string, custom: { from: string; to: string }): { from: string; to: string } {
  switch (preset) {
    case 'this_month':
      return monthWindow(today.slice(0, 7))
    case 'last_month':
      return monthWindow(shiftMonthKey(today.slice(0, 7), -1))
    case '30d':
      return { from: shiftISO(today, -29), to: today }
    case '90d':
      return { from: shiftISO(today, -89), to: today }
    case 'custom':
      return custom
  }
}

function fmtByUnit(value: number, unit: string): string {
  switch (unit) {
    case 'rupees':
      return formatINRCompact(value)
    case 'minutes':
      return formatMinutes(value)
    case 'kcal':
      return value.toLocaleString('en-IN')
    case 'percent':
      return `${Math.round(value * 100) / 100}%`
    case 'kg':
      return `${Math.round(value * 100) / 100} kg`
    default:
      return String(Math.round(value * 100) / 100)
  }
}

/* ---------- delta badge ---------- */

function DeltaBadge({ s }: { s: ReportStat }) {
  if (s.deltaPct === null || s.deltaPct === undefined) return null
  const up = s.deltaPct >= 0
  const good = s.goodDirection ? (up === (s.goodDirection === 'up')) : null
  return (
    <span
      className={cn(
        'text-[10px] font-bold tabular-nums',
        good === true ? 'text-income' : good === false ? 'text-expense' : 'text-muted-foreground',
      )}
    >
      {up ? '▲' : '▼'} {Math.abs(Math.round(s.deltaPct * 10) / 10)}%
    </span>
  )
}

/* ---------- stats grid ---------- */

function StatsGrid({ stats }: { stats: ReportStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
          <div className="mt-0.5 flex items-baseline justify-between gap-1">
            <p className="text-base font-bold tabular-nums">{s.value}</p>
            <DeltaBadge s={s} />
          </div>
          {s.sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{s.sub}</p>}
        </div>
      ))}
    </div>
  )
}

/* ---------- bar series ---------- */

function SeriesCard({ series }: { series: ReportSeries }) {
  const max = Math.max(...series.points.map((p) => p.value), 0)
  const total = series.points.reduce((s, p) => s + p.value, 0)
  if (series.points.length === 0) return null
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold">{series.label}</p>
        <p className="text-[10px] tabular-nums text-muted-foreground">
          total {fmtByUnit(total, series.unit)}
        </p>
      </div>
      <div className="mt-2 flex h-20 items-end gap-[2px]" role="img" aria-label={`${series.label} bar chart`}>
        {series.points.map((p, i) => (
          <div
            key={`${p.label}-${i}`}
            title={`${p.label} · ${fmtByUnit(p.value, series.unit)}`}
            className={cn('min-w-[3px] flex-1 rounded-t-[2px]', p.value === 0 ? 'bg-muted' : max > 0 && p.value === max ? 'bg-primary' : 'bg-primary/60')}
            style={{ height: `${max > 0 ? Math.max(3, (p.value / max) * 100) : 3}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>{series.points[0].label}</span>
        <span>{series.bucket === 'day' ? 'daily' : 'weekly'}</span>
        <span>{series.points.at(-1)?.label}</span>
      </div>
    </div>
  )
}

/* ---------- rows + notes ---------- */

function RowsList({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className={cn('flex items-center justify-between gap-2 px-3 py-2', i > 0 && 'border-t')}>
          <div className="flex min-w-0 items-center gap-2">
            {r.emoji && (
              <span aria-hidden className="text-sm">
                {r.emoji}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{r.label}</p>
              {r.sub && <p className="truncate text-[10px] text-muted-foreground">{r.sub}</p>}
            </div>
          </div>
          <p className="shrink-0 text-xs font-bold tabular-nums">{r.value}</p>
        </div>
      ))}
    </div>
  )
}

function NotesList({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Insights</p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {notes.map((n, i) => (
          <li key={i} className="flex gap-1.5 text-xs leading-snug">
            <span aria-hidden>💡</span>
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- domain report view ---------- */

function DomainReportView({ data }: { data: DomainReportPayload }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold">
            <span className="mr-1" aria-hidden>
              {data.emoji}
            </span>
            {data.title} report
          </p>
          <p className="text-[11px] text-muted-foreground">
            {data.windowLabel} · vs {data.prevLabel}
          </p>
        </div>
      </div>
      <StatsGrid stats={data.stats} />
      {data.series.map((s, i) => (
        <SeriesCard key={`${s.label}-${i}`} series={s} />
      ))}
      <RowsList rows={data.rows} />
      <NotesList notes={data.notes} />
    </div>
  )
}

/* ---------- life report view ---------- */

function StatMini({ s }: { s: ReportStat }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
      <div className="flex items-baseline justify-between gap-1">
        <p className="text-xs font-bold tabular-nums">{s.value}</p>
        <DeltaBadge s={s} />
      </div>
      {s.sub && <p className="text-[9px] text-muted-foreground">{s.sub}</p>}
    </div>
  )
}

function LifeReportView({ data }: { data: LifeReportPayload }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-bold">{data.monthLabel} · Life Report</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{data.headline}</p>
        <div className="mt-3 flex items-center gap-2">
          <p
            className={cn(
              'text-2xl font-bold tabular-nums',
              data.score.overall === null ? 'text-muted-foreground' : data.score.overall >= 75 ? 'text-income' : data.score.overall >= 50 ? 'text-primary' : 'text-warn',
            )}
          >
            {data.score.overall ?? '—'}
          </p>
          <p className="text-[10px] leading-tight text-muted-foreground">
            Life Score today
            <br />
            measured now, not month-average
          </p>
        </div>
        <div className="mt-2 flex gap-1.5">
          {(['wealth', 'growth', 'reflection'] as const).map((p) => {
            const pillar = data.score[p]
            return (
              <span
                key={p}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
                  pillar.score === null ? 'bg-muted text-muted-foreground' : pillar.score >= 75 ? 'bg-income/10 text-income' : pillar.score >= 50 ? 'bg-primary/10 text-primary' : 'bg-warn/10 text-warn',
                )}
              >
                {p} {pillar.score ?? '—'}
              </span>
            )
          })}
        </div>
      </div>

      {data.sections.map((sec) => (
        <section key={sec.pillar} className="rounded-xl border bg-card p-3">
          <p className="text-xs font-bold">
            <span className="mr-1" aria-hidden>
              {sec.emoji}
            </span>
            {sec.title}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {sec.stats.map((s) => (
              <StatMini key={s.label} s={s} />
            ))}
          </div>
          {sec.highlights.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 border-t pt-2">
              {sec.highlights.map((h, i) => (
                <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
                  <span aria-hidden>💡</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p className="px-1 text-[10px] leading-snug text-muted-foreground">
        Section stats cover {data.monthLabel} only; the Life Score is the live trailing-window snapshot. Print this page for a PDF keepsake.
      </p>
    </div>
  )
}

/* ---------- main screen ---------- */

export function ReportsScreen() {
  const { user } = useUi()
  const today = todayISO(user.timezone)
  const currentMonth = currentMonthKey(user.timezone)

  const [mode, setMode] = useState<'life' | ReportDomain>('life')
  const [preset, setPreset] = useState<RangePreset>('this_month')
  const [custom, setCustom] = useState({ from: monthWindow(currentMonth).from, to: today })
  const [month, setMonth] = useState(currentMonth)

  const win = useMemo(() => windowFor(preset, today, custom), [preset, today, custom])
  const domainQuery = useDomainReport(mode !== 'life' ? mode : 'money', win.from, win.to, mode !== 'life')
  const lifeQuery = useLifeReport(month, mode === 'life')

  const active = mode === 'life' ? lifeQuery : domainQuery

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <SectionHeader title="Reports" />
        <Button variant="outline" size="sm" className="no-print shrink-0" onClick={() => window.print()}>
          <Printer className="mr-1 size-4" aria-hidden />
          Print / PDF
        </Button>
      </div>

      {/* domain chips */}
      <div className="no-print flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Report domains">
        <Chip active={mode === 'life'} onClick={() => setMode('life')} emoji="📊" label="Life" />
        {REPORT_DOMAINS.map((d) => (
          <Chip key={d.key} active={mode === d.key} onClick={() => setMode(d.key)} emoji={d.emoji} label={d.label} />
        ))}
      </div>

      {/* controls */}
      {mode === 'life' ? (
        <div className="no-print flex items-center justify-between rounded-xl border bg-card px-2 py-1.5">
          <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonthKey(month, -1))} aria-label="Previous month">
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <p className="text-xs font-semibold">{formatMonthLabel(month)}</p>
          <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonthKey(month, 1))} disabled={month >= currentMonth} aria-label="Next month">
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="no-print flex flex-col gap-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {RANGE_PRESETS.map((p) => (
              <Chip
                key={p.key}
                active={preset === p.key}
                onClick={() => {
                  setPreset(p.key)
                }}
                label={p.label}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={win.from}
              max={win.to}
              onChange={(e) => {
                if (!e.target.value) return
                setCustom({ ...custom, from: e.target.value })
                setPreset('custom')
              }}
              aria-label="From date"
              className="rounded-lg border bg-card px-2 py-1.5 tabular-nums"
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="date"
              value={win.to}
              min={win.from}
              max={today}
              onChange={(e) => {
                if (!e.target.value) return
                setCustom({ ...custom, to: e.target.value })
                setPreset('custom')
              }}
              aria-label="To date"
              className="rounded-lg border bg-card px-2 py-1.5 tabular-nums"
            />
          </div>
        </div>
      )}

      {/* body */}
      {active.isLoading ? (
        <SkeletonRow />
      ) : active.isError ? (
        <ErrorCard message={(active.error as Error).message} onRetry={() => active.refetch()} />
      ) : mode === 'life' ? (
        lifeQuery.data ? (
          <LifeReportView data={lifeQuery.data} />
        ) : (
          <EmptyState emoji="📊" title="No report yet" body="Pick a month to assemble your Life Report." />
        )
      ) : domainQuery.data ? (
        <DomainReportView data={domainQuery.data} />
      ) : (
        <EmptyState emoji="📊" title="Nothing to report" body="Adjust the window and try again." />
      )}
    </div>
  )
}

'use client'

// Expense overview (task 1.7): month total, by-category donut, MoM delta.
// Chart data comes from the same service query as the sums → always matches.

import { useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { useExpenseOverview, useNetWorthTrend, useToday } from '@/hooks/queries'
import { EmptyState, ErrorCard, Money, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, YAxis } from 'recharts'
import { formatMonthLabel, todayISO } from '@/lib/date'
import { formatINRCompact, formatINR } from '@/lib/money'
import { CHART_TEAL } from '@/components/money/price-chart'
import { ArrowLeft } from 'lucide-react'

export function OverviewScreen() {
  const { user, navigate } = useUi()
  const [month, setMonth] = useState(() => todayISO(user.timezone).slice(0, 7))
  const overview = useExpenseOverview(month)
  const today = useToday()
  const prevMonthKey = previousMonth(month)

  if (overview.isLoading) return <SkeletonRow />
  if (overview.isError) return <ErrorCard message={(overview.error as Error).message} onRetry={() => overview.refetch()} />
  if (!overview.data) return null

  const d = overview.data
  const chartData = d.byCategory.slice(0, 8)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2 px-1">
        <button type="button" onClick={() => navigate('/money')} className="text-muted-foreground" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
      </header>

      <input
        type="month"
        value={month}
        max={todayISO(user.timezone).slice(0, 7)}
        onChange={(e) => setMonth(e.target.value)}
        className="w-full rounded-xl border bg-card p-2.5 text-sm font-medium"
        aria-label="Choose month"
      />

      {/* net worth + trend (Phase 4) */}
      {today.data && <NetWorthCard />}

      <section className="rounded-2xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">Spent · {formatMonthLabel(month)}</p>
        <Money paise={d.outPaise} className="text-3xl font-bold text-expense" />
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Income</span>
          <Money paise={d.inPaise} className="font-semibold text-income" />
          <span className="text-muted-foreground">· {d.txnCount} txns</span>
        </div>
        <div className="mt-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">vs {formatMonthLabel(prevMonthKey)}</p>
          {d.prevOutPaise === 0 ? (
            <p className="text-sm font-medium">No spending recorded last month</p>
          ) : (
            <p className={`text-sm font-bold ${d.momDeltaPct && d.momDeltaPct > 0 ? 'text-expense' : 'text-income'}`}>
              {d.momDeltaPct !== null && (d.momDeltaPct > 0 ? '+' : '')}
              {d.momDeltaPct ?? 0}% ({formatINR(d.outPaise - d.prevOutPaise)})
            </p>
          )}
        </div>
      </section>

      {d.byCategory.length === 0 ? (
        <EmptyState emoji="🌤️" title="No spending this month" body="Quick-add something with the + button and the breakdown will appear here." />
      ) : (
        <>
          <section className="rounded-2xl border bg-card p-4">
            <p className="mb-2 px-1 text-sm font-semibold">Where it went</p>
            <div className="relative h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="outPaise" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                    {chartData.map((s) => (
                      <Cell key={s.categoryId ?? 'uncat'} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | string) => formatINR(Number(value))}
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(128,128,128,.3)', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold tabular-nums">{formatINRCompact(d.outPaise)}</p>
              </div>
            </div>
          </section>

          <section>
            <SectionHeader title="By category" />
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
              {d.byCategory.map((c) => (
                <div key={c.categoryId ?? 'uncat'}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden>{c.emoji}</span> {c.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatINRCompact(c.outPaise)}</span>
                      <span className="w-10 text-right text-xs text-muted-foreground">{Math.round((c.outPaise / d.outPaise) * 100)}%</span>
                    </span>
                  </div>
                  <ProgressBar value={(c.outPaise / d.outPaise) * 100} className="h-1.5" />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function previousMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)
}

function NetWorthCard() {
  const { navigate } = useUi()
  const today = useToday()
  const trend = useNetWorthTrend(90)
  if (!today.data) return null
  const t = trend.data
  const series = t?.series ?? []
  const deltas = [
    { key: 'snap', label: 'vs last snapshot', value: t?.deltaPaise ?? null },
    { key: '7d', label: '7d', value: t?.delta7dPaise ?? null },
    { key: '30d', label: '30d', value: t?.delta30dPaise ?? null },
  ].filter((d): d is { key: string; label: string; value: number } => d.value !== null)

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Net worth · today</p>
          <Money paise={today.data.netWorthPaise} className="text-2xl font-bold" />
        </div>
        <button type="button" onClick={() => navigate('/money/invest')} className="text-xs font-medium text-primary">
          Manage →
        </button>
      </div>

      {series.length >= 2 && (
        <div className="mt-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_TEAL} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={CHART_TEAL} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <YAxis width={54} tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatINRCompact(v)} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: number | string) => formatINR(Number(value))}
                contentStyle={{ borderRadius: 12, border: '1px solid rgba(128,128,128,.3)', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="totalPaise" stroke={CHART_TEAL} strokeWidth={2} fill="url(#nwFill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {series.length === 1 && (
        <p className="mt-3 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
          First snapshot recorded 📌 Open Saarthi again tomorrow (or any day) and your net-worth trend line starts here.
        </p>
      )}

      {deltas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {deltas.map((d) => (
            <span
              key={d.key}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${d.value >= 0 ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'}`}
            >
              {d.value >= 0 ? '▲' : '▼'} {formatINRCompact(Math.abs(d.value))} · {d.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-4 gap-2 border-t pt-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Liquid</p>
          <p className="font-semibold tabular-nums">{formatINRCompact(today.data.liquidPaise)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Deposits</p>
          <p className="font-semibold tabular-nums">{formatINRCompact(today.data.depositsPaise)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Invest</p>
          <p className="font-semibold tabular-nums">{formatINRCompact(today.data.investmentsValuePaise)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Assets</p>
          <p className="font-semibold tabular-nums">{formatINRCompact(today.data.assetsValuePaise)}</p>
        </div>
      </div>
    </section>
  )
}

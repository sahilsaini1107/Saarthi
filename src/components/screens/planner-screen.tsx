'use client'

// Portfolio planner (Phase 8) — "every rupee has a job".
// Shows the six-job allocation vs the user's targets, rebalance moves,
// the income machine, DICGC deposit-insurance exposure, and the knowledge
// layer (framework cards + time-horizon map) that powers informed decisions.

import { useMemo, useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { usePlanner, useSaveTargets } from '@/hooks/queries'
import { ErrorCard, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import {
  DICGC_LIMIT_PAISE,
  HORIZON_MAP,
  JOBS,
  JOB_META,
  KNOWLEDGE_CARDS,
  PLAN_PRESETS,
  type JobKey,
} from '@/lib/planner'
import { formatINR, formatINRCompact } from '@/lib/money'
import { formatMilliMoney } from '@/lib/goals-grid'
import type { PlannerOverview } from '@/services/planner'

const HEALTH_META: Record<PlannerOverview['health'], { label: string; cls: string }> = {
  aligned: { label: 'On plan', cls: 'bg-income/15 text-income' },
  drift: { label: 'Drifting', cls: 'bg-warn/15 text-warn' },
  unset: { label: 'No plan yet', cls: 'bg-white/15 text-primary-foreground' },
  empty: { label: 'Nothing to plan yet', cls: 'bg-white/15 text-primary-foreground' },
}

export function PlannerScreen() {
  const { navigate } = useUi()
  const planner = usePlanner()
  const [targetsOpen, setTargetsOpen] = useState(false)
  const [openCard, setOpenCard] = useState<string | null>(null)

  if (planner.isLoading) return <SkeletonRow />
  if (planner.isError) return <ErrorCard message={(planner.error as Error).message} onRetry={() => planner.refetch()} />
  if (!planner.data) return null

  const d = planner.data
  const health = HEALTH_META[d.health]
  const drifting = d.jobs.filter((j) => j.status === 'drift')
  const targetSum = d.jobs.reduce((s, j) => s + (j.targetPct ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between px-1">
        <button type="button" onClick={() => navigate('/money')} className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Back">
          ← Money
        </button>
        <Button size="sm" variant={d.hasTargets ? 'outline' : 'default'} className="h-9 rounded-full" onClick={() => setTargetsOpen(true)}>
          {d.hasTargets ? 'Edit targets' : 'Set your plan'}
        </Button>
      </header>

      <h1 className="-mt-1 px-1 text-2xl font-bold tracking-tight">Planner</h1>
      <p className="-mt-3 px-1 text-sm text-muted-foreground">Every rupee has a job. See where your money works — and steer it back on plan.</p>

      {/* hero */}
      <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm opacity-80">Invested wealth</p>
            <p className="mt-0.5 text-3xl font-bold tracking-tight tabular-nums">{formatINRCompact(d.totalPaise)}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${health.cls}`}>{health.label}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-xs opacity-75">Monthly income</p>
            <p className="font-semibold tabular-nums">{formatINRCompact(d.income.monthlyAveragePaise)}</p>
          </div>
          <div>
            <p className="text-xs opacity-75">Per year</p>
            <p className="font-semibold tabular-nums">{formatINRCompact(d.income.projectedAnnualPaise)}</p>
          </div>
          <div>
            <p className="text-xs opacity-75">Yield</p>
            <p className="font-semibold tabular-nums">{d.income.yieldPct != null ? `${d.income.yieldPct}%` : '—'}</p>
          </div>
        </div>
        {d.unassignedCount > 0 && (
          <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs">
            {d.unassignedCount} holding{d.unassignedCount === 1 ? '' : 's'} ({formatINRCompact(d.unassignedValuePaise)}) not tagged yet — open any
            holding&apos;s edit sheet to give it a job.
          </p>
        )}
        {d.goalsFunding.linkedCount > 0 && (
          <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs" data-testid="planner-goals-funding">
            🎯 {formatMilliMoney(d.goalsFunding.totalContributedMilli)} saved toward{' '}
            {d.goalsFunding.linkedCount} linked goal{d.goalsFunding.linkedCount === 1 ? '' : 's'}
            {d.goalsFunding.totalCommittedMilli > 0 && ` (${formatMilliMoney(d.goalsFunding.totalCommittedMilli)} committed)`}
          </p>
        )}
        {d.goalsFunding.unlinkedCount > 0 && (
          <p className="mt-2 rounded-xl bg-white/10 px-3 py-2 text-xs">
            {d.goalsFunding.unlinkedCount} money goal{d.goalsFunding.unlinkedCount === 1 ? '' : 's'} not linked to a job yet — pick one in the
            goal form to see what your sleeves are for.
          </p>
        )}
      </section>

      {/* the six jobs */}
      <section>
        <SectionHeader
          title="Where your money works"
          action={
            d.hasTargets ? (
              <span className={`text-xs font-semibold ${targetSum === 100 ? 'text-income' : 'text-warn'}`}>plan sums to {targetSum}%</span>
            ) : undefined
          }
        />
        <div className="flex flex-col gap-2">
          {d.jobs.map((j) => {
            const meta = JOB_META[j.job]
            const drift = j.status === 'drift'
            return (
              <div key={j.job} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden>{meta.emoji}</span>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{meta.label}</p>
                      <p className="text-[11px] text-muted-foreground">{j.holdings.length} holding{j.holdings.length === 1 ? '' : 's'} · guide {meta.guideline[0]}–{meta.guideline[1]}%</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums">{formatINRCompact(j.valuePaise)}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">{j.pct}% of wealth</p>
                  </div>
                </div>
                <ProgressBar value={Math.min(100, j.pct)} tone={drift ? 'warn' : 'income'} className="mt-2.5 h-1.5" />
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  {j.targetPct != null ? (
                    <span className={drift ? 'font-semibold text-warn' : 'text-muted-foreground'}>
                      target {j.targetPct}% · {drift ? `${j.driftPp! > 0 ? '+' : ''}${j.driftPp}pp off` : 'on track'}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">no target set</span>
                  )}
                  {j.movePaise != null && j.movePaise !== 0 && (
                    <span className={`font-semibold ${j.movePaise > 0 ? 'text-income' : 'text-expense'}`}>
                      {j.movePaise > 0 ? 'add' : 'trim'} {formatINRCompact(Math.abs(j.movePaise))}
                    </span>
                  )}
                </div>
                {j.holdings.length > 0 && (
                  <p className="mt-2 truncate text-[11px] text-muted-foreground">
                    Top: {j.holdings.slice(0, 2).map((h) => h.name).join(', ')}
                    {j.holdings.length > 2 ? ` +${j.holdings.length - 2} more` : ''}
                  </p>
                )}
                {j.goals.length > 0 && (
                  <div className="mt-2.5 border-t pt-2" data-testid={`job-goals-${j.job}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Funds {j.goals.length} goal{j.goals.length === 1 ? '' : 's'}
                    </p>
                    <div className="mt-1.5 flex flex-col gap-1">
                      {j.goals.map((g) => (
                        <div key={g.id} className="flex items-center gap-2 text-xs">
                          <span aria-hidden>{g.emoji}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{g.title}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatMilliMoney(g.contributedMilli)}
                            {g.targetMilli != null ? ` / ${formatMilliMoney(g.targetMilli)}` : ''}
                          </span>
                          <span className={`w-10 shrink-0 text-right font-bold tabular-nums ${g.achieved ? 'text-income' : ''}`}>
                            {g.pct != null ? `${Math.round(g.pct)}%` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {j.outsideGuideline && (
                  <p className="mt-1.5 rounded-lg bg-warn/10 px-2 py-1 text-[11px] text-warn">
                    Outside the framework guideline — {meta.tagline.toLowerCase()}.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* balance moves */}
      {drifting.length > 0 && (
        <section className="rounded-2xl border border-dashed p-4">
          <p className="text-sm font-semibold">Balance moves</p>
          <p className="mb-2 text-xs text-muted-foreground">Informational nudges, not orders — direct new money first (Decision #42).</p>
          <ul className="flex flex-col gap-1.5">
            {drifting.map((j) => (
              <li key={j.job} className="text-sm">
                <span aria-hidden>{JOB_META[j.job].emoji}</span> <span className="font-medium">{JOB_META[j.job].label}</span>{' '}
                <span className={j.movePaise! > 0 ? 'text-income' : 'text-expense'}>
                  {j.movePaise! > 0 ? `add ${formatINR(j.movePaise!)}` : `trim ${formatINR(Math.abs(j.movePaise!))}`}
                </span>{' '}
                <span className="text-xs text-muted-foreground">({Math.abs(j.driftPp ?? 0)}pp from target)</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* income machine */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold">💵 Income machine</p>
        <p className="text-xs text-muted-foreground">Your portfolio&apos;s pseudo-salary — coupons, FD accrual and distributions.</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted p-2">
            <p className="text-[10px] text-muted-foreground uppercase">This month</p>
            <p className="text-sm font-bold tabular-nums">{formatINRCompact(d.income.scheduledThisMonthPaise)}</p>
          </div>
          <div className="rounded-xl bg-muted p-2">
            <p className="text-[10px] text-muted-foreground uppercase">Avg / month</p>
            <p className="text-sm font-bold tabular-nums">{formatINRCompact(d.income.monthlyAveragePaise)}</p>
          </div>
          <div className="rounded-xl bg-muted p-2">
            <p className="text-[10px] text-muted-foreground uppercase">Per year</p>
            <p className="text-sm font-bold tabular-nums">{formatINRCompact(d.income.projectedAnnualPaise)}</p>
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
          <li className="flex justify-between"><span>Bond coupons (avg)</span><span className="tabular-nums">{formatINR(d.income.bondCouponsMonthlyPaise)}</span></li>
          <li className="flex justify-between"><span>FD interest accrual</span><span className="tabular-nums">{formatINR(d.income.fdAccrualMonthlyPaise)}</span></li>
          <li className="flex justify-between"><span>Dividends & interest (12-mo avg)</span><span className="tabular-nums">{formatINR(d.income.distributionMonthlyPaise)}</span></li>
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          FDs accrue toward maturity (not monthly payouts); distributions average the trailing 12 months. A coupon is never a guaranteed total
          return — credit, rate and liquidity risk remain.
        </p>
      </section>

      {/* DICGC exposure */}
      {d.dicgc.rows.length > 0 && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">🏛️ Deposit insurance (DICGC)</p>
            {d.dicgc.overLimitCount > 0 && (
              <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">{d.dicgc.overLimitCount} over limit</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">₹5 lakh insured per depositor per bank — savings + FD + RD aggregate at the same bank.</p>
          <div className="mt-3 flex flex-col gap-2">
            {d.dicgc.rows.map((r) => (
              <div key={r.institution} className="rounded-xl border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{r.institution}</span>
                  <span className="font-bold tabular-nums">{formatINRCompact(r.totalPaise)}</span>
                </div>
                <ProgressBar value={(Math.min(r.totalPaise, DICGC_LIMIT_PAISE) / DICGC_LIMIT_PAISE) * 100} tone={r.overLimit ? 'warn' : 'income'} className="mt-2 h-1.5" />
                <p className={`mt-1 text-[11px] ${r.overLimit ? 'font-medium text-warn' : 'text-muted-foreground'}`}>
                  {r.overLimit
                    ? `₹${((r.totalPaise - DICGC_LIMIT_PAISE) / 100).toLocaleString('en-IN')} above the ₹5L insured limit — consider a ladder across banks`
                    : `Fully within the ₹5L insured limit`}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Insurance is per bank, not per account — verify the bank on the DICGC insured-bank list.</p>
        </section>
      )}

      {/* knowledge layer */}
      <section>
        <SectionHeader title="Decide with full knowledge" />
        <div className="flex flex-col gap-2">
          {KNOWLEDGE_CARDS.map((c) => (
            <div key={c.key} className="overflow-hidden rounded-2xl border bg-card">
              <button
                type="button"
                onClick={() => setOpenCard(openCard === c.key ? null : c.key)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
                aria-expanded={openCard === c.key}
              >
                <span aria-hidden>{c.emoji}</span>
                <span className="flex-1 text-sm font-semibold">{c.title}</span>
                <span className="text-xs text-muted-foreground">{openCard === c.key ? '−' : '+'}</span>
              </button>
              {openCard === c.key && <p className="border-t px-4 py-3 text-sm leading-relaxed text-muted-foreground">{c.body}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* horizon map */}
      <section>
        <SectionHeader title="Match money to a horizon" />
        <div className="overflow-hidden rounded-2xl border bg-card">
          {HORIZON_MAP.map((row, i) => (
            <div key={row.horizon} className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? 'border-t' : ''}`}>
              <span className="text-base" aria-hidden>{row.emoji}</span>
              <div>
                <p className="text-sm font-medium">{row.horizon}</p>
                <p className="text-xs text-muted-foreground">{row.instruments}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <TargetsSheet open={targetsOpen} onOpenChange={setTargetsOpen} current={d} />
    </div>
  )
}

/* ---------- targets editor ---------- */

function TargetsSheet({ open, onOpenChange, current }: { open: boolean; onOpenChange: (o: boolean) => void; current: PlannerOverview }) {
  const save = useSaveTargets({ success: 'Plan saved' })
  const initial = useMemo(() => {
    const t: Record<JobKey, string> = { liquidity: '', safety: '', income: '', growth: '', protection: '', speculation: '' }
    for (const j of current.jobs) if (j.targetPct != null) t[j.job] = String(j.targetPct)
    return t
  }, [current])
  const [values, setValues] = useState<Record<JobKey, string>>(initial)
  const [presetKey, setPresetKey] = useState<string | null>(null)

  const sum = JOBS.reduce((s, j) => s + (parseFloat(values[j]) || 0), 0)
  const sumValid = Math.abs(sum - 100) < 0.5
  const dirty = JOBS.some((j) => (parseFloat(values[j]) || 0) !== (current.jobs.find((x) => x.job === j)?.targetPct ?? 0))

  function applyPreset(key: string) {
    const p = PLAN_PRESETS.find((x) => x.key === key)
    if (!p) return
    setPresetKey(key)
    setValues({
      liquidity: String(p.targets.liquidity),
      safety: String(p.targets.safety),
      income: String(p.targets.income),
      growth: String(p.targets.growth),
      protection: String(p.targets.protection),
      speculation: String(p.targets.speculation),
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Your target plan</DrawerTitle>
          <DrawerDescription>What share of your wealth should each job hold? Six numbers that sum to 100.</DrawerDescription>
        </DrawerHeader>
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
          {!current.hasTargets && (
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Start from a preset</p>
              <div className="flex flex-col gap-1.5">
                {PLAN_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.key)}
                    className={`rounded-xl border p-3 text-left transition-colors ${presetKey === p.key ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
                  >
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{p.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {JOBS.map((j) => (
              <label key={j} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {JOB_META[j].emoji} {JOB_META[j].label}
                </span>
                <div className="relative">
                  <Input
                    inputMode="decimal"
                    value={values[j]}
                    onChange={(e) => {
                      setPresetKey(null)
                      setValues((v) => ({ ...v, [j]: e.target.value }))
                    }}
                    placeholder="0"
                    className="h-10 rounded-xl pr-7"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </label>
            ))}
          </div>

          <p className={`text-center text-sm font-semibold ${sumValid ? 'text-income' : 'text-warn'}`}>
            Sum: {Math.round(sum * 100) / 100}% {sumValid ? '✓' : '— adjust to 100%'}
          </p>

          <Button
            disabled={!sumValid || !dirty || save.isPending}
            onClick={() =>
              save.mutate(
                JOBS.map((j) => ({ job: j, targetPct: parseFloat(values[j]) || 0 })).filter((t) => t.targetPct > 0),
                { onSuccess: () => onOpenChange(false) },
              )
            }
            className="h-12 rounded-xl text-base font-semibold"
          >
            {save.isPending ? 'Saving…' : 'Save plan'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

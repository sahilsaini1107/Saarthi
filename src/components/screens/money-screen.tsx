'use client'

// Money tab hub: net worth, accounts, module links, recent activity.

import { useAccounts, useBills, useBudgets, useFds, useInvestments, useAssets, usePlanner, useRds, useToday, useTrips, useInsurance } from '@/hooks/queries'
import { useUi } from '@/components/saarthi-app'
import { EmptyState, ErrorCard, Money, ProgressBar, SectionHeader, SkeletonRow, utilizationTone } from '@/components/ui/saarthi'
import { Button } from '@/components/ui/button'
import { ACCOUNT_TYPE_LABELS } from '@/lib/constants'
import { formatINRCompact } from '@/lib/money'
import { formatDayLabel } from '@/lib/date'
import { ArrowRight, Banknote, CalendarClock, ChartPie, Compass, Landmark, LineChart, ListOrdered, Mic, FileUp, PiggyBank, Plane, Plus, ShieldCheck, Target } from 'lucide-react'

export function MoneyScreen() {
  const { navigate, openQuickAdd } = useUi()
  const accounts = useAccounts()
  const fds = useFds()
  const rds = useRds()
  const investments = useInvestments()
  const assets = useAssets()
  const bills = useBills()
  const today = useToday()
  const budgets = useBudgets()
  const trips = useTrips()
  const insurance = useInsurance()
  const planner = usePlanner()

  if (accounts.isLoading || today.isLoading) return <SkeletonRow />
  if (accounts.isError) return <ErrorCard message={(accounts.error as Error).message} onRetry={() => accounts.refetch()} />
  if (!accounts.data) return null

  const list = accounts.data
  const todayData = today.data
  const fdTotal = fds.data?.filter((f) => f.status === 'active').reduce((s, f) => s + f.principalPaise, 0) ?? 0
  const rdTotal = rds.data?.filter((r) => r.status === 'active').reduce((s, r) => s + r.valueNowPaise, 0) ?? 0
  const deposits = fdTotal + rdTotal
  const invTotal = investments.data?.reduce((s, i) => s + i.marketValuePaise, 0) ?? 0
  const assetTotal = assets.data?.reduce((s, a) => s + a.currentValuePaise, 0) ?? 0
  const cardOutstanding = list.filter((a) => a.type === 'credit_card').reduce((s, a) => s + a.balancePaise, 0)
  const liquid = list.filter((a) => a.type !== 'credit_card').reduce((s, a) => s + a.balancePaise, 0)
  const net = liquid + deposits + invTotal + assetTotal - cardOutstanding
  const nextBill = bills.data?.filter((b) => b.active).sort((a, b) => a.daysUntilDue - b.daysUntilDue)[0]
  const nextDeposit = [...(fds.data ?? []), ...(rds.data ?? [])].filter((d) => d.status === 'active' && d.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft)[0]
  const budgetTotals = budgets.data?.totals
  const ongoingTrip = (trips.data ?? []).find((t) => t.phase === 'ongoing') ?? (trips.data ?? []).filter((t) => t.phase === 'planned').sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold tracking-tight">Money</h1>
        <button type="button" onClick={() => openQuickAdd()} className="flex h-9 items-center gap-1 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground active:scale-95">
          <Plus className="size-4" /> Quick add
        </button>
      </header>

      {/* net worth */}
      <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
        <p className="text-sm opacity-80">Net worth</p>
        <p className="mt-0.5 text-3xl font-bold tracking-tight tabular-nums">{formatINRCompact(net)}</p>
        <p className="mt-1 text-xs opacity-90">
          {todayData?.netWorthDeltaPaise != null
            ? `${todayData.netWorthDeltaPaise >= 0 ? '▲' : '▼'} ${formatINRCompact(Math.abs(todayData.netWorthDeltaPaise))} vs last snapshot`
            : 'Everything you own, minus what you owe'}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-xs opacity-75">Liquid</p>
            <p className="font-semibold tabular-nums">{formatINRCompact(liquid)}</p>
          </div>
          <div>
            <p className="text-xs opacity-75">Deposits</p>
            <p className="font-semibold tabular-nums">{formatINRCompact(deposits)}</p>
          </div>
          <div>
            <p className="text-xs opacity-75">Cards owed</p>
            <p className="font-semibold tabular-nums">{formatINRCompact(cardOutstanding)}</p>
          </div>
          <div>
            <p className="text-xs opacity-75">Investments</p>
            <p className="font-semibold tabular-nums">{formatINRCompact(invTotal)}</p>
          </div>
          <div>
            <p className="text-xs opacity-75">Real assets</p>
            <p className="font-semibold tabular-nums">{formatINRCompact(assetTotal)}</p>
          </div>
        </div>
      </section>

      {/* accounts */}
      <section>
        <SectionHeader
          title="Accounts"
          action={
            <button type="button" onClick={() => navigate('/money/accounts')} className="flex items-center text-xs font-medium text-primary">
              Manage <ArrowRight className="size-3" />
            </button>
          }
        />
        {list.length === 0 ? (
          <EmptyState
            compact
            emoji="🏦"
            title="No accounts yet"
            body="Add a savings account, cash wallet or credit card."
            action={
              <Button size="sm" className="mt-1 rounded-full" onClick={() => navigate('/money/accounts')}>
                Add account
              </Button>
            }
          />
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {list.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/money/accounts/${a.id}`)}
                className="w-44 shrink-0 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent"
              >
                <div className="flex items-center justify-between">
                  <span className="size-2.5 rounded-full" style={{ background: a.color }} aria-hidden />
                  <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{ACCOUNT_TYPE_LABELS[a.type]}</span>
                </div>
                <p className="mt-2 truncate text-sm font-semibold">{a.name}</p>
                <Money paise={a.balancePaise} className="text-lg font-bold" />
                {a.type === 'credit_card' && a.utilizationPct !== null && (
                  <div className="mt-2">
                    <ProgressBar value={a.utilizationPct} tone={utilizationTone(a.utilizationPct)} className="h-1.5" />
                    <p className="mt-1 text-[10px] text-muted-foreground">{a.utilizationPct}% of limit used</p>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* module links */}
      <section className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => navigate('/money/planner')} className="col-span-2 flex items-center gap-3 rounded-2xl bg-primary p-4 text-left text-primary-foreground transition-opacity hover:opacity-95">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Compass className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Planner · every rupee has a job</p>
            <p className="truncate text-xs opacity-90">
              {planner.data
                ? planner.data.health === 'drift'
                  ? `${planner.data.jobs.filter((j) => j.status === 'drift').length} bucket(s) drifting · income ${formatINRCompact(planner.data.income.monthlyAveragePaise)}/mo`
                  : planner.data.health === 'aligned'
                    ? `On plan · income ${formatINRCompact(planner.data.income.monthlyAveragePaise)}/mo`
                    : 'See your six-job allocation and set targets'
                : 'See your six-job allocation and set targets'}
            </p>
          </div>
          <ArrowRight className="ml-auto size-4 shrink-0 opacity-80" />
        </button>
        <button type="button" onClick={() => navigate('/money/invest')} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <span className="flex size-10 items-center justify-center rounded-xl bg-income/10 text-income">
            <LineChart className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Invest</p>
            <p className="text-xs text-muted-foreground">
              {investments.data?.length || assets.data?.length
                ? `${formatINRCompact(invTotal + assetTotal)} across markets & assets`
                : 'Stocks, crypto, property…'}
            </p>
          </div>
        </button>
        <button type="button" onClick={() => navigate('/money/fds')} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Landmark className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Deposits</p>
            <p className="text-xs text-muted-foreground">
              {fds.data?.length || rds.data?.length
                ? `${(fds.data?.length ?? 0) + (rds.data?.length ?? 0)} tracked · next ${nextDeposit ? formatDayLabel(nextDeposit.maturityDate) : '—'}`
                : 'FD & RD ladder'}
            </p>
          </div>
        </button>
        <button type="button" onClick={() => navigate('/money/bills')} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <span className="flex size-10 items-center justify-center rounded-xl bg-warn/10 text-warn">
            <CalendarClock className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Bills</p>
            <p className="text-xs text-muted-foreground">
              {nextBill ? `Next: ${nextBill.name} · ${nextBill.daysUntilDue < 0 ? 'overdue' : `in ${nextBill.daysUntilDue}d`}` : 'Nothing scheduled'}
            </p>
          </div>
        </button>
        <button type="button" onClick={() => navigate('/money/overview')} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
            <ChartPie className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Overview</p>
            <p className="text-xs text-muted-foreground">
              {todayData ? `${formatINRCompact(todayData.monthSpendPaise)} this month` : 'Monthly spending'}
            </p>
          </div>
        </button>
        <button type="button" onClick={() => navigate('/money/budgets')} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <span className="flex size-10 items-center justify-center rounded-xl bg-expense/10 text-expense">
            <Target className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Budgets</p>
            <p className="text-xs text-muted-foreground">
              {budgetTotals && budgetTotals.budgetPaise > 0
                ? `${formatINRCompact(budgetTotals.spentPaise)} of ${formatINRCompact(budgetTotals.budgetPaise)}${budgetTotals.overCount ? ` · ${budgetTotals.overCount} over` : ''}`
                : 'Monthly caps per category'}
            </p>
          </div>
        </button>
        <button type="button" onClick={() => navigate('/money/travel')} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Plane className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Travel</p>
            <p className="text-xs text-muted-foreground">
              {ongoingTrip
                ? `${ongoingTrip.emoji} ${ongoingTrip.name}${ongoingTrip.budgetPaise != null ? ` · ${formatINRCompact(ongoingTrip.spentPaise)} spent` : ''}`
                : (trips.data?.length ?? 0) > 0
                  ? `${trips.data?.length} trip${(trips.data?.length ?? 0) === 1 ? '' : 's'} tracked`
                  : 'Trips with budgets'}
            </p>
          </div>
        </button>
        <button type="button" onClick={() => navigate('/money/insurance')} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <span className="flex size-10 items-center justify-center rounded-xl bg-expense/10 text-expense">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Insurance</p>
            <p className="text-xs text-muted-foreground">
              {insurance.data && insurance.data.summary.policyCount > 0
                ? `${insurance.data.summary.policyCount} ${insurance.data.summary.policyCount === 1 ? 'policy' : 'policies'} · ${formatINRCompact(insurance.data.summary.totalSumAssuredPaise)} cover${insurance.data.summary.attentionCount ? ` · ${insurance.data.summary.attentionCount} due soon` : ''}`
                : 'Policies & premium reminders'}
            </p>
          </div>
        </button>
        <button type="button" onClick={() => navigate('/money/capture')} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mic className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Capture</p>
            <p className="text-xs text-muted-foreground">Voice · photo · paste a message</p>
          </div>
        </button>
        <button type="button" onClick={() => navigate('/money/import')} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
            <FileUp className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Import CSV</p>
            <p className="text-xs text-muted-foreground">Bank statements with dedupe</p>
          </div>
        </button>
        <button type="button" onClick={() => navigate('/money/transactions')} className="col-span-2 flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
            <ListOrdered className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Transactions</p>
            <p className="text-xs text-muted-foreground">Search, filter, edit</p>
          </div>
        </button>
      </section>

      <p className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed p-3 text-center text-xs text-muted-foreground">
        <Banknote className="size-3.5" /> All data stays yours — no bank linking, ever.
      </p>
    </div>
  )
}

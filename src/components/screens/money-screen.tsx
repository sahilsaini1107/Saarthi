'use client'

// Money tab hub: net worth, accounts, module links, recent activity.

import { useState } from 'react'
import { useAccounts, useBills, useBudgets, useFds, useInvestments, useAssets, usePlanner, useRds, useToday, useTrips, useInsurance } from '@/hooks/queries'
import { useUi } from '@/components/saarthi-app'
import { EmptyState, ErrorCard, Money, ProgressBar, SectionHeader, SkeletonRow, utilizationTone } from '@/components/ui/saarthi'
import { Button } from '@/components/ui/button'
import { ACCOUNT_TYPE_LABELS } from '@/lib/constants'
import { formatINRCompact } from '@/lib/money'
import { formatDayLabel } from '@/lib/date'
import { ArrowRight, Banknote, CalendarClock, ChartPie, Compass, Landmark, LineChart, ListOrdered, Mic, Plane, Plus, ShieldCheck, Target } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MoneyCard {
  path: string
  icon: LucideIcon
  title: string
  sub: string
}

/** One money hub tile. Shared so every section renders identically. */
function MoneyTile({ card, onClick }: { card: MoneyCard; onClick: () => void }) {
  const Icon = card.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{card.title}</p>
        <p className="truncate text-xs text-muted-foreground">{card.sub}</p>
      </div>
    </button>
  )
}

export function MoneyScreen() {
  const { navigate, openQuickAdd } = useUi()
  const [showMore, setShowMore] = useState(false)
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

  const moneySections: { id: string; label: string; cards: MoneyCard[] }[] = [
    {
      id: 'everyday',
      label: 'Everyday',
      cards: [
        { path: '/money/transactions', icon: ListOrdered, title: 'Transactions', sub: 'Search, filter, edit' },
        {
          path: '/money/bills',
          icon: CalendarClock,
          title: 'Bills',
          sub: nextBill
            ? `Next: ${nextBill.name} \u00b7 ${nextBill.daysUntilDue < 0 ? 'overdue' : `in ${nextBill.daysUntilDue}d`}`
            : 'Nothing scheduled',
        },
        {
          path: '/money/budgets',
          icon: Target,
          title: 'Budgets',
          sub:
            budgetTotals && budgetTotals.budgetPaise > 0
              ? `${formatINRCompact(budgetTotals.spentPaise)} of ${formatINRCompact(budgetTotals.budgetPaise)}${budgetTotals.overCount ? ` \u00b7 ${budgetTotals.overCount} over` : ''}`
              : 'Monthly caps per category',
        },
        // One tile, not two: /money/capture and /money/import are the same
        // screen with a different opening tab.
        { path: '/money/capture', icon: Mic, title: 'Capture', sub: 'Voice \u00b7 photo \u00b7 paste \u00b7 CSV import' },
      ],
    },
    {
      id: 'grow',
      label: 'Grow it',
      cards: [
        {
          path: '/money/invest',
          icon: LineChart,
          title: 'Invest',
          sub:
            investments.data?.length || assets.data?.length
              ? `${formatINRCompact(invTotal + assetTotal)} across markets & assets`
              : 'Stocks, crypto, property\u2026',
        },
        {
          path: '/money/fds',
          icon: Landmark,
          title: 'Deposits',
          sub:
            fds.data?.length || rds.data?.length
              ? `${(fds.data?.length ?? 0) + (rds.data?.length ?? 0)} tracked \u00b7 next ${nextDeposit ? formatDayLabel(nextDeposit.maturityDate) : '\u2014'}`
              : 'FD & RD ladder',
        },
      ],
    },
    {
      id: 'review',
      label: 'Review',
      cards: [
        {
          path: '/money/overview',
          icon: ChartPie,
          title: 'Overview',
          sub: todayData ? `${formatINRCompact(todayData.monthSpendPaise)} this month` : 'Monthly spending',
        },
        // Reports spans money, growth and reflection but used to be reachable
        // only from a tile inside the Growth hub, where nobody would find it.
        { path: '/reports', icon: ChartPie, title: 'Reports', sub: 'Per-domain \u00b7 monthly Life Report \u00b7 PDF' },
      ],
    },
  ]

  const moneyMore: MoneyCard[] = [
    {
      path: '/money/travel',
      icon: Plane,
      title: 'Travel',
      sub: ongoingTrip
        ? `${ongoingTrip.emoji} ${ongoingTrip.name}`
        : (trips.data?.length ?? 0) > 0
          ? `${trips.data?.length} trip${(trips.data?.length ?? 0) === 1 ? '' : 's'} tracked`
          : 'Trips & trip expenses',
    },
    {
      path: '/money/insurance',
      icon: ShieldCheck,
      title: 'Insurance',
      sub:
        insurance.data && insurance.data.summary.policyCount > 0
          ? `${insurance.data.summary.policyCount} ${insurance.data.summary.policyCount === 1 ? 'policy' : 'policies'}${insurance.data.summary.attentionCount ? ` \u00b7 ${insurance.data.summary.attentionCount} due soon` : ''}`
          : 'Policies & premium reminders',
    },
  ]

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

      {/* Planner stays a full-width feature card: it is the one screen that
          frames every other number on this tab. */}
      <button
        type="button"
        onClick={() => navigate('/money/planner')}
        className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-left text-primary-foreground transition-opacity hover:opacity-95"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Compass className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Planner \u00b7 every rupee has a job</p>
          <p className="truncate text-xs opacity-90">
            {planner.data
              ? planner.data.health === 'drift'
                ? `${planner.data.jobs.filter((j) => j.status === 'drift').length} bucket(s) drifting`
                : planner.data.health === 'aligned'
                  ? 'All buckets aligned'
                  : 'Set your targets'
              : 'Give every rupee a job'}
          </p>
        </div>
      </button>

      {/* Grouped by how often you reach for them, with the once-a-year things
          tucked behind "More" rather than competing with the daily ledger. */}
      {moneySections.map((section) => (
        <section key={section.id}>
          <SectionHeader title={section.label} />
          <div className="grid grid-cols-2 gap-3">
            {section.cards.map((c) => (
              <MoneyTile key={c.path} card={c} onClick={() => navigate(c.path)} />
            ))}
          </div>
        </section>
      ))}

      <section>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-dashed px-4 py-3 text-left"
          aria-expanded={showMore}
        >
          <span className="text-sm font-semibold">More</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {moneyMore.length} more
            <ArrowRight className={cn('size-4 transition-transform', showMore && 'rotate-90')} />
          </span>
        </button>
        {showMore && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {moneyMore.map((c) => (
              <MoneyTile key={c.path} card={c} onClick={() => navigate(c.path)} />
            ))}
          </div>
        )}
      </section>

      <p className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed p-3 text-center text-xs text-muted-foreground">
        <Banknote className="size-3.5" /> All data stays yours — no bank linking, ever.
      </p>
    </div>
  )
}

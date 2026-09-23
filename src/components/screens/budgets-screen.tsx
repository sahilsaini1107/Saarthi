'use client'

// Budgets (Phase 5.1) — recurring monthly caps per category with live pace
// tracking: spent vs budget, calendar pace, month-end projection and a
// safe-per-day figure when a budget is at risk.

import { useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { useBudgets } from '@/hooks/queries'
import { BudgetFormSheet } from '@/components/money/budget-form-sheet'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorCard, Money, ProgressBar, SectionHeader, SkeletonRow, StatTile } from '@/components/ui/saarthi'
import { BUDGET_BAND_META } from '@/lib/constants'
import { formatINRCompact } from '@/lib/money'
import { formatMonthLabel } from '@/lib/date'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BudgetWithStatus } from '@/services/budgets'

export function BudgetsScreen() {
  const budgets = useBudgets()
  const [sheet, setSheet] = useState<{ open: boolean; budget: BudgetWithStatus | null }>({ open: false, budget: null })

  if (budgets.isLoading) return <SkeletonRow />
  if (budgets.isError) return <ErrorCard message={(budgets.error as Error).message} onRetry={() => budgets.refetch()} />

  const d = budgets.data
  const list = d?.budgets ?? []
  const totalMeta = BUDGET_BAND_META[d?.totals.band ?? 'none']

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
        <Button size="sm" className="h-9 rounded-full" onClick={() => setSheet({ open: true, budget: null })}>
          <Plus className="size-4" /> Set budget
        </Button>
      </header>

      {list.length === 0 ? (
        <EmptyState
          emoji="🎯"
          title="No budgets yet"
          body="Pick your spending hotspots — food, shopping, transport — and give each one a monthly cap. Saarthi warns you before you cross the line."
          action={
            <Button size="sm" className="mt-2 rounded-full" onClick={() => setSheet({ open: true, budget: null })}>
              Set your first budget
            </Button>
          }
        />
      ) : (
        <>
          {/* month summary */}
          <section className="grid grid-cols-2 gap-3">
            <StatTile
              label={`Spent · ${d ? formatMonthLabel(d.monthKey).split(' ')[0] : ''}`}
              value={formatINRCompact(d?.totals.spentPaise ?? 0)}
              sub={`of ${formatINRCompact(d?.totals.budgetPaise ?? 0)} budgeted`}
              tone={d?.totals.band === 'over' ? 'expense' : undefined}
            />
            <StatTile
              label="Status"
              value={totalMeta.label}
              sub={
                d?.totals.overCount
                  ? `${d.totals.overCount} over · ${d.totals.watchCount} on watch`
                  : d?.totals.watchCount
                    ? `${d.totals.watchCount} ahead of pace`
                    : 'All categories in line'
              }
            />
          </section>

          <section>
            <SectionHeader title="By category" />
            <div className="flex flex-col gap-2">
              {list.map((b) => (
                <BudgetRow key={b.id} budget={b} onEdit={() => setSheet({ open: true, budget: b })} />
              ))}
            </div>
          </section>

          <p className="rounded-2xl border border-dashed p-3 text-center text-xs text-muted-foreground">
            Pace compares your spending with the calendar: half-way through the month, half the budget is on pace.
          </p>
        </>
      )}

      <BudgetFormSheet open={sheet.open} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} budget={sheet.budget} />
    </div>
  )
}

function BudgetRow({ budget: b, onEdit }: { budget: BudgetWithStatus; onEdit: () => void }) {
  const meta = BUDGET_BAND_META[b.band] ?? BUDGET_BAND_META.none
  const tone = meta.tone
  const pct = b.spentPct ?? 0
  return (
    <button type="button" onClick={onEdit} className="rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: `${b.categoryColor}1A` }} aria-hidden>
            {b.categoryEmoji}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{b.categoryName}</p>
            <p className="text-xs text-muted-foreground">
              <Money paise={b.spentPaise} className="font-medium" /> of {formatINRCompact(b.amountPaise)}
              {b.projectedPaise != null && b.band !== 'over' ? ` · trending ${formatINRCompact(b.projectedPaise)}` : ''}
            </p>
          </div>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-bold', meta.className)}>{meta.label.toUpperCase()}</span>
      </div>
      <div className="mt-2.5">
        <ProgressBar value={Math.min(pct, 100)} tone={tone} className="h-2" />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {pct}% used · calendar at {b.expectedPct}%
          </span>
          {b.band !== 'over' && b.safePerDayPaise > 0 && b.daysLeft > 0 && (
            <span>{formatINRCompact(b.safePerDayPaise)}/day left · {b.daysLeft}d</span>
          )}
          {b.band === 'over' && <span className="font-semibold text-expense">{formatINRCompact(b.spentPaise - b.amountPaise)} over</span>}
        </div>
      </div>
    </button>
  )
}

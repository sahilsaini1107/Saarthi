'use client'

// Trip detail (Phase 5.2) — budget progress, daily spend bars (pure CSS),
// category split, and the trip's transaction ledger. "Add expense" opens
// quick-add with the trip pre-attached.

import { useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { useSetTxnTrip, useTrip } from '@/hooks/queries'
import { TripFormSheet } from '@/components/money/trip-form-sheet'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorCard, Money, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { TRIP_PHASE_META } from '@/lib/constants'
import { formatINRCompact } from '@/lib/money'
import { formatDayLabel } from '@/lib/date'
import { Pencil, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TripDetailScreen({ tripId }: { tripId: string }) {
  const { navigate, openQuickAdd } = useUi()
  const trip = useTrip(tripId)
  const setTrip = useSetTxnTrip()
  const [editOpen, setEditOpen] = useState(false)

  if (trip.isLoading) return <SkeletonRow />
  if (trip.isError) return <ErrorCard message={(trip.error as Error).message} onRetry={() => trip.refetch()} />
  if (!trip.data) return <EmptyState compact emoji="🧳" title="Trip not found" body="It may have been removed." action={<Button size="sm" variant="outline" className="mt-2 rounded-full" onClick={() => navigate('/money/travel')}>Back to travel</Button>} />

  const d = trip.data
  const meta = TRIP_PHASE_META[d.phase]
  const over = d.remainingPaise != null && d.remainingPaise < 0
  const maxDay = Math.max(...d.daySeries.map((p) => p.outPaise), 1)
  const dayLabel = (iso: string) => formatDayLabel(iso).replace(/^[A-Za-z]+, /, '')

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between px-1">
        <button type="button" onClick={() => navigate('/money/travel')} className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ← Travel
        </button>
        <Button size="sm" variant="outline" className="h-9 rounded-full" onClick={() => setEditOpen(true)}>
          <Pencil className="size-3.5" /> Edit
        </Button>
      </header>

      {/* hero */}
      <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-2xl" aria-hidden>
              {d.emoji}
            </p>
            <p className="mt-1 truncate text-lg font-bold tracking-tight">{d.name}</p>
            <p className="text-xs opacity-90">
              {d.destination ? `${d.destination} · ` : ''}
              {formatDayLabel(d.startDate)}
              {d.endDate ? ` → ${formatDayLabel(d.endDate)}` : ' · open-ended'}
              {d.phase === 'ongoing' ? ` · day ${d.durationDays - (d.daysLeft ?? 1) + 1} of ${d.durationDays}` : ` · ${d.durationDays}d`}
            </p>
          </div>
          <span className={cn('shrink-0 rounded-full bg-background/20 px-2 py-1 text-[10px] font-bold', d.phase === 'past' && 'opacity-90')}>
            {meta.label.toUpperCase()}
          </span>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-xs opacity-80">Spent on this trip</p>
            <Money paise={d.spentPaise} className="text-3xl font-bold" />
          </div>
          {d.budgetPaise != null && (
            <p className={cn('text-sm font-semibold', over && 'text-warn')}>
              {over ? `${formatINRCompact(-(d.remainingPaise ?? 0))} over` : `${formatINRCompact(d.remainingPaise ?? 0)} left`}
            </p>
          )}
        </div>
        {d.budgetPaise != null && d.budgetPaise > 0 && (
          <div className="mt-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-background/25">
              <div
                className={cn('h-full rounded-full transition-all', over ? 'bg-warn' : 'bg-primary-foreground')}
                style={{ width: `${Math.min(Math.round((d.spentPaise / d.budgetPaise) * 100), 100)}%` }}
              />
            </div>
          </div>
        )}
        <Button
          size="sm"
          className="mt-4 h-9 rounded-full bg-primary-foreground text-primary hover:bg-primary-foreground/90"
          onClick={() => openQuickAdd(undefined, { tripId: d.id })}
        >
          <Plus className="size-4" /> Add expense
        </Button>
      </section>

      {/* daily bars */}
      {d.daySeries.length > 0 && (
        <section>
          <SectionHeader title="Daily spend" />
          <div className="rounded-2xl border bg-card p-4">
            <div className="flex h-28 items-end gap-1" role="img" aria-label={`Daily spending from ${d.daySeries[0].iso} to ${d.daySeries[d.daySeries.length - 1].iso}`}>
              {d.daySeries.map((p) => (
                <div key={p.iso} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className={cn('w-full rounded-t-sm transition-all', p.outPaise > 0 ? 'bg-primary' : 'bg-muted')}
                    style={{ height: `${Math.max((p.outPaise / maxDay) * 88, p.outPaise > 0 ? 8 : 2)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{dayLabel(d.daySeries[0].iso)}</span>
              {d.peakDay && <span className="font-semibold text-primary">peak {dayLabel(d.peakDay)}</span>}
              <span>{dayLabel(d.daySeries[d.daySeries.length - 1].iso)}</span>
            </div>
          </div>
        </section>
      )}

      {/* by category */}
      {d.byCategory.length > 0 && (
        <section>
          <SectionHeader title="By category" />
          <div className="flex flex-col gap-1.5 rounded-2xl border bg-card p-4">
            {d.byCategory.map((c) => (
              <div key={c.categoryId ?? 'uncat'} className="flex items-center justify-between gap-3 py-1.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-base" style={{ background: `${c.color}1A` }} aria-hidden>
                    {c.emoji}
                  </span>
                  <p className="truncate text-sm font-medium">{c.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{Math.round((c.outPaise / Math.max(d.spentPaise, 1)) * 100)}%</span>
                  <Money paise={c.outPaise} className="text-sm font-semibold" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ledger */}
      <section>
        <SectionHeader title={`Expenses (${d.transactions.length})`} />
        {d.transactions.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nothing logged under this trip yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {d.transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
                    {t.categoryEmoji ?? '❓'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.categoryName ?? 'Uncategorised'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.note || t.accountName} · {formatDayLabel(t.date)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Money paise={t.amountPaise} signed={t.direction as 'in' | 'out'} className="text-sm font-semibold" />
                  <button
                    type="button"
                    aria-label="Remove from trip"
                    disabled={setTrip.isPending}
                    onClick={() => setTrip.mutate({ id: t.id, tripId: null })}
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-expense/10 hover:text-expense"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {d.notes && <p className="rounded-2xl border border-dashed p-3 text-xs text-muted-foreground">📌 {d.notes}</p>}

      <TripFormSheet open={editOpen} onOpenChange={setEditOpen} trip={d} />
    </div>
  )
}

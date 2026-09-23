'use client'

// Travel (Phase 5.2) — trips with derived phase (planned/ongoing/past),
// budget tracking, and per-trip detail with daily bars + category split.

import { useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { useTrips } from '@/hooks/queries'
import { TripFormSheet } from '@/components/money/trip-form-sheet'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorCard, Money, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { TRIP_PHASE_META } from '@/lib/constants'
import { formatINRCompact } from '@/lib/money'
import { formatDayLabel } from '@/lib/date'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TripSummary } from '@/services/trips'

export function TravelScreen() {
  const { navigate } = useUi()
  const trips = useTrips()
  const [sheet, setSheet] = useState<{ open: boolean; trip: TripSummary | null }>({ open: false, trip: null })

  if (trips.isLoading) return <SkeletonRow />
  if (trips.isError) return <ErrorCard message={(trips.error as Error).message} onRetry={() => trips.refetch()} />

  const list = trips.data ?? []
  const ongoing = list.filter((t) => t.phase === 'ongoing')
  const planned = list.filter((t) => t.phase === 'planned')
  const past = list.filter((t) => t.phase === 'past')

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold tracking-tight">Travel</h1>
        <Button size="sm" className="h-9 rounded-full" onClick={() => setSheet({ open: true, trip: null })}>
          <Plus className="size-4" /> New trip
        </Button>
      </header>

      {list.length === 0 ? (
        <EmptyState
          emoji="🧳"
          title="No trips yet"
          body="Planning a getaway? Create the trip, set a budget, and tag expenses to it — the trip total keeps itself honest."
          action={
            <Button size="sm" className="mt-2 rounded-full" onClick={() => setSheet({ open: true, trip: null })}>
              Plan your first trip
            </Button>
          }
        />
      ) : (
        <>
          {ongoing.length > 0 && (
            <section>
              <SectionHeader title="Happening now" />
              <div className="flex flex-col gap-2">
                {ongoing.map((t) => (
                  <TripCard key={t.id} trip={t} onClick={() => navigate(`/money/travel/${t.id}`)} />
                ))}
              </div>
            </section>
          )}

          {planned.length > 0 && (
            <section>
              <SectionHeader title="Upcoming" />
              <div className="flex flex-col gap-2">
                {planned.map((t) => (
                  <TripCard key={t.id} trip={t} onClick={() => navigate(`/money/travel/${t.id}`)} />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <SectionHeader title="Past" />
              <div className="flex flex-col gap-2">
                {past.map((t) => (
                  <TripCard key={t.id} trip={t} onClick={() => navigate(`/money/travel/${t.id}`)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <TripFormSheet open={sheet.open} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} trip={sheet.trip} />
    </div>
  )
}

function TripCard({ trip: t, onClick }: { trip: TripSummary; onClick: () => void }) {
  const meta = TRIP_PHASE_META[t.phase]
  const over = t.remainingPaise != null && t.remainingPaise < 0 && t.phase === 'ongoing'
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl" aria-hidden>
            {t.emoji}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{t.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t.destination ? `${t.destination} · ` : ''}
              {formatDayLabel(t.startDate)}
              {t.endDate ? ` → ${formatDayLabel(t.endDate)}` : ' · open-ended'}
            </p>
          </div>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-bold', meta.className)}>{meta.label.toUpperCase()}</span>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <Money paise={t.spentPaise} className="text-lg font-bold" />
          <span className="text-xs text-muted-foreground"> spent{t.budgetPaise != null ? ` of ${formatINRCompact(t.budgetPaise)}` : ''}</span>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          {t.phase === 'planned' && t.daysUntilStart != null && (
            <span className="font-semibold text-primary">starts in {t.daysUntilStart}d</span>
          )}
          {t.phase === 'ongoing' && (
            <span>
              {t.daysLeft != null ? `${t.daysLeft}d left` : 'open-ended'} · {t.durationDays}d trip
            </span>
          )}
          {t.phase === 'past' && <span>{t.txnCount} expense{t.txnCount === 1 ? '' : 's'}</span>}
        </div>
      </div>

      {t.budgetPaise != null && t.budgetPaise > 0 && (
        <div className="mt-2">
          <ProgressBar
            value={Math.min(Math.round((t.spentPaise / t.budgetPaise) * 100), 100)}
            tone={over ? 'expense' : 'primary'}
            className="h-2"
          />
          <p className={cn('mt-1 text-[11px]', over ? 'font-semibold text-expense' : 'text-muted-foreground')}>
            {over
              ? `${formatINRCompact(-(t.remainingPaise ?? 0))} over budget`
              : t.phase !== 'past'
                ? `${formatINRCompact(t.remainingPaise ?? 0)} remaining`
                : `${formatINRCompact(t.remainingPaise ?? 0)} under budget`}
          </p>
        </div>
      )}
    </button>
  )
}

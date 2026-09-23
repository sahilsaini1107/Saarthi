'use client'

// JournalPanel — the goal-level daily journal section inside an expanded
// goal card (Phase 11). Aggregates every milestone's logged minutes into
// one GitHub-style effort grid, with streaks and full-history weekly/monthly
// roll-ups (Decision #43). Tap any past cell to log or edit that day.

import { Clock, Flame } from 'lucide-react'
import { ErrorCard, SkeletonRow } from '@/components/ui/saarthi'
import { EffortRollup } from '@/components/ui/effort-rollup'
import { ContributionGrid } from '@/components/growth/contribution-grid'
import { formatMinutes } from '@/lib/effort-grid'
import type { GoalGridDayDTO, GoalJournalDTO } from '@/lib/types'

export function JournalPanel({
  journal,
  isLoading,
  error,
  onRetry,
  onPickDay,
}: {
  journal: GoalJournalDTO | undefined
  isLoading: boolean
  error: Error | null
  onRetry: () => void
  onPickDay: (iso: string) => void
}) {
  if (isLoading) return <SkeletonRow />
  if (error || !journal) return <ErrorCard message={(error as Error)?.message ?? 'Could not load the journal'} onRetry={onRetry} />

  const { stats, rollups, goal } = journal
  // journal minutes flow through the shared grid as milli-units (only the
  // level and the tap target matter; labels are re-formatted to time)
  const days: GoalGridDayDTO[] = journal.days.map((d) => ({
    iso: d.iso,
    amountMilli: d.minutes,
    tasksDone: 0,
    level: d.level,
    future: d.future,
  }))

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3" data-testid="journal-panel">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Clock className="size-3.5" /> DAILY JOURNAL
        </p>
        <p className="text-[10px] text-muted-foreground">hours across milestones</p>
      </div>

      {/* stats strip */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/50 px-2 py-2">
          <p className="text-[10px] font-medium text-muted-foreground">Total time</p>
          <p className="truncate text-sm font-bold tabular-nums">{formatMinutes(stats.totalMinutes)}</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-2 py-2">
          <p className="flex items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground">
            <Flame className="size-3 text-warn" /> Streak
          </p>
          <p className="text-sm font-bold tabular-nums">
            {stats.currentStreak} <span className="text-[10px] font-normal text-muted-foreground">· best {stats.bestStreak}</span>
          </p>
        </div>
        <div className="rounded-xl bg-muted/50 px-2 py-2">
          <p className="text-[10px] font-medium text-muted-foreground">Days logged</p>
          <p className="text-sm font-bold tabular-nums">{stats.daysLogged}</p>
        </div>
      </div>

      <ContributionGrid
        days={days}
        pad={journal.pad}
        labels={journal.labels}
        color={goal.color}
        onPick={onPickDay}
        selectedIso={journal.today}
        formatValue={(m) => formatMinutes(m)}
      />

      <EffortRollup rollups={rollups} format={(m) => formatMinutes(m)} />
      <p className="text-[10px] text-muted-foreground">
        Each square is a journaled day across all milestones — tap any day to log or fix it.
      </p>
    </div>
  )
}

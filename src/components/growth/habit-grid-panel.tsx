'use client'

// HabitGridPanel — the GitHub-style effort grid inside an expanded habit
// card (Phase 10). Check-ins are binary: a done day renders a full block,
// everything else stays empty (misses are honest, rest days aren't misses).
// Tapping a scheduled past day toggles its check-in — same <10s flow as
// the big check-in button, just with a year of context around it.

import { useCheckInHabit, useHabitGrid } from '@/hooks/queries'
import { ErrorCard, SkeletonRow } from '@/components/ui/saarthi'
import { EffortRollup } from '@/components/ui/effort-rollup'
import { ContributionGrid } from '@/components/growth/contribution-grid'
import { formatDayLabel } from '@/lib/date'
import type { GoalGridDayDTO } from '@/lib/types'

export function HabitGridPanel({ habitId, color }: { habitId: string; color: string }) {
  const q = useHabitGrid(habitId)
  const checkin = useCheckInHabit({ success: 'Check-in updated' })

  if (q.isLoading) return <SkeletonRow />
  if (q.isError || !q.data) return <ErrorCard message={(q.error as Error)?.message ?? 'Could not load the grid'} onRetry={() => q.refetch()} />

  const { habit, days, pad, labels, rollups, stats, window: win } = q.data

  // adapt the habit day shape to the shared grid DTO: amountMilli carries
  // the 0|1 check-in value; only scheduled non-future days are toggleable
  const gridDays: GoalGridDayDTO[] = days.map((d) => ({
    iso: d.iso,
    amountMilli: d.value,
    tasksDone: 0,
    level: d.level,
    future: d.future,
    pickable: d.scheduled,
  }))

  function pick(iso: string) {
    if (checkin.isPending) return
    checkin.mutate({ habitId, date: iso })
  }

  return (
    <div className="flex flex-col gap-2.5 border-t px-3.5 py-3" data-testid="habit-grid-panel">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Effort grid</p>
        {win && (
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {formatDayLabel(win.start)} → {formatDayLabel(win.end)}
          </p>
        )}
      </div>

      <ContributionGrid
        days={gridDays}
        pad={pad}
        labels={labels}
        color={habit.color || color}
        onPick={pick}
        selectedIso={stats.doneToday ? q.data.today : null}
        formatValue={(v) => (v > 0 ? 'Done' : 'Not done')}
      />

      <EffortRollup rollups={rollups} format={(v) => `${v}`} />

      <p className="text-[10px] text-muted-foreground">
        {stats.streak}-day streak · best {stats.longest} · {Math.round(stats.rate30 * 100)}% last 30 days — tap a
        scheduled day to toggle its check-in.
      </p>
    </div>
  )
}

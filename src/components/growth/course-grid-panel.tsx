'use client'

// CourseGridPanel — the GitHub-style effort grid inside an expanded course
// card (Phase 10). Each cell is that day's TOTAL study minutes; intensity
// levels come from quartiles of the nonzero days (no preset target), so the
// grid re-scales to the learner's own rhythm. Tapping a past day points the
// session logger at that date (parent supplies onPick / selectedIso).

import { useCourseGrid } from '@/hooks/queries'
import { ErrorCard, SkeletonRow } from '@/components/ui/saarthi'
import { EffortRollup } from '@/components/ui/effort-rollup'
import { ContributionGrid } from '@/components/growth/contribution-grid'
import { formatMinutes } from '@/lib/effort-grid'
import { formatDayLabel } from '@/lib/date'
import type { GoalGridDayDTO } from '@/lib/types'

export function CourseGridPanel({
  courseId,
  color,
  onPick,
  selectedIso,
}: {
  courseId: string
  color: string
  onPick?: (iso: string) => void
  selectedIso?: string | null
}) {
  const q = useCourseGrid(courseId)

  if (q.isLoading) return <SkeletonRow />
  if (q.isError || !q.data) return <ErrorCard message={(q.error as Error)?.message ?? 'Could not load the grid'} onRetry={() => q.refetch()} />

  const { course, days, pad, labels, rollups, stats, window: win } = q.data

  // adapt minutes/day to the shared grid DTO
  const gridDays: GoalGridDayDTO[] = days.map((d) => ({
    iso: d.iso,
    amountMilli: d.value,
    tasksDone: 0,
    level: d.level,
    future: d.future,
  }))

  return (
    <div className="flex flex-col gap-2.5" data-testid="course-grid-panel">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study grid</p>
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
        color={course.color || color}
        onPick={onPick ? (iso) => onPick(iso) : undefined}
        selectedIso={selectedIso}
        formatValue={formatMinutes}
      />

      <EffortRollup rollups={rollups} format={formatMinutes} />

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/50 px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground">Total</p>
          <p className="text-sm font-bold tabular-nums">{formatMinutes(stats.totalMinutes)}</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground">This week</p>
          <p className="text-sm font-bold tabular-nums">{formatMinutes(stats.minutes7d)}</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground">Avg / study day</p>
          <p className="text-sm font-bold tabular-nums">{stats.avgActiveDayMinutes != null ? formatMinutes(stats.avgActiveDayMinutes) : '—'}</p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        {stats.activeDays} study day{stats.activeDays === 1 ? '' : 's'} so far — tap a day to log minutes against it;
        darker means more study.
      </p>
    </div>
  )
}

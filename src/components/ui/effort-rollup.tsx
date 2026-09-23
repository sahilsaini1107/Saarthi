'use client'

// EffortRollup — the weekly/monthly roll-up strip under every effort grid
// (Phase 10). Full-history aggregates (never window-capped, Decision #43):
// the current week/month is included and simply runs to today. activeDays
// is shown only when it differs from the value's unit (e.g. "2h 10m · 3
// days" for study; hidden for binary habits where value == days).

import { formatDayLabel } from '@/lib/date'
import type { RollupsDTO } from '@/lib/types'

export function EffortRollup({ rollups, format }: { rollups: RollupsDTO; format: (value: number) => string }) {
  const thisWeek = rollups.weeks[rollups.weeks.length - 1]
  const lastWeek = rollups.weeks[rollups.weeks.length - 2]
  const thisMonth = rollups.months[rollups.months.length - 1]
  const lastMonth = rollups.months[rollups.months.length - 2]

  const cells: { label: string; value: number; activeDays: number }[] = []
  if (thisWeek) cells.push({ label: 'This week', value: thisWeek.total, activeDays: thisWeek.activeDays })
  if (lastWeek) cells.push({ label: 'Last week', value: lastWeek.total, activeDays: lastWeek.activeDays })
  if (thisMonth) cells.push({ label: 'This month', value: thisMonth.total, activeDays: thisMonth.activeDays })
  if (lastMonth) cells.push({ label: 'Last month', value: lastMonth.total, activeDays: lastMonth.activeDays })

  if (cells.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-1.5" data-testid="effort-rollup">
      {cells.map((c) => {
        const showDays = c.value !== c.activeDays
        return (
          <div key={c.label} className="rounded-xl bg-muted/50 px-2.5 py-1.5">
            <p className="text-[10px] font-medium text-muted-foreground">{c.label}</p>
            <p className="truncate text-sm font-bold tabular-nums">
              {format(c.value)}
              {showDays && <span className="text-[10px] font-medium text-muted-foreground"> · {c.activeDays} day{c.activeDays === 1 ? '' : 's'}</span>}
            </p>
          </div>
        )
      })}
    </div>
  )
}

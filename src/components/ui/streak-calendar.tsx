'use client'

// StreakCalendar: month-style completion heatmap (habits/journal in Phase 2;
// shipped in Phase 0 as a design-system primitive).

import { cn } from '@/lib/utils'

export interface StreakDay {
  iso: string // YYYY-MM-DD
  done: boolean | null // null = no data / future
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function StreakCalendar({ days, className }: { days: StreakDay[]; className?: string }) {
  // pad the first week so the grid starts on Monday
  const first = days[0]
  const pad = first ? (new Date(`${first.iso}T00:00:00Z`).getUTCDay() + 6) % 7 : 0

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium text-muted-foreground">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: pad }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {days.map((d) => (
          <div
            key={d.iso}
            title={d.iso}
            aria-label={`${d.iso}: ${d.done ? 'done' : d.done === false ? 'missed' : 'no data'}`}
            className={cn(
              'aspect-square rounded-md border',
              d.done === true && 'border-transparent bg-income',
              d.done === false && 'border-transparent bg-expense/15',
              d.done === null && 'bg-muted',
            )}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-income" /> done
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-expense/40" /> missed
        </span>
      </div>
    </div>
  )
}

'use client'

// ContributionGrid — GitHub-style effort calendar for a goal (Phase 9).
// Monday-anchored week columns flow left→right, one row per weekday,
// month labels span their week-columns, cells tint with the GOAL's colour
// at four intensity levels. Future days render as faint ghosts so a
// 1-year goal shows its whole commitment. Tapping a past day opens it
// for editing (parent supplies onPick).

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { GoalGridDayDTO } from '@/lib/types'

const CELL = 11 // px
const GAP = 3 // px

/** #rrggbb + alpha → rgba() string. */
function tint(hex: string, alpha: number): string {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex)
  if (!m) return `rgba(13, 148, 136, ${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

const LEVEL_ALPHA = [0, 0.22, 0.45, 0.7, 1] as const

const WEEKDAY_LABELS: { row: number; text: string }[] = [
  { row: 0, text: 'Mon' },
  { row: 2, text: 'Wed' },
  { row: 4, text: 'Fri' },
]

export function ContributionGrid({
  days,
  pad,
  labels,
  color,
  onPick,
  selectedIso,
  formatValue,
  className,
}: {
  days: GoalGridDayDTO[]
  pad: number
  labels: { label: string; span: number }[]
  color: string
  onPick?: (iso: string) => void
  selectedIso?: string | null
  formatValue: (amountMilli: number) => string
  className?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)

  // open at TODAY (the future commitment stays reachable by scrolling right)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const anchor = el.querySelector<HTMLElement>('[data-now="1"]')
    if (!anchor) {
      el.scrollLeft = el.scrollWidth
      return
    }
    const left = anchor.getBoundingClientRect().left - el.getBoundingClientRect().left
    el.scrollLeft = left + el.scrollLeft - el.clientWidth + CELL * 3
  }, [days.length])

  return (
    <div className={cn('w-full', className)}>
      <div ref={scroller} className="overflow-x-auto pb-1" data-testid="contribution-grid">
        <div className="inline-flex flex-col gap-1">
          {/* month labels, width-aligned to week columns */}
          <div className="flex gap-[3px] pl-[30px]">
            {labels.map((l, i) => (
              <span
                key={`${l.label}-${i}`}
                className="shrink-0 text-[9px] font-medium leading-none text-muted-foreground"
                style={{ width: l.span * (CELL + GAP) - GAP }}
              >
                {l.label}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {/* weekday gutter */}
            <div className="grid w-[27px] shrink-0 grid-rows-7 gap-[3px] text-[8px] leading-none text-muted-foreground">
              {WEEKDAY_LABELS.map((w) => (
                <span key={w.row} style={{ gridRow: w.row + 1 }}>
                  {w.text}
                </span>
              ))}
            </div>
            {/* day cells: 7 rows, column flow */}
            <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
              {Array.from({ length: pad }).map((_, i) => (
                <span key={`pad-${i}`} style={{ width: CELL, height: CELL }} />
              ))}
              {days.map((d, i) => {
                const selected = d.iso === selectedIso
                const clickable = onPick && !d.future && d.pickable !== false
                // the boundary cell (today / last non-future day) anchors the initial scroll
                const isNow = !d.future && (i + 1 >= days.length || days[i + 1].future)
                return (
                  <button
                    key={d.iso}
                    type="button"
                    disabled={!clickable}
                    data-now={isNow ? '1' : undefined}
                    aria-label={`${d.iso}${d.amountMilli > 0 ? `: ${formatValue(d.amountMilli)}` : d.future ? ' (upcoming)' : ': no contribution'}`}
                    title={`${d.iso}${d.amountMilli > 0 ? ` · ${formatValue(d.amountMilli)}` : d.future ? ' · upcoming' : ' · no contribution'}`}
                    onClick={() => onPick?.(d.iso)}
                    className={cn(
                      'shrink-0 rounded-[3px] transition-transform',
                      clickable && 'cursor-pointer hover:scale-125',
                      d.level === 0 && !d.future && 'bg-muted',
                      d.future && 'bg-muted/30',
                      selected && 'ring-2 ring-foreground/70 ring-offset-1 ring-offset-card',
                    )}
                    style={{
                      width: CELL,
                      height: CELL,
                      ...(d.level > 0 ? { backgroundColor: tint(color, LEVEL_ALPHA[d.level]) } : {}),
                    }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
      {/* legend */}
      <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-muted-foreground">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span
            key={l}
            className={cn('inline-block size-[9px] rounded-[2px]', l === 0 && 'bg-muted')}
            style={l > 0 ? { backgroundColor: tint(color, LEVEL_ALPHA[l]) } : undefined}
            data-level={l}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

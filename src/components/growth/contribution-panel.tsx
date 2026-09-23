'use client'

// ContributionPanel — the daily-tracking section inside an expanded goal
// card (Phase 9): quick log (type → Enter, <10s), pace stats, and the
// GitHub-style effort grid. Tap any past cell to edit that day; re-sending
// a date REPLACES its value (Decision #21 upsert convention).

import { useMemo, useState } from 'react'
import { Flame, Target, Trash2, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorCard, SkeletonRow } from '@/components/ui/saarthi'
import { EffortRollup } from '@/components/ui/effort-rollup'
import { ContributionGrid } from '@/components/growth/contribution-grid'
import {
  useDeleteContribution,
  useGoalContributions,
  useLogContribution,
} from '@/hooks/queries'
import { formatDayLabel } from '@/lib/date'
import { parseAmountToPaise } from '@/lib/money'
import { countToMilli, formatMilliAmount } from '@/lib/goals-grid'
import type { GoalMetric } from '@/lib/types'
import { cn } from '@/lib/utils'

const BAND_META: Record<string, { label: string; cls: string }> = {
  ahead: { label: 'Ahead of pace', cls: 'bg-income/15 text-income' },
  on_track: { label: 'On track', cls: 'bg-primary/10 text-primary' },
  behind: { label: 'Behind', cls: 'bg-warn/15 text-warn' },
  at_risk: { label: 'At risk', cls: 'bg-expense/10 text-expense' },
}

const COUNT_RE = /^\d+(\.\d{1,3})?$/

export function ContributionPanel({ goalId, color }: { goalId: string; color: string }) {
  const q = useGoalContributions(goalId)
  const log = useLogContribution({ success: 'Contribution logged' })
  const remove = useDeleteContribution({ success: 'Contribution removed' })

  const todayIso = q.data?.today ?? ''
  const [editDate, setEditDate] = useState<string | null>(null) // null = today
  const [value, setValue] = useState('')

  const activeDate = editDate ?? todayIso
  const metric: GoalMetric | null = q.data?.goal.metric ?? null
  const unitLabel = q.data?.goal.unitLabel ?? null

  const editingDay = useMemo(() => q.data?.days.find((d) => d.iso === activeDate) ?? null, [q.data, activeDate])

  if (q.isLoading) return <SkeletonRow />
  if (q.isError || !q.data) return <ErrorCard message={(q.error as Error)?.message ?? 'Could not load tracking'} onRetry={() => q.refetch()} />

  const { stats, goal, days, pad, labels } = q.data
  const isMoney = metric === 'money'

  function pick(iso: string) {
    const day = days.find((d) => d.iso === iso)
    setEditDate(iso)
    // prefill with the day's value (replace semantics) in display units
    if (day && day.amountMilli > 0) {
      const v = day.amountMilli / 1000
      setValue(isMoney ? String(Math.round(v * 100) / 100) : String(Math.round(v * 1000) / 1000))
    } else {
      setValue('')
    }
  }

  function submit() {
    let amountMilli: number | null = null
    if (isMoney) {
      const paise = parseAmountToPaise(value)
      amountMilli = paise != null ? paise * 10 : null
    } else {
      const cleaned = value.replace(/[,\s]/g, '')
      amountMilli = COUNT_RE.test(cleaned) ? countToMilli(parseFloat(cleaned)) : null
    }
    if (amountMilli == null || amountMilli <= 0) return
    log.mutate(
      { goalId, date: activeDate, amountMilli },
      {
        onSuccess: () => {
          setValue('')
          setEditDate(null)
        },
      },
    )
  }

  function removeDay() {
    remove.mutate({ goalId, date: activeDate }, {
      onSuccess: () => {
        setValue('')
        setEditDate(null)
      },
    })
  }

  const needed = stats.neededPerDayMilli
  const band = stats.band ? BAND_META[stats.band] : null
  const hasMetric = metric != null

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3" data-testid="contribution-panel">
      {/* stats strip */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/50 px-2 py-2">
          <p className="text-[10px] font-medium text-muted-foreground">Total{hasMetric && goal.targetValueMilli ? ` · ${Math.round(stats.actualPct ?? 0)}%` : ''}</p>
          <p className="truncate text-sm font-bold tabular-nums">{formatMilliAmount(metric ?? 'count', unitLabel, stats.totalMilli)}</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-2 py-2">
          <p className="flex items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground"><Flame className="size-3 text-warn" /> Streak</p>
          <p className="text-sm font-bold tabular-nums">
            {stats.currentStreak} <span className="text-[10px] font-normal text-muted-foreground">· best {stats.bestStreak}</span>
          </p>
        </div>
        <div className="rounded-xl bg-muted/50 px-2 py-2">
          <p className="flex items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground"><Target className="size-3" /> {hasMetric ? 'Needed/day' : 'Effort days'}</p>
          <p className="truncate text-sm font-bold tabular-nums">
            {hasMetric
              ? needed != null
                ? `${formatMilliAmount(metric, unitLabel, needed)}/d`
                : '—'
              : stats.taskDays}
          </p>
        </div>
      </div>

      {hasMetric && band && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', band.cls)}>{band.label}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <TrendingUp className="size-3" />
            {stats.projectedDate
              ? (goal.targetDate && stats.projectedDate <= goal.targetDate
                  ? `On this pace you finish by ${formatDayLabel(stats.projectedDate)}`
                  : `This pace finishes ~${formatDayLabel(stats.projectedDate)} — past your deadline`)
              : goal.targetDate
                ? `Deadline ${formatDayLabel(goal.targetDate)}`
                : 'No deadline — logging at your own pace'}
          </span>
        </div>
      )}

      {/* quick log — visible only for metric goals */}
      {hasMetric && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => pick(todayIso)}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold',
                activeDate === todayIso ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {editDate == null ? 'Today' : `Today · ${formatDayLabel(todayIso)}`}
            </button>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && value.trim() && submit()}
              inputMode="decimal"
              placeholder={needed != null && needed > 0 ? `e.g. ${formatMilliAmount(metric, unitLabel, needed)}` : `Amount in ${isMoney ? '₹' : unitLabel || 'units'}`}
              className="h-10 rounded-xl bg-muted/40 text-base"
              aria-label={`Contribution for ${activeDate}`}
            />
            {editingDay && editingDay.amountMilli > 0 && (
              <button
                type="button"
                aria-label={`Remove contribution of ${formatDayLabel(activeDate)}`}
                onClick={removeDay}
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-expense"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <Button size="sm" className="h-10 shrink-0 rounded-xl px-4" disabled={!value.trim() || log.isPending} onClick={submit}>
              {log.isPending ? '…' : 'Log'}
            </Button>
          </div>
          {editDate != null && (
            <p className="px-1 text-[10px] text-muted-foreground">
              Editing <span className="font-semibold text-foreground">{formatDayLabel(editDate)}</span>
              {editingDay && editingDay.amountMilli > 0 ? ` — currently ${formatMilliAmount(metric, unitLabel, editingDay.amountMilli)}; saving replaces it` : ' — no contribution yet'}
            </p>
          )}
        </div>
      )}

      {/* the grid */}
      <ContributionGrid
        days={days}
        pad={pad}
        labels={labels}
        color={goal.color || color}
        onPick={pick}
        selectedIso={activeDate}
        formatValue={(m) => formatMilliAmount(metric ?? 'count', unitLabel, m)}
      />

      {/* weekly/monthly roll-ups (full history, Phase 10) */}
      <EffortRollup rollups={q.data.rollups} format={(m) => formatMilliAmount(metric ?? 'count', unitLabel, m)} />
      {!hasMetric && (
        <p className="text-[10px] text-muted-foreground">
          Each square is a day with tasks done — darker means more tasks. Add daily tracking in the goal form to log amounts too.
        </p>
      )}
      {hasMetric && (
        <p className="text-[10px] text-muted-foreground">
          {stats.daysLogged} day{stats.daysLogged === 1 ? '' : 's'} logged
          {goal.targetDate ? ` · window ${formatDayLabel(days[0]?.iso ?? todayIso)} → ${formatDayLabel(goal.targetDate)}` : ''}
          {' — '}tap a square to fix or fill any day.
        </p>
      )}
    </div>
  )
}

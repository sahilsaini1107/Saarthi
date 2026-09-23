'use client'

// MilestoneLogSheet — the daily journal entry drawer for goal milestones
// (Phase 11). One row per milestone: minutes (quick chips) + what was done
// + what I'm learning + key takeaway. "Save day" upserts every filled row
// and clears emptied ones — re-sending a date REPLACES its entry (Decision
// #21 upsert convention). Opened two ways: per-milestone ("Log today" on a
// milestone row → one row) and per-day (tap a grid cell → every milestone).

import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorCard, SkeletonRow } from '@/components/ui/saarthi'
import { useDeleteMilestoneLog, useGoalDayLogs, useLogMilestoneProgress } from '@/hooks/queries'
import { formatDayLabel } from '@/lib/date'
import { formatMinutes } from '@/lib/effort-grid'
import { cn } from '@/lib/utils'

const MINUTE_CHIPS = [15, 30, 45, 60, 90, 120, 180]

interface Draft {
  minutes: string
  did: string
  learned: string
  keyLearning: string
}

export function MilestoneLogSheet({
  open,
  onOpenChange,
  goalId,
  date,
  milestoneId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  goalId: string
  date: string
  /** set → only this milestone's row shows (milestone-level logging) */
  milestoneId?: string
}) {
  const q = useGoalDayLogs(goalId, open ? date : null)
  const entries = (q.data?.entries ?? []).filter((e) => !milestoneId || e.milestoneId === milestoneId)

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Progress · {formatDayLabel(date)}</DrawerTitle>
          <DrawerDescription>
            Minutes + what you did + what you learned. Only minutes are required — save in under ten seconds.
          </DrawerDescription>
        </DrawerHeader>
        {open && (
          <div className="max-h-[62vh] overflow-y-auto pb-2">
            {q.isLoading ? (
              <SkeletonRow />
            ) : q.isError ? (
              <ErrorCard message={(q.error as Error).message} onRetry={() => q.refetch()} />
            ) : entries.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">This goal has no milestones to journal yet.</p>
            ) : (
              <DayForm key={date} goalId={goalId} date={date} entries={entries} onDone={() => onOpenChange(false)} />
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function DayForm({
  goalId,
  date,
  entries,
  onDone,
}: {
  goalId: string
  date: string
  entries: {
    milestoneId: string
    milestoneTitle: string
    logId: string | null
    minutes: number | null
    did: string | null
    learned: string | null
    keyLearning: string | null
  }[]
  onDone: () => void
}) {
  const log = useLogMilestoneProgress()
  const remove = useDeleteMilestoneLog()
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      entries.map((e) => [
        e.milestoneId,
        {
          minutes: e.minutes != null ? String(e.minutes) : '',
          did: e.did ?? '',
          learned: e.learned ?? '',
          keyLearning: e.keyLearning ?? '',
        },
      ]),
    ),
  )

  function setDraft(milestoneId: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [milestoneId]: { ...d[milestoneId], ...patch } }))
  }

  const dirty = entries.some((e) => {
    const d = drafts[e.milestoneId]
    if (!d) return false
    const minutesChanged = d.minutes.trim() !== (e.minutes != null ? String(e.minutes) : '')
    const textsChanged =
      d.did !== (e.did ?? '') || d.learned !== (e.learned ?? '') || d.keyLearning !== (e.keyLearning ?? '')
    return minutesChanged || textsChanged
  })

  function parseMinutes(raw: string): number | null {
    const cleaned = raw.replace(/[\s,]/g, '')
    if (!cleaned) return null
    if (!/^\d{1,4}$/.test(cleaned)) return NaN // signals invalid input
    return parseInt(cleaned, 10)
  }

  async function save() {
    const ops: Promise<unknown>[] = []
    for (const e of entries) {
      const d = drafts[e.milestoneId]
      if (!d) continue
      const minutes = parseMinutes(d.minutes)
      if (Number.isNaN(minutes)) {
        toast.error(`Minutes for "${e.milestoneTitle}" must be a whole number`)
        return
      }
      if (minutes == null) {
        // emptied row that had an entry → clear it
        if (e.logId) ops.push(remove.mutateAsync({ milestoneId: e.milestoneId, goalId, date }))
        continue
      }
      ops.push(
        log.mutateAsync({
          milestoneId: e.milestoneId,
          goalId,
          date,
          minutes,
          did: d.did.trim() || null,
          learned: d.learned.trim() || null,
          keyLearning: d.keyLearning.trim() || null,
        }),
      )
    }
    if (ops.length === 0) return
    await Promise.all(ops)
    toast.success('Progress logged')
    onDone()
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((e) => {
        const d = drafts[e.milestoneId]
        if (!d) return null
        return (
          <div key={e.milestoneId} className="rounded-2xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold">{e.milestoneTitle}</p>
              {e.minutes != null && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {formatMinutes(e.minutes)} logged
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MINUTE_CHIPS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDraft(e.milestoneId, { minutes: String(m) })}
                  className={cn(
                    'rounded-full px-2 py-1 text-[10px] font-bold transition-colors',
                    d.minutes === String(m) ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {formatMinutes(m)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={d.minutes}
                onChange={(ev) => setDraft(e.milestoneId, { minutes: ev.target.value })}
                inputMode="numeric"
                placeholder="Minutes (required)"
                className="h-10 w-32 rounded-xl bg-muted/40 text-sm"
                aria-label={`Minutes for ${e.milestoneTitle}`}
              />
              {e.logId && (
                <button
                  type="button"
                  aria-label={`Clear entry for ${e.milestoneTitle}`}
                  onClick={() => setDraft(e.milestoneId, { minutes: '' })}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-expense"
                  title="Clear this entry"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              <Input
                value={d.did}
                onChange={(ev) => setDraft(e.milestoneId, { did: ev.target.value })}
                placeholder="What did you work on?"
                maxLength={500}
                className="h-9 rounded-xl bg-muted/40 text-sm"
              />
              <Input
                value={d.learned}
                onChange={(ev) => setDraft(e.milestoneId, { learned: ev.target.value })}
                placeholder="What are you learning?"
                maxLength={500}
                className="h-9 rounded-xl bg-muted/40 text-sm"
              />
              <Input
                value={d.keyLearning}
                onChange={(ev) => setDraft(e.milestoneId, { keyLearning: ev.target.value })}
                placeholder="💡 Key takeaway"
                maxLength={500}
                className="h-9 rounded-xl bg-muted/40 text-sm"
              />
            </div>
          </div>
        )
      })}
      <Button onClick={save} disabled={!dirty || log.isPending || remove.isPending} className="h-12 rounded-xl text-base font-semibold">
        {log.isPending || remove.isPending ? (
          <>
            <Loader2 className="mr-1 size-4 animate-spin" /> Saving…
          </>
        ) : (
          'Save day'
        )}
      </Button>
    </div>
  )
}

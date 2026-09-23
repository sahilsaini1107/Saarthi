'use client'

// Goals screen — goals → milestones → tasks with roll-up progress
// (Decision #18). Milestones with tasks are auto-done when all their tasks
// are; task-less milestones toggle manually. Phase 11 adds the milestone
// JOURNAL: daily minutes + what was done / learned / key takeaway, a
// goal-level effort grid, and per-milestone journal entries.

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorCard, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { GoalFormSheet } from '@/components/growth/goal-form-sheet'
import { ContributionPanel } from '@/components/growth/contribution-panel'
import { JournalPanel } from '@/components/growth/journal-panel'
import { MilestoneLogSheet } from '@/components/growth/milestone-log-sheet'
import { MilestoneEditSheet } from '@/components/growth/milestone-edit-sheet'
import {
  useAddGoalTask,
  useAddMilestone,
  useDeleteGoalTask,
  useDeleteMilestone,
  useDeleteMilestoneLog,
  useGoalJournal,
  useGoals,
  useReorderMilestones,
  useSaveGoal,
  useUpdateGoalTask,
  useUpdateMilestone,
} from '@/hooks/queries'
import { formatDayLabel } from '@/lib/date'
import { formatMinutes } from '@/lib/effort-grid'
import { JOB_META } from '@/lib/planner'
import { cn } from '@/lib/utils'
import type { GoalDTO, GoalJournalDTO, GoalTaskDTO, JournalMilestoneDTO, MilestoneDTO } from '@/lib/types'

const HEALTH_META: Record<GoalDTO['health'], { label: string; cls: string } | null> = {
  done: { label: 'Achieved', cls: 'bg-income/15 text-income' },
  overdue: { label: 'Overdue', cls: 'bg-expense/10 text-expense' },
  due_soon: { label: 'Due soon', cls: 'bg-warn/15 text-warn' },
  on_track: null,
  no_deadline: null,
}

export function GoalsScreen() {
  const { navigate } = useUi()
  const goals = useGoals()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<GoalDTO | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  if (goals.isLoading) return <SkeletonRow />
  if (goals.isError) return <ErrorCard message={(goals.error as Error).message} onRetry={() => goals.refetch()} />

  const all = goals.data ?? []
  const active = all.filter((g) => g.status === 'active')
  const list = showDone ? all : active

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => navigate('/growth')} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Growth
      </button>
      <header className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold tracking-tight">Goals</h1>
        <Button size="sm" className="h-9 rounded-full" onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus className="mr-1 size-4" /> New goal
        </Button>
      </header>

      {all.length === 0 ? (
        <EmptyState
          emoji="🎯"
          title="No goals yet"
          body="Name the thing you want, break it into milestones, knock out tasks. Progress rolls up automatically."
          action={
            <Button size="sm" className="mt-2 rounded-full" onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus className="mr-1 size-4" /> Set a goal
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
            <div>
              <p className="text-sm font-semibold">{active.length} active goal{active.length === 1 ? '' : 's'}</p>
              <p className="text-xs text-muted-foreground">Milestones and tasks roll up into each bar</p>
            </div>
            <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={() => setShowDone((v) => !v)}>
              {showDone ? 'Hide' : 'Show'} achieved
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {list.map((g) => (
              <GoalCard key={g.id} goal={g} expanded={expanded === g.id} onToggleExpand={() => setExpanded((e) => (e === g.id ? null : g.id))} onEdit={() => { setEditing(g); setFormOpen(true) }} />
            ))}
          </div>
        </>
      )}

      <GoalFormSheet open={formOpen} onOpenChange={setFormOpen} goal={editing} />
    </div>
  )
}

function GoalCard({ goal: g, expanded, onToggleExpand, onEdit }: { goal: GoalDTO; expanded: boolean; onToggleExpand: () => void; onEdit: () => void }) {
  const saveGoal = useSaveGoal()
  const health = HEALTH_META[g.health]
  const pct = Math.round(g.progress * 100)
  // Phase 11 — journal fetched only while the card is expanded
  const journalQ = useGoalJournal(expanded && g.milestones.length > 0 ? g.id : null)
  const [logSheet, setLogSheet] = useState<{ date: string; milestoneId?: string } | null>(null)
  const [editMilestone, setEditMilestone] = useState<MilestoneDTO | null>(null)

  const openLog = (milestoneId: string, date?: string) => {
    const d = date ?? journalQ.data?.today
    if (d) setLogSheet({ date: d, milestoneId })
  }

  return (
    <div className={cn('rounded-2xl border bg-card', g.status !== 'active' && 'opacity-70')}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-xl" aria-hidden>
            {g.emoji}
          </span>
          <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggleExpand}>
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              {g.title}
              {health && <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold', health.cls)}>{health.label}</span>}
              {g.job && JOB_META[g.job] && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary" title={`Funded by the ${JOB_META[g.job].label} sleeve in your planner`}>
                  {JOB_META[g.job].emoji} {JOB_META[g.job].label}
                </span>
              )}
              {g.status === 'archived' && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">ARCHIVED</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {g.targetDate ? `by ${formatDayLabel(g.targetDate)}` : 'no deadline'}
              {` · ${g.taskStats.done}/${g.taskStats.total} tasks`}
              {g.milestones.length > 0 && ` · ${g.milestones.length} milestone${g.milestones.length === 1 ? '' : 's'}`}
            </p>
          </button>
          <button type="button" aria-label={`Edit ${g.title}`} onClick={onEdit} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
            <Pencil className="size-4" />
          </button>
          <button type="button" aria-label="Expand" onClick={onToggleExpand} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <ProgressBar value={pct} tone={pct >= 100 ? 'income' : 'primary'} />
          <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums">{pct}%</span>
        </div>

        {g.status === 'active' && pct >= 100 && (
          <Button size="sm" className="mt-3 h-9 rounded-full" disabled={saveGoal.isPending} onClick={() => saveGoal.mutate({ id: g.id, status: 'achieved' })}>
            <CheckCircle2 className="mr-1 size-4" /> Mark achieved 🎉
          </Button>
        )}
        {g.status === 'achieved' && (
          <Button size="sm" variant="outline" className="mt-3 h-9 rounded-full" disabled={saveGoal.isPending} onClick={() => saveGoal.mutate({ id: g.id, status: 'active' })}>
            Re-open
          </Button>
        )}
      </div>

      {expanded && (
        <>
          {(g.metric || g.taskStats.done > 0) ? (
            <ContributionPanel goalId={g.id} color={g.color} />
          ) : (
            <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
              <span>Want a GitHub-style effort grid? Add daily tracking.</span>
              <Button size="sm" variant="outline" className="h-7 shrink-0 rounded-full px-2.5 text-[10px]" onClick={onEdit}>
                Enable
              </Button>
            </div>
          )}
          {g.milestones.length > 0 && (
            <JournalPanel
              journal={journalQ.data}
              isLoading={journalQ.isLoading}
              error={(journalQ.error as Error) ?? null}
              onRetry={() => journalQ.refetch()}
              onPickDay={(iso) => setLogSheet({ date: iso })}
            />
          )}
          <GoalBreakdown
            goal={g}
            journal={journalQ.data ?? null}
            onLog={openLog}
            onEditMilestone={(m) => setEditMilestone(m)}
          />
        </>
      )}

      {logSheet && (
        <MilestoneLogSheet
          open
          onOpenChange={(o) => !o && setLogSheet(null)}
          goalId={g.id}
          date={logSheet.date}
          milestoneId={logSheet.milestoneId}
        />
      )}
      <MilestoneEditSheet open={editMilestone != null} onOpenChange={(o) => !o && setEditMilestone(null)} milestone={editMilestone} />
    </div>
  )
}

function GoalBreakdown({
  goal: g,
  journal,
  onLog,
  onEditMilestone,
}: {
  goal: GoalDTO
  journal: GoalJournalDTO | null
  onLog: (milestoneId: string, date?: string) => void
  onEditMilestone: (m: MilestoneDTO) => void
}) {
  const addMilestone = useAddMilestone({ success: 'Milestone added' })
  const addTask = useAddGoalTask({ success: 'Task added' })
  const reorder = useReorderMilestones({ success: 'Order updated' })

  /* ---------- Phase 12 — drag-and-drop milestone reordering ----------
   * Pointer-events based (mouse + touch + pen). Rows reorder LIVE while the
   * pointer crosses a neighbour's midpoint; on release the new id order is
   * committed to the reorder endpoint. No transforms — rows simply swap,
   * which stays correct with variable row heights.
   *
   * move/up/cancel listeners live on WINDOW (registered at drag start):
   * a live swap re-parents the dragged row, which drops per-element pointer
   * capture in Chrome — window listeners keep the drag alive either way.
   */
  const [ordered, setOrdered] = useState<MilestoneDTO[]>(g.milestones)
  const orderedRef = useRef<MilestoneDTO[]>(g.milestones) // sync truth for event handlers
  const [dragId, setDragId] = useState<string | null>(null)
  const dragFromRef = useRef(0)
  const draggingRef = useRef(false)
  const stopDragRef = useRef<(() => void) | null>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())

  // server truth re-syncs through props; skip while a drag is in flight
  useEffect(() => {
    if (!draggingRef.current) {
      setOrdered(g.milestones)
      orderedRef.current = g.milestones
    }
  }, [g.milestones])

  // stray listeners can't outlive the card
  useEffect(() => () => stopDragRef.current?.(), [])

  const commitOrder = () => {
    const ids = orderedRef.current.map((m) => m.id)
    if (g.milestones.length > 1 && ids.join(',') !== g.milestones.map((m) => m.id).join(',')) {
      reorder.mutate({ goalId: g.id, ids })
    }
  }

  const insertionIndex = (pointerY: number, from: number): number => {
    let idx = 0
    orderedRef.current.forEach((m, i) => {
      if (i === from) return
      const el = rowRefs.current.get(m.id)
      if (!el) return
      const r = el.getBoundingClientRect()
      if (pointerY > r.top + r.height / 2) idx++
    })
    return Math.min(idx, orderedRef.current.length - 1)
  }

  const swapTo = (target: number) => {
    const next = orderedRef.current.slice()
    const moved = next.splice(dragFromRef.current, 1)[0]
    next.splice(target, 0, moved)
    dragFromRef.current = target
    orderedRef.current = next
    setOrdered(next)
  }

  const beginDrag = (e: React.PointerEvent, id: string) => {
    if (orderedRef.current.length < 2) return
    e.preventDefault() // no text selection / native scroll-start from the grip
    dragFromRef.current = orderedRef.current.findIndex((m) => m.id === id)
    draggingRef.current = true
    setDragId(id)

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return
      const target = insertionIndex(ev.clientY, dragFromRef.current)
      if (target !== dragFromRef.current) swapTo(target)
    }
    const finish = (commit: boolean) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      stopDragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      setDragId(null)
      if (commit) commitOrder()
      else {
        setOrdered(g.milestones) // pointercancel → snap back to server truth
        orderedRef.current = g.milestones
      }
    }
    const onUp = () => finish(true)
    const onCancel = () => finish(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    stopDragRef.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }

  return (
    <div className={cn('flex flex-col gap-3 border-t px-4 py-3', dragId != null && 'select-none')}>
      {ordered.map((m) => (
        <div
          key={m.id}
          ref={(el) => {
            if (el) rowRefs.current.set(m.id, el)
            else rowRefs.current.delete(m.id)
          }}
          className={cn('rounded-xl', dragId === m.id && 'relative z-10 shadow-lg ring-1 ring-primary/40')}
        >
          <MilestoneRow
            goal={g}
            milestone={m}
            journal={journal?.milestones.find((jm) => jm.id === m.id) ?? null}
            onLog={onLog}
            onEdit={onEditMilestone}
            dragging={dragId === m.id}
            dragHandle={ordered.length > 1 ? { onPointerDown: (e) => beginDrag(e, m.id) } : undefined}
          />
        </div>
      ))}
      <AddRow placeholder="Add milestone…" onAdd={(title) => addMilestone.mutate({ goalId: g.id, title })} />

      {g.directTasks.length > 0 && (
        <div className="flex flex-col gap-1">
          <SectionHeader title="Standalone tasks" />
          {g.directTasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
      <AddRow placeholder="Add a standalone task…" onAdd={(title) => addTask.mutate({ goalId: g.id, title })} />
    </div>
  )
}

/* ---------- inline add row ---------- */

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('')
  return (
    <div className="flex gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && title.trim()) {
            onAdd(title.trim())
            setTitle('')
          }
        }}
        placeholder={placeholder}
        className="h-9 rounded-xl bg-muted/40 text-sm"
      />
      <Button
        size="sm"
        variant="outline"
        className="h-9 shrink-0 rounded-xl px-3"
        disabled={!title.trim()}
        onClick={() => {
          onAdd(title.trim())
          setTitle('')
        }}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}

function TaskRow({ task: t }: { task: GoalTaskDTO }) {
  const update = useUpdateGoalTask({ success: t.done ? 'Task re-opened' : 'Task done — progress updated' })
  const del = useDeleteGoalTask({ success: 'Task removed' })
  return (
    <div className="group flex items-center gap-2.5 rounded-xl bg-muted/40 px-2.5 py-2">
      <button
        type="button"
        aria-label={t.done ? `Reopen ${t.title}` : `Complete ${t.title}`}
        disabled={update.isPending}
        onClick={() => update.mutate({ id: t.id, done: !t.done })}
        className={cn('shrink-0 transition-colors', t.done ? 'text-income' : 'text-muted-foreground hover:text-foreground')}
      >
        {t.done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
      </button>
      <p className={cn('min-w-0 flex-1 truncate text-sm', t.done && 'text-muted-foreground line-through')}>{t.title}</p>
      {t.dueDate && (
        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', t.done ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>
          {formatDayLabel(t.dueDate)}
        </span>
      )}
      <button type="button" aria-label={`Delete ${t.title}`} onClick={() => del.mutate(t.id)} className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-60 hover:bg-accent hover:text-expense hover:opacity-100">
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function MilestoneRow({
  goal: g,
  milestone: m,
  journal,
  onLog,
  onEdit,
  dragging,
  dragHandle,
}: {
  goal: GoalDTO
  milestone: MilestoneDTO
  journal: JournalMilestoneDTO | null
  onLog: (milestoneId: string, date?: string) => void
  onEdit: (m: MilestoneDTO) => void
  /** Phase 12 — visual lift while this row is being dragged */
  dragging?: boolean
  /** Phase 12 — starts the window-listener drag sequence (present when ≥2 milestones) */
  dragHandle?: {
    onPointerDown: (e: React.PointerEvent) => void
  }
}) {
  const updateMilestone = useUpdateMilestone()
  const delMilestone = useDeleteMilestone({ success: 'Milestone removed' })
  const addTask = useAddGoalTask({ success: 'Task added' })
  const delLog = useDeleteMilestoneLog({ success: 'Entry removed' })
  const [taskTitle, setTaskTitle] = useState('')
  const [showAllLogs, setShowAllLogs] = useState(false)
  const hasTasks = m.tasks.length > 0
  const pct = Math.round(m.progress * 100)
  const timePct = journal?.timeProgress != null ? Math.round(journal.timeProgress * 100) : null
  const logs = journal?.recentLogs ?? []
  const visibleLogs = showAllLogs ? logs : logs.slice(0, 3)

  function submitTask() {
    if (!taskTitle.trim()) return
    addTask.mutate({ goalId: g.id, title: taskTitle.trim(), milestoneId: m.id })
    setTaskTitle('')
  }

  return (
    <div className={cn('rounded-xl border p-3', dragging && 'border-primary/40 bg-accent/50')}>
      <div className="flex items-center gap-2.5">
        {dragHandle && (
          <button
            type="button"
            aria-label={`Reorder ${m.title}`}
            title="Drag to reorder"
            className={cn(
              '-ml-1 shrink-0 cursor-grab touch-none rounded-lg p-1 text-muted-foreground/40 hover:bg-accent hover:text-foreground active:cursor-grabbing',
              dragging && 'text-primary',
            )}
            {...dragHandle}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        {hasTasks ? (
          <span className="shrink-0 rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-bold tabular-nums text-primary">
            {m.tasks.filter((t) => t.done).length}/{m.tasks.length}
          </span>
        ) : (
          <button
            type="button"
            aria-label={m.done ? `Reopen ${m.title}` : `Complete ${m.title}`}
            disabled={updateMilestone.isPending}
            onClick={() => updateMilestone.mutate({ id: m.id, done: !m.done })}
            className={cn('shrink-0 transition-colors', m.done ? 'text-income' : 'text-muted-foreground hover:text-foreground')}
          >
            {m.done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
          </button>
        )}
        <p className={cn('min-w-0 flex-1 truncate text-sm font-medium', m.done && 'text-muted-foreground line-through')}>{m.title}</p>
        <button
          type="button"
          aria-label={`Edit milestone ${m.title}`}
          onClick={() => onEdit(m)}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-60 hover:bg-accent hover:text-foreground hover:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Delete milestone ${m.title}`}
          onClick={() => {
            if (confirm(`Delete "${m.title}" and its ${m.tasks.length} task${m.tasks.length === 1 ? '' : 's'}? Journal entries go too.`)) delMilestone.mutate(m.id)
          }}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-60 hover:bg-accent hover:text-expense hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {hasTasks && pct < 100 && <ProgressBar value={pct} className="mt-2 h-1.5" />}

      {/* Phase 11 — time chip + optional planned-hours bar (informational) */}
      {(m.totalMinutes > 0 || m.targetMinutes != null) && (
        <div className="mt-2 flex items-center gap-2">
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
            <Clock className="size-3" />
            {formatMinutes(m.totalMinutes)}
            {m.targetMinutes != null && <span className="font-medium"> / {formatMinutes(m.targetMinutes)}</span>}
          </span>
          {timePct != null && <ProgressBar value={timePct} className="h-1.5 flex-1" />}
          {m.loggedToday && <span className="shrink-0 rounded-full bg-income/15 px-2 py-0.5 text-[9px] font-bold text-income">✓ today</span>}
        </div>
      )}

      {/* Phase 11 — quick log + journal entries */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-full px-2.5 text-[10px] font-bold"
          disabled={m.done && m.totalMinutes === 0}
          onClick={() => onLog(m.id)}
        >
          <Plus className="mr-0.5 size-3" /> Log progress
        </Button>
        {logs.length > 3 && (
          <button type="button" onClick={() => setShowAllLogs((v) => !v)} className="text-[10px] font-medium text-muted-foreground hover:text-foreground">
            {showAllLogs ? 'Show less' : `All ${logs.length} entries`}
          </button>
        )}
      </div>
      {visibleLogs.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {visibleLogs.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 rounded-xl bg-muted/40 px-2.5 py-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onLog(m.id, entry.date)} aria-label={`Edit entry of ${formatDayLabel(entry.date)}`}>
                <p className="text-[11px] font-bold tabular-nums">
                  {formatDayLabel(entry.date)} · {formatMinutes(entry.minutes)}
                </p>
                {entry.did && <p className="mt-0.5 line-clamp-2 text-xs text-foreground/80">{entry.did}</p>}
                {entry.learned && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">📚 {entry.learned}</p>}
                {entry.keyLearning && <p className="mt-0.5 line-clamp-2 text-xs font-medium text-primary">💡 {entry.keyLearning}</p>}
              </button>
              <button
                type="button"
                aria-label={`Delete entry of ${formatDayLabel(entry.date)}`}
                onClick={() => delLog.mutate({ milestoneId: m.id, goalId: g.id, date: entry.date })}
                className="shrink-0 rounded-lg p-1 text-muted-foreground opacity-60 hover:bg-accent hover:text-expense hover:opacity-100"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {m.tasks.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 border-l pl-3">
          {m.tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <Input
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitTask()}
          placeholder="Add task under this milestone…"
          className="h-8 rounded-lg bg-muted/40 text-xs"
        />
        <Button size="sm" variant="ghost" className="h-8 shrink-0 rounded-lg px-2" disabled={!taskTitle.trim() || addTask.isPending} onClick={submitTask}>
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

'use client'

// Study screen — courses with syllabus pacing + the revision ladder
// (Decisions #19/#20). Learning a topic schedules revision #1 in 3 days;
// later revisions walk [7, 14, 30, 90] and then graduate.

import { useState } from 'react'
import { ArrowLeft, BookOpen, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorCard, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { CourseFormSheet } from '@/components/growth/course-form-sheet'
import { CourseGridPanel } from '@/components/growth/course-grid-panel'
import {
  useAddTopic,
  useCourses,
  useDeleteStudySession,
  useDeleteTopic,
  useLogStudySession,
  useReviseTopic,
  useUpdateTopic,
} from '@/hooks/queries'
import { formatDayLabel, todayISO } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { CourseDTO, CourseTopicDTO } from '@/lib/types'

const HEALTH_META: Record<CourseDTO['pacing']['health'], { label: string; cls: string }> = {
  done: { label: 'Done 🎉', cls: 'bg-income/15 text-income' },
  no_target: { label: 'No deadline', cls: 'bg-muted text-muted-foreground' },
  ahead: { label: 'Ahead', cls: 'bg-income/15 text-income' },
  on_track: { label: 'On pace', cls: 'bg-primary/10 text-primary' },
  behind: { label: 'Behind', cls: 'bg-warn/15 text-warn' },
  at_risk: { label: 'At risk', cls: 'bg-expense/10 text-expense' },
}

export function StudyScreen() {
  const { user, navigate } = useUi()
  const today = todayISO(user.timezone)
  const courses = useCourses()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CourseDTO | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  if (courses.isLoading) return <SkeletonRow />
  if (courses.isError) return <ErrorCard message={(courses.error as Error).message} onRetry={() => courses.refetch()} />

  const all = courses.data ?? []
  const active = all.filter((c) => c.status === 'active')
  const revisionsDue = all.reduce((s, c) => s + c.stats.revisionsDue, 0)

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => navigate('/growth')} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Growth
      </button>
      <header className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold tracking-tight">Study</h1>
        <Button size="sm" className="h-9 rounded-full" onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus className="mr-1 size-4" /> New course
        </Button>
      </header>

      {all.length === 0 ? (
        <EmptyState
          emoji="📚"
          title="No courses yet"
          body="Paste a syllabus, set a target date, and the pacing engine keeps you honest. Learned topics come back for revision right when you'd forget them."
          action={
            <Button size="sm" className="mt-2 rounded-full" onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus className="mr-1 size-4" /> Start a course
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
            <div>
              <p className="text-sm font-semibold">{active.length} active course{active.length === 1 ? '' : 's'}</p>
              <p className="text-xs text-muted-foreground">
                {revisionsDue > 0 ? `${revisionsDue} revision${revisionsDue === 1 ? '' : 's'} due today — spaced repetition is the cheat code` : 'Nothing due for revision today'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {all.map((c) => (
              <CourseCard key={c.id} course={c} today={today} expanded={expanded === c.id} onToggleExpand={() => setExpanded((e) => (e === c.id ? null : c.id))} onEdit={() => { setEditing(c); setFormOpen(true) }} />
            ))}
          </div>
        </>
      )}

      <CourseFormSheet open={formOpen} onOpenChange={setFormOpen} course={editing} tz={user.timezone} />
    </div>
  )
}

function CourseCard({ course: c, today, expanded, onToggleExpand, onEdit }: { course: CourseDTO; today: string; expanded: boolean; onToggleExpand: () => void; onEdit: () => void }) {
  const health = HEALTH_META[c.pacing.health]
  const actualPct = Math.round(c.pacing.actualPct * 100)
  const expectedPct = c.pacing.expectedPct != null ? Math.round(c.pacing.expectedPct * 100) : null

  return (
    <div className="rounded-2xl border bg-card">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl text-xl" style={{ background: `${c.color}1A` }} aria-hidden>
            {c.emoji}
          </span>
          <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggleExpand}>
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              {c.title}
              <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold', health.cls)}>{health.label}</span>
              {c.status !== 'active' && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">{c.status.toUpperCase()}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {c.provider ? `${c.provider} · ` : ''}
              {actualPct}% done{expectedPct != null && c.pacing.health !== 'done' ? ` · on pace ${expectedPct}%` : ''}
              {c.stats.minutes7d > 0 ? ` · ${c.stats.minutes7d}m this week` : ''}
              {c.stats.revisionsDue > 0 ? ` · ${c.stats.revisionsDue} to revise` : ''}
            </p>
          </button>
          <button type="button" aria-label={`Edit ${c.title}`} onClick={onEdit} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
            <Pencil className="size-4" />
          </button>
          <button type="button" aria-label="Expand" onClick={onToggleExpand} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
            <BookOpen className="size-4" />
          </button>
        </div>

        <div className="mt-3">
          <ProgressBar value={actualPct} tone={c.pacing.health === 'at_risk' || c.pacing.health === 'behind' ? 'warn' : 'primary'} />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {c.topics.filter((t) => t.status === 'done').length}/{c.topics.length} topics
            {c.pacing.projectedEndDate && c.pacing.health !== 'done' ? ` · projected finish ${formatDayLabel(c.pacing.projectedEndDate)}` : ''}
            {c.pacing.health === 'no_target' ? ' · set a target date to see pacing' : ''}
          </p>
        </div>
      </div>

      {expanded && <CourseBreakdown course={c} today={today} />}
    </div>
  )
}

function CourseBreakdown({ course: c, today }: { course: CourseDTO; today: string }) {
  const addTopic = useAddTopic({ success: 'Topic added' })
  const [topicTitle, setTopicTitle] = useState('')
  const [estMinutes, setEstMinutes] = useState('')
  // Phase 10 — the study grid points the logger at a picked day (null = today)
  const [logDate, setLogDate] = useState<string | null>(null)

  const due = c.topics.filter((t) => t.status === 'done' && t.nextRevisionAt && t.nextRevisionAt <= today)

  function submitTopic() {
    if (!topicTitle.trim()) return
    addTopic.mutate({
      courseId: c.id,
      title: topicTitle.trim(),
      estMinutes: estMinutes ? Number(estMinutes) : null,
    })
    setTopicTitle('')
    setEstMinutes('')
  }

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3">
      {due.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn/5 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-warn">Revisions due</p>
          <div className="mt-2 flex flex-col gap-2">
            {due.map((t) => (
              <RevisionRow key={t.id} topic={t} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {c.topics.map((t) => (
          <TopicRow key={t.id} topic={t} today={today} />
        ))}
        {c.topics.length === 0 && <p className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">No topics yet — add your syllabus below.</p>}
      </div>

      <div className="flex gap-2">
        <Input
          value={topicTitle}
          onChange={(e) => setTopicTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitTopic()}
          placeholder="Add topic…"
          className="h-9 flex-1 rounded-xl bg-muted/40 text-sm"
        />
        <Input
          value={estMinutes}
          onChange={(e) => setEstMinutes(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submitTopic()}
          placeholder="min"
          inputMode="numeric"
          className="h-9 w-16 rounded-xl bg-muted/40 text-sm"
        />
        <Button size="sm" variant="outline" className="h-9 shrink-0 rounded-xl px-3" disabled={!topicTitle.trim() || addTopic.isPending} onClick={submitTopic}>
          <Plus className="size-4" />
        </Button>
      </div>

      <SessionLogger courseId={c.id} topics={c.topics} today={today} date={logDate ?? today} onDateChange={setLogDate} />

      {/* Phase 10 — GitHub-style study grid; tapping a day pre-aims the logger */}
      <CourseGridPanel
        courseId={c.id}
        color={c.color}
        onPick={(iso) => setLogDate(iso)}
        selectedIso={logDate ?? today}
      />

      <RecentSessions sessions={c.recentSessions} />
    </div>
  )
}

const NEXT_STATUS: Record<CourseTopicDTO['status'], CourseTopicDTO['status']> = {
  todo: 'learning',
  learning: 'done',
  done: 'todo',
}

const STATUS_CHIP: Record<CourseTopicDTO['status'], string> = {
  todo: 'bg-muted text-muted-foreground',
  learning: 'bg-primary/10 text-primary',
  done: 'bg-income/15 text-income',
}

function TopicRow({ topic: t, today }: { topic: CourseTopicDTO; today: string }) {
  const update = useUpdateTopic()
  const del = useDeleteTopic({ success: 'Topic removed' })
  const isDue = t.status === 'done' && t.nextRevisionAt && t.nextRevisionAt <= today

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-2.5 py-2">
      <button
        type="button"
        aria-label={`Cycle status of ${t.title}`}
        disabled={update.isPending}
        onClick={() => update.mutate({ id: t.id, status: NEXT_STATUS[t.status] })}
        className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-bold transition-colors', STATUS_CHIP[t.status])}
      >
        {t.status === 'todo' ? 'TO LEARN' : t.status === 'learning' ? 'LEARNING' : 'LEARNED'}
      </button>
      <p className="min-w-0 flex-1 truncate text-sm">
        {t.title}
        {t.revisionStage > 0 && t.status === 'done' && (
          <span className={cn('ml-1.5 text-[10px] font-semibold', isDue ? 'text-warn' : 'text-muted-foreground')}>
            {isDue ? `revise now (R${t.revisionStage + 1})` : `R${t.revisionStage}`}
          </span>
        )}
      </p>
      {t.nextRevisionAt && t.status === 'done' && !isDue && <span className="shrink-0 text-[10px] text-muted-foreground">rev {formatDayLabel(t.nextRevisionAt)}</span>}
      <button type="button" aria-label={`Delete ${t.title}`} onClick={() => del.mutate(t.id)} className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-60 hover:bg-accent hover:text-expense hover:opacity-100">
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function RevisionRow({ topic: t }: { topic: CourseTopicDTO }) {
  const revise = useReviseTopic({ success: 'Revision logged — next one scheduled' })
  return (
    <div className="flex items-center gap-2 rounded-xl bg-card p-2.5">
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</p>
      <Button size="sm" className="h-8 rounded-full px-3 text-xs" disabled={revise.isPending} onClick={() => revise.mutate({ topicId: t.id, outcome: 'revised' })}>
        <Check className="mr-1 size-3.5" /> Revised
      </Button>
      <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" disabled={revise.isPending} onClick={() => revise.mutate({ topicId: t.id, outcome: 'forgot' })}>
        <X className="mr-1 size-3.5" /> Forgot
      </Button>
    </div>
  )
}

function SessionLogger({
  courseId,
  topics,
  today,
  date,
  onDateChange,
}: {
  courseId: string
  topics: CourseTopicDTO[]
  today: string
  date: string
  onDateChange: (iso: string | null) => void
}) {
  const log = useLogStudySession({ success: 'Session logged' })
  const [minutes, setMinutes] = useState('')
  const [topicId, setTopicId] = useState('')

  function submit() {
    const m = Number(minutes)
    if (!Number.isInteger(m) || m < 1) return
    log.mutate(
      { courseId, minutes: m, date, topicId: topicId || null },
      {
        onSuccess: () => {
          setMinutes('')
          onDateChange(null)
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border p-2.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Log</span>
        <Input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="30" inputMode="numeric" className="h-9 w-16 rounded-xl bg-muted/40 text-sm" />
        <span className="shrink-0 text-xs text-muted-foreground">min</span>
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="h-9 min-w-0 flex-1 rounded-xl border bg-card px-2 text-xs text-foreground">
          <option value="">General study</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <Button size="sm" className="h-9 shrink-0 rounded-xl px-3 text-xs" disabled={!minutes || log.isPending} onClick={submit}>
          Add
        </Button>
      </div>
      {date !== today && (
        <div className="flex items-center justify-between rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
          <span>Logging against {formatDayLabel(date)}</span>
          <button type="button" onClick={() => onDateChange(null)} aria-label="Back to today" className="rounded px-1 hover:bg-primary/10">
            back to today ×
          </button>
        </div>
      )}
    </div>
  )
}

function RecentSessions({ sessions }: { sessions: CourseDTO['recentSessions'] }) {
  const del = useDeleteStudySession({ success: 'Session removed' })
  if (sessions.length === 0) return null
  return (
    <div>
      <SectionHeader title="Recent sessions" />
      <div className="flex flex-col gap-1">
        {sessions.slice(0, 5).map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-xl bg-muted/40 px-2.5 py-1.5 text-xs">
            <span className="font-semibold tabular-nums">{s.minutes}m</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.topicTitle ?? s.note ?? formatDayLabel(s.date)}</span>
            <span className="shrink-0 text-muted-foreground">{formatDayLabel(s.date)}</span>
            <button type="button" aria-label="Delete session" onClick={() => del.mutate(s.id)} className="shrink-0 rounded-lg p-1 text-muted-foreground opacity-60 hover:bg-accent hover:text-expense hover:opacity-100">
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

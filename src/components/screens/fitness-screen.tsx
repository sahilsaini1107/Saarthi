'use client'

// Training plans, sessions, and exercise progression.

import { useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Play, Plus, Trash2 } from 'lucide-react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useUi } from '@/components/saarthi-app'
import { PlanEditorSheet } from '@/components/fitness/plan-editor-sheet'
import { HealthNav } from '@/components/health/health-nav'
import { Button } from '@/components/ui/button'
import { Chip, EmptyState, ErrorCard, SectionHeader, SkeletonRow, StatTile } from '@/components/ui/saarthi'
import {
  useCreateSession,
  useDeletePlan,
  useExerciseProgress,
  useFitnessPlans,
  useFitnessSessions,
  useFitnessSummary,
  useTrainedExercises,
} from '@/hooks/queries'
import { formatDayLabel } from '@/lib/date'
import type { FitnessSummaryDTO, WorkoutPlanDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

export function FitnessScreen() {
  const { navigate } = useUi()
  const summary = useFitnessSummary()
  const [tab, setTab] = useState<'train' | 'progress'>('train')

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => navigate('/growth')} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Growth
      </button>
      <header className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fitness</h1>
          <p className="text-xs text-muted-foreground">Build your plan, log each session, and see your strength improve.</p>
        </div>
      </header>

      <HealthNav active="fitness" />

      <div className="flex gap-2">
        <Chip active={tab === 'train'} emoji="🏋️" label="Train" onClick={() => setTab('train')} />
        <Chip active={tab === 'progress'} emoji="📈" label="Strength progress" onClick={() => setTab('progress')} />
      </div>

      {summary.isLoading ? (
        <SkeletonRow />
      ) : summary.isError ? (
        <ErrorCard message={(summary.error as Error).message} onRetry={() => summary.refetch()} />
      ) : tab === 'train' ? (
        <TrainTab summary={summary.data} />
      ) : (
        <ProgressTab />
      )}
    </div>
  )
}

/* ================= Train ================= */

function TrainTab({ summary }: { summary: FitnessSummaryDTO | undefined }) {
  const { navigate } = useUi()
  const plans = useFitnessPlans()
  const sessions = useFitnessSessions()
  const createSession = useCreateSession()
  const delPlan = useDeletePlan({ success: 'Plan deleted' })
  const [editorOpen, setEditorOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<WorkoutPlanDTO | null>(null)
  const [starting, setStarting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (!summary) return null
  const open = summary.openSession
  const next = summary.nextWorkout

  async function startToday() {
    if (!next) return
    setStarting(true)
    try {
      const session = await createSession.mutateAsync({ planDayId: next.planDayId })
      navigate(`/growth/fitness/session/${session.id}`)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* week strip */}
      <section className="grid grid-cols-3 gap-3">
        <StatTile label="This week" value={`${summary.week.sessions}×`} sub={`${summary.week.minutes} min`} />
        <StatTile label="Volume" value={`${summary.week.volumeKg} kg`} sub="7 days" />
        <StatTile label="Last session" value={summary.lastSession ? `${summary.lastSession.durationMin} min` : '—'} sub={summary.lastSession?.label ?? 'No session yet'} />
      </section>

      {/* open session banner */}
      {open && (
        <button
          type="button"
          onClick={() => navigate(`/growth/fitness/session/${open.id}`)}
          className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 text-left"
        >
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{open.label} in progress</p>
            <p className="text-xs text-muted-foreground">{open.setCount} set{open.setCount === 1 ? '' : 's'} logged — keep going</p>
          </div>
          <Play className="size-4 text-primary" />
        </button>
      )}

      {/* next workout card */}
      {next ? (
        <section className="rounded-2xl border bg-card p-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {next.planEmoji} {next.planName}{next.rotationHint ? ` · ${next.rotationHint}` : ''}
              </p>
              <p className="mt-0.5 text-lg font-bold tracking-tight">{next.label}</p>
              {next.focus && <p className="text-xs text-muted-foreground">{next.focus}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="icon" variant="outline" className="size-9 rounded-full" onClick={() => navigate(`/growth/fitness/plan/${next.planId}`)} aria-label="View full plan">
                <CalendarDays className="size-4" />
              </Button>
              <Button size="sm" className="h-9 rounded-full" disabled={starting || createSession.isPending} onClick={startToday}>
                <Play className="mr-1 size-4" /> Start
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {next.exercises.map((pe) => (
              <div key={pe.id} className="flex items-center justify-between text-xs">
                <span className="min-w-0 truncate font-medium">{pe.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {pe.sets}×{pe.repMin != null ? `${pe.repMin}–${pe.repMax}` : pe.secondsMin != null ? `${pe.secondsMin}–${pe.secondsMax}s` : '?'}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        !open && (
          <EmptyState
            emoji="🏋️"
            title="No active plan"
            body="One tap sets up the vegetarian transformation plan: strength, conditioning, recovery, and daily anchors for the next 6 months."
            action={
              <Button size="sm" className="mt-2 rounded-full" onClick={() => { setEditPlan(null); setEditorOpen(true) }}>
                <Plus className="mr-1 size-4" /> Start a plan
              </Button>
            }
          />
        )
      )}

      {/* plans */}
      {plans.data && plans.data.plans.length > 0 && (
        <section>
          <SectionHeader
            title="Plans"
            action={
              <button type="button" onClick={() => { setEditPlan(null); setEditorOpen(true) }} className="flex items-center text-xs font-medium text-primary">
                New plan <ArrowRight className="size-3" />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            {plans.data.plans.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setEditPlan(p); setEditorOpen(true) }}>
                  <p className="truncate text-sm font-semibold">
                    {p.emoji} {p.name}
                    {p.active && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">active</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.days.map((d) => d.label).join(' · ')} — {p.sessionCount} sessions</p>
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full"
                  onClick={() => navigate(`/growth/fitness/plan/${p.id}`)}
                >
                  <CalendarDays className="mr-1 size-3.5" /> View
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('text-muted-foreground', confirmDeleteId === p.id && 'bg-expense/10 text-expense')}
                  onClick={() => {
                    if (confirmDeleteId !== p.id) {
                      setConfirmDeleteId(p.id)
                      return
                    }
                    delPlan.mutate(p.id, { onSettled: () => setConfirmDeleteId(null) })
                  }}
                  aria-label={confirmDeleteId === p.id ? `Confirm delete ${p.name}` : `Delete ${p.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {confirmDeleteId && <p className="px-1 text-[11px] text-expense">Tap the highlighted bin again to permanently delete this plan.</p>}
          </div>
        </section>
      )}

      {/* recent sessions */}
      {sessions.data && sessions.data.sessions.length > 0 && (
        <section>
          <SectionHeader title="Sessions" />
          <div className="flex flex-col gap-2">
            {sessions.data.sessions.slice(0, 12).map((s) => (
              <button key={s.id} type="button" onClick={() => navigate(`/growth/fitness/session/${s.id}`)} className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 text-left hover:bg-accent">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {s.label}
                    {s.open && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">open</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDayLabel(s.date)} · {s.durationMin > 0 ? `${s.durationMin} min · ${(s.volumeGrams / 1000).toFixed(0)} kg` : `${s.sets.length} sets so far`}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}

      <PlanEditorSheet open={editorOpen} onOpenChange={setEditorOpen} mode={editPlan ? { kind: 'edit', plan: editPlan } : { kind: 'create' }} />
    </div>
  )
}

/* ================= Progress ================= */

function ProgressTab() {
  const trained = useTrainedExercises()
  const [picked, setPicked] = useState<string | null>(null)

  const list = trained.data?.exercises ?? []
  const activeId = picked ?? list[0]?.exerciseId ?? null
  const progress = useExerciseProgress(activeId)

  return (
    <div className="flex flex-col gap-4">
      {trained.isLoading ? (
        <SkeletonRow />
      ) : list.length === 0 ? (
        <EmptyState compact emoji="📈" title="No training history yet" body="Finish your first session and every exercise gets a progression line here." />
      ) : (
        <>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {list.map((e) => (
              <Chip
                key={e.exerciseId}
                active={e.exerciseId === activeId}
                label={e.name}
                onClick={() => setPicked(e.exerciseId)}
                className="text-xs"
              />
            ))}
          </div>
          {progress.isLoading || !progress.data ? (
            <SkeletonRow />
          ) : progress.data.sessions.length === 0 ? (
            <EmptyState compact emoji="⏳" title="No closed sessions on this exercise yet" />
          ) : (
            <section className="rounded-2xl border bg-card p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold">{progress.data.name}</p>
                <span className="text-xs text-muted-foreground">
                  est. 1RM {((progress.data.sessions[progress.data.sessions.length - 1]?.est1RMGrams ?? 0) / 1000).toFixed(1)} kg
                </span>
              </div>
              <div className="mt-3 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progress.data.sessions.map((s) => ({ date: s.date.slice(5), estKg: s.est1RMGrams / 1000, topKg: s.topWeightGrams != null ? s.topWeightGrams / 1000 : null }))} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid var(--border)' }}
                      formatter={(v, name: string) => [v == null ? '—' : `${Number(v).toFixed(1)} kg`, name === 'estKg' ? 'est. 1RM' : 'top set'] as [string, string]}
                    />
                    <Line type="monotone" dataKey="estKg" stroke="var(--primary)" strokeWidth={2} dot={{ r: 2.5 }} />
                    <Line type="monotone" dataKey="topKg" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>— est. 1RM · – – top set</span>
                <span>
                  {progress.data.sessions.length} session{progress.data.sessions.length === 1 ? '' : 's'}
                  {progress.data.direction === 'up' ? ' · climbing ↗' : progress.data.direction === 'down' ? ' · regressing ↘' : progress.data.direction === 'flat' ? ' · holding' : ''}
                </span>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

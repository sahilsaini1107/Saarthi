'use client'

// Session logger (Phase 13) — the <10s set-entry loop. Every exercise card
// remembers last session's top set and prefills the weight/reps steppers;
// one tap logs a set. Finishing sets the duration and closes the session;
// an optional bridge writes the day into a goal's milestone journal.

import { useState } from 'react'
import { ArrowLeft, Check, Image as ImageIcon, Paperclip, Plus, Trash2, TrendingDown, TrendingUp, X, Youtube } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip, EmptyState, ErrorCard, SkeletonRow } from '@/components/ui/saarthi'
import { ExerciseMediaSheet } from '@/components/fitness/exercise-media-sheet'
import { youtubeEmbedUrl } from '@/lib/content'
import {
  useAddSet,
  useDeleteSession,
  useDeleteSet,
  useFitnessSession,
  useGoals,
  useLogMilestoneProgress,
  useUpdateSession,
} from '@/hooks/queries'
import { formatDayLabel, todayISO } from '@/lib/date'
import type { ProgressionDTO, SessionExerciseDTO, SetLogDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

export function SessionScreen({ sessionId }: { sessionId: string }) {
  const { user, navigate } = useUi()
  const session = useFitnessSession(sessionId)
  const update = useUpdateSession()
  const del = useDeleteSession({ success: 'Session deleted' })
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (session.isLoading) return <SkeletonRow />
  if (session.isError) return <ErrorCard message={(session.error as Error).message} onRetry={() => session.refetch()} />
  if (!session.data) return null
  const s = session.data

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => navigate('/growth/fitness')} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Fitness
      </button>

      <header className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{s.label}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDayLabel(s.date)}
            {s.durationMin > 0 ? ` · ${s.durationMin} min · ${(s.volumeGrams / 1000).toFixed(0)} kg moved` : ' · open'}
          </p>
        </div>
        {s.durationMin === 0 ? (
          <FinishControl sessionId={s.id} defaultMinutes={60} />
        ) : (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">✓ done</span>
        )}
      </header>

      {s.exercises.length === 0 ? (
        <EmptyState emoji="🏋️" title="Add your first set" body="Type an exercise name below — the plan's targets are loaded for you when the session came from a plan day." />
      ) : null}

      <div className="flex flex-col gap-3">
        {s.exercises.map((ex) => (
          <ExerciseCard key={ex.exerciseId} ex={ex} sessionId={s.id} closed={s.durationMin > 0} />
        ))}
      </div>

      {s.durationMin > 0 && <GoalJournalBridge sessionId={s.id} label={s.label} durationMin={s.durationMin} topLabel={topLabelOf(s)} />}

      <div className="flex justify-center pb-4">
        <Button
          variant={confirmDelete ? 'destructive' : 'ghost'}
          size="sm"
          className="rounded-full text-muted-foreground"
          onClick={() => {
            if (confirmDelete) del.mutate(s.id, { onSuccess: () => navigate('/growth/fitness') })
            else setConfirmDelete(true)
          }}
        >
          <Trash2 className="mr-1 size-4" /> {confirmDelete ? 'Tap again to delete session' : 'Delete session'}
        </Button>
      </div>
    </div>
  )
}

function topLabelOf(s: { exercises: SessionExerciseDTO[] }): string | null {
  const withSets = s.exercises.filter((e) => e.sets.length > 0)
  if (withSets.length === 0) return null
  const first = withSets[0]
  const top = first.sets.find((x) => x.weightGrams) ?? first.sets[0]
  return `${first.name} ${top.weightGrams != null ? `${top.weightGrams / 1000}kg` : 'BW'}×${top.reps ?? top.durationSeconds ?? ''}`
}

/* ---------------- finish ---------------- */

function FinishControl({ sessionId, defaultMinutes }: { sessionId: string; defaultMinutes: number }) {
  const update = useUpdateSession({ success: 'Session finished — nice work 💪' })
  const [editing, setEditing] = useState(false)
  const [minutes, setMinutes] = useState(String(defaultMinutes))

  if (!editing) {
    return (
      <Button size="sm" className="h-9 rounded-full" onClick={() => setEditing(true)}>
        <Check className="mr-1 size-4" /> Finish
      </Button>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input value={minutes} onChange={(e) => setMinutes(e.target.value)} type="number" min={1} max={1440} className="h-9 w-20 text-center" autoFocus />
      <span className="text-xs text-muted-foreground">min</span>
      <Button
        size="sm"
        className="h-9 rounded-full"
        disabled={update.isPending || !(Number(minutes) >= 1)}
        onClick={() =>
          update.mutate(
            { id: sessionId, durationMin: Math.round(Number(minutes)) },
            { onSuccess: () => setEditing(false) },
          )
        }
      >
        Save
      </Button>
      <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => setEditing(false)}>
        <X className="size-4" />
      </Button>
    </div>
  )
}

/* ---------------- exercise card ---------------- */

function ExerciseCard({ ex, sessionId, closed }: { ex: SessionExerciseDTO; sessionId: string; closed: boolean }) {
  const addSet = useAddSet()
  const delSet = useDeleteSet()
  const [mediaOpen, setMediaOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)

  const timed = ex.target?.repMin == null && (ex.target?.secondsMin != null || ex.sets.every((s) => s.reps == null))
  const [kg, setKg] = useState(() => (ex.lastTop?.weightGrams != null ? String(ex.lastTop.weightGrams / 1000) : ''))
  const [reps, setReps] = useState(() => String(ex.lastTop?.reps ?? ex.target?.repMin ?? (timed ? 0 : 8)))
  const [seconds, setSeconds] = useState(() => String(ex.target?.secondsMin ?? ex.lastTop?.reps ?? 30))
  const [warmup, setWarmup] = useState(false)

  function submit() {
    if (timed) {
      const secs = Number(seconds)
      if (!(secs >= 1)) return
      addSet.mutate({ sessionId, exerciseId: ex.exerciseId, durationSeconds: secs, weightGrams: null, isWarmup: warmup })
    } else {
      const r = Number(reps)
      if (!(r >= 1)) return
      const grams = kg.trim() === '' ? null : Math.round(Number(kg) * 1000)
      if (grams != null && (!(grams >= 0) || grams > 500_000)) return
      addSet.mutate({ sessionId, exerciseId: ex.exerciseId, weightGrams: grams, reps: r, isWarmup: warmup })
    }
  }

  const targetLabel = ex.target
    ? ex.target.repMin != null
      ? `${ex.target.sets}×${ex.target.repMin}–${ex.target.repMax}`
      : ex.target.secondsMin != null
        ? `${ex.target.sets}×${ex.target.secondsMin}–${ex.target.secondsMax}s`
        : `${ex.target.sets} sets`
    : 'freeform'

  return (
    <div className="rounded-2xl border bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{ex.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {targetLabel}
            {ex.target?.restSeconds != null ? ` · rest ${ex.target.restSeconds}s` : ''}
            {ex.lastTop ? ` · last: ${ex.lastTop.weightGrams != null ? `${ex.lastTop.weightGrams / 1000}kg` : 'BW'}×${ex.lastTop.reps ?? ''}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {ex.media?.youtubeId && !videoOpen && (
            <button
              type="button"
              aria-label="Show form video"
              onClick={() => setVideoOpen(true)}
              className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary"
            >
              <Youtube className="size-3.5" /> video
            </button>
          )}
          {ex.media?.hasPhoto && !photoOpen && (
            <button
              type="button"
              aria-label="Show form photo"
              onClick={() => setPhotoOpen(true)}
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground"
            >
              <ImageIcon className="size-3.5" /> photo
            </button>
          )}
          <button
            type="button"
            aria-label="Attach media"
            onClick={() => setMediaOpen(true)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Paperclip className="size-3.5" />
          </button>
          <ProgressBadge p={ex.progression} />
        </div>
      </div>

      {videoOpen && ex.media?.youtubeId && (
        <div className="mt-2 overflow-hidden rounded-xl border">
          <iframe
            src={youtubeEmbedUrl(ex.media.youtubeId)}
            title={`${ex.name} form video`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="aspect-video w-full"
          />
          <button type="button" onClick={() => setVideoOpen(false)} className="w-full bg-muted py-1 text-[11px] font-medium text-muted-foreground">
            hide video
          </button>
        </div>
      )}
      {photoOpen && ex.media?.hasPhoto && (
        <div className="mt-2">
          { }
          <img src={`/api/fitness/exercises/${ex.exerciseId}/photo`} alt={`${ex.name} form photo`} className="w-full rounded-xl" />
          <button type="button" onClick={() => setPhotoOpen(false)} className="mt-1 text-[11px] font-medium text-muted-foreground">
            hide photo
          </button>
        </div>
      )}

      {ex.sets.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {ex.sets.map((s) => (
            <SetChip key={s.id} set={s} onDelete={closed ? undefined : () => delSet.mutate({ setId: s.id, sessionId })} />
          ))}
        </div>
      )}

      {!closed && (
        <div className="mt-3 flex items-center gap-1.5">
          {timed ? (
            <>
              <Input value={seconds} onChange={(e) => setSeconds(e.target.value)} type="number" inputMode="numeric" className="h-9 w-20 text-center" placeholder="s" />
              <span className="text-xs text-muted-foreground">sec</span>
            </>
          ) : (
            <>
              <Input value={kg} onChange={(e) => setKg(e.target.value)} type="number" inputMode="decimal" step="0.5" min={0} className="h-9 w-20 text-center" placeholder="kg" />
              <Input value={reps} onChange={(e) => setReps(e.target.value)} type="number" inputMode="numeric" className="h-9 w-16 text-center" placeholder="reps" />
            </>
          )}
          <Button size="icon" className="size-9 shrink-0 rounded-full" disabled={addSet.isPending} onClick={submit} aria-label={`Log set for ${ex.name}`}>
            <Plus className="size-4" />
          </Button>
          <Chip active={warmup} label="warm-up" onClick={() => setWarmup(!warmup)} className="ml-auto" />
        </div>
      )}

      {ex.target?.note && <p className="mt-2 text-[11px] italic text-muted-foreground">{ex.target.note}</p>}

      <ExerciseMediaSheet
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        exerciseId={ex.exerciseId}
        exerciseName={ex.name}
        media={ex.media}
      />
    </div>
  )
}

function SetChip({ set, onDelete }: { set: SetLogDTO; onDelete?: () => void }) {
  const label = set.durationSeconds != null && set.reps == null ? `${set.durationSeconds}s` : `${set.weightGrams != null ? `${set.weightGrams / 1000}kg` : 'BW'}×${set.reps ?? ''}`
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        set.isWarmup ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
      )}
    >
      {set.isWarmup ? 'warm ' : ''}{label}
      {onDelete && (
        <button type="button" onClick={onDelete} className="rounded-full hover:text-destructive" aria-label="Delete set">
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

function ProgressBadge({ p }: { p: ProgressionDTO | null }) {
  if (!p) return null
  if (p.direction === 'up') {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-income/10 px-2 py-0.5 text-[11px] font-semibold text-income">
        <TrendingUp className="size-3" /> PR pace
      </span>
    )
  }
  if (p.direction === 'down') {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-expense/10 px-2 py-0.5 text-[11px] font-semibold text-expense">
        <TrendingDown className="size-3" /> below last
      </span>
    )
  }
  return <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">holding</span>
}

/* ---------------- goal journal bridge ---------------- */

function GoalJournalBridge({ sessionId, label, durationMin, topLabel }: { sessionId: string; label: string; durationMin: number; topLabel: string | null }) {
  void sessionId // the bridge reads only session data — kept for future deep links
  const { user } = useUi()
  const goals = useGoals()
  const log = useLogMilestoneProgress({ success: 'Added to goal journal' })
  const [open, setOpen] = useState(false)
  const [milestoneId, setMilestoneId] = useState('')
  const [minutes, setMinutes] = useState(String(durationMin))

  const active = (goals.data ?? []).filter((g) => g.status === 'active' && g.milestones.length > 0)
  if (active.length === 0) return null

  const did = `Trained: ${label}${topLabel ? ` — top set ${topLabel}` : ''}`

  return (
    <section className="rounded-2xl border bg-card p-3.5">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2 text-left text-sm">
          <span aria-hidden>🪺</span>
          <span className="flex-1 font-medium">Add to goal journal</span>
          <span className="text-xs text-muted-foreground">optional</span>
        </button>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold">Add to goal journal</p>
          <select
            value={milestoneId}
            onChange={(e) => setMilestoneId(e.target.value)}
            className="h-9 w-full rounded-xl border bg-background px-2 text-sm"
          >
            <option value="">Choose a milestone…</option>
            {active.map((g) => (
              <optgroup key={g.id} label={`${g.emoji} ${g.title}`}>
                {g.milestones.filter((m) => !m.done).map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <Input value={minutes} onChange={(e) => setMinutes(e.target.value)} type="number" min={1} max={1440} className="h-9 w-20 text-center" />
            <span className="text-xs text-muted-foreground">min · “{did}”</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="rounded-full"
              disabled={!milestoneId || log.isPending || !(Number(minutes) >= 1)}
              onClick={() => {
                const milestone = active.flatMap((g) => g.milestones.map((m) => ({ m, g }))).find((x) => x.m.id === milestoneId)
                if (!milestone) return
                log.mutate(
                  {
                    milestoneId,
                    goalId: milestone.g.id,
                    date: todayISO(user.timezone),
                    minutes: Math.round(Number(minutes)),
                    did,
                  },
                  { onSuccess: () => setOpen(false) },
                )
              }}
            >
              Save day
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

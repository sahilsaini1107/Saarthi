'use client'

// Body screen — composition panel, movement log and measurements.
//
// Three things are worth knowing here:
//  - Values are stored as integer milli-units (Decision #21).
//  - The movement feed merges quick `Workout` rows with closed coach sessions
//    (Decision #72); session rows are read-only and link to the session.
//  - The composition panel shows logged readings AND figures Saarthi derives
//    (BMI, lean mass, BMR), with the derived ones labelled as such.

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, Settings2, Trash2 } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { CompositionSheet } from '@/components/body/composition-sheet'
import { MetricCard } from '@/components/body/composition-panel'
import { ProfileSheet } from '@/components/body/profile-sheet'
import { HealthNav } from '@/components/health/health-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip, EmptyState, ErrorCard, Field, SectionHeader, SkeletonRow, StatTile } from '@/components/ui/saarthi'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useBodyComposition, useDeleteWorkout, useSaveWorkout, useWorkouts } from '@/hooks/queries'
import { INTENSITY_LABELS, WORKOUT_TYPES, WORKOUT_TYPE_LABELS, type WorkoutTypeKey } from '@/lib/constants'
import { formatMilli } from '@/lib/body'
import { BODY_GOALS, type BodyGoal } from '@/lib/coach-targets'
import { formatDayLabel, todayISO } from '@/lib/date'
import type { BodyCompositionDTO, WorkoutDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

const PACE_LABELS: Record<string, string> = {
  on_track: 'on track',
  slow: 'slower than target',
  fast: 'faster than target',
  insufficient: 'weigh in more often',
}

export function BodyScreen() {
  const { user, navigate } = useUi()
  const today = todayISO(user.timezone)
  const goalKey = `saarthi:body-goal:${user.id}`
  const [goal, setGoal] = useState<BodyGoal>(() => {
    if (typeof window === 'undefined') return 'lean_bulk'
    const saved = window.localStorage.getItem(goalKey)
    return BODY_GOALS.some((item) => item.key === saved) ? (saved as BodyGoal) : 'lean_bulk'
  })
  const workouts = useWorkouts()
  const composition = useBodyComposition(goal)
  const [tab, setTab] = useState<'body' | 'movement'>('body')
  const [weighInOpen, setWeighInOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [workoutOpen, setWorkoutOpen] = useState(false)

  const comp = composition.data

  function chooseGoal(next: BodyGoal) {
    setGoal(next)
    window.localStorage.setItem(goalKey, next)
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate('/growth')}
        className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Growth
      </button>
      <header className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Body</h1>
          <p className="text-xs text-muted-foreground">Measurements, movement, trends, and progress beyond the scale.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-9 rounded-full" onClick={() => setProfileOpen(true)}>
            <Settings2 className="mr-1 size-4" /> Details
          </Button>
          <Button size="sm" className="h-9 rounded-full" onClick={() => setWeighInOpen(true)}>
            <Plus className="mr-1 size-4" /> Weigh-in
          </Button>
        </div>
      </header>

      <HealthNav active="body" />

      <div className="flex gap-2">
        <Chip active={tab === 'body'} emoji="🧬" label="Composition" onClick={() => setTab('body')} />
        <Chip active={tab === 'movement'} emoji="🏃" label="Movement" onClick={() => setTab('movement')} />
      </div>

      {tab === 'body' ? (
        composition.isLoading ? (
          <SkeletonRow />
        ) : composition.isError ? (
          <ErrorCard message={(composition.error as Error).message} onRetry={() => composition.refetch()} />
        ) : (
          <CompositionTab
            comp={comp}
            goal={goal}
            onGoal={chooseGoal}
            onWeighIn={() => setWeighInOpen(true)}
            onProfile={() => setProfileOpen(true)}
            onPhotos={() => navigate('/growth/body/photos')}
          />
        )
      ) : workouts.isLoading ? (
        <SkeletonRow />
      ) : workouts.isError ? (
        <ErrorCard message={(workouts.error as Error).message} onRetry={() => workouts.refetch()} />
      ) : (
        <MovementTab onLog={() => setWorkoutOpen(true)} />
      )}

      <CompositionSheet open={weighInOpen} onOpenChange={setWeighInOpen} today={today} composition={comp} />
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} profile={comp?.profile} />
      <WorkoutFormSheet open={workoutOpen} onOpenChange={setWorkoutOpen} tz={today} />
    </div>
  )
}

/* ---------- composition ---------- */

function CompositionTab({
  comp,
  goal,
  onGoal,
  onWeighIn,
  onProfile,
  onPhotos,
}: {
  comp: BodyCompositionDTO | undefined
  goal: BodyGoal
  onGoal: (g: BodyGoal) => void
  onWeighIn: () => void
  onProfile: () => void
  onPhotos: () => void
}) {
  if (!comp) return null

  if (comp.groups.length === 0) {
    return (
      <EmptyState
        emoji="🧬"
        title="No readings yet"
        body="Log a weigh-in — just weight is enough to start. Add your height and birth year and Saarthi works out BMI, lean mass and BMR for you."
        action={
          <Button size="sm" className="mt-2 rounded-full" onClick={onWeighIn}>
            <Plus className="mr-1 size-4" /> Log a weigh-in
          </Button>
        }
      />
    )
  }

  const p = comp.profile
  const seriesOf = (kind: string) => comp.series.find((s) => s.kind === kind)

  return (
    <div className="flex flex-col gap-4">
      {/* who this panel is describing */}
      <button type="button" onClick={onProfile} className="flex items-center gap-4 rounded-2xl border bg-primary/5 p-4 text-left">
        <ProfileStat label="Age" value={p.age != null ? String(p.age) : '—'} />
        <ProfileStat label="Height" value={p.heightMilliCm != null ? `${formatMilli(p.heightMilliCm)} cm` : '—'} />
        <ProfileStat label="Sex" value={p.sex ?? '—'} />
        <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </button>
      {(p.heightMilliCm == null || p.birthYear == null || p.sex == null) && (
        <p className="-mt-2 px-1 text-[11px] text-muted-foreground">
          Add your height, birth year and sex under Details to unlock BMI, BMR and the body-fat ranges.
        </p>
      )}

      {/* goal + pace */}
      <section className="rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold">Goal</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {BODY_GOALS.map((g) => (
            <Chip key={g.key} active={goal === g.key} emoji={g.emoji} label={g.label} onClick={() => onGoal(g.key)} className="h-8 text-xs" />
          ))}
        </div>
        {comp.suggestion && (
          <div className="mt-3 rounded-xl bg-muted/50 p-3">
            <p className="text-sm font-semibold tabular-nums">
              {comp.suggestion.calorieTarget} kcal · {comp.suggestion.proteinTargetG} g protein
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{comp.suggestion.rationale}</p>
            {comp.suggestion.extrapolated && (
              <p className="mt-1 text-[11px] text-warn">
                Your weight sits outside the reference table — this is the nearest bracket, so treat it loosely.
              </p>
            )}
          </div>
        )}
        {comp.pace && (
          <p className="mt-2 text-xs text-muted-foreground">
            {comp.pace.kgPerWeek != null
              ? `Trend ${comp.pace.kgPerWeek > 0 ? '+' : ''}${comp.pace.kgPerWeek} kg/week over ${comp.pace.spanDays} days — ${PACE_LABELS[comp.pace.verdict] ?? comp.pace.verdict}.`
              : 'Two weigh-ins at least a week apart will show your pace.'}
          </p>
        )}
        {comp.goalProgress && (
          <p className="mt-1 text-xs font-medium">
            {Math.abs(comp.goalProgress.deltaG) < 250
              ? '🎯 You are at your goal weight.'
              : `${formatMilli(Math.abs(comp.goalProgress.deltaG))} kg ${comp.goalProgress.deltaG > 0 ? 'to gain' : 'to lose'}` +
                (comp.goalProgress.weeksToGoal != null
                  ? ` · about ${comp.goalProgress.weeksToGoal} weeks at this pace`
                  : ' · the current trend is not heading there')}
          </p>
        )}
      </section>

      {/* progress photos */}
      <button
        type="button"
        onClick={onPhotos}
        className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left hover:bg-accent"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
          📸
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Progress photos</p>
          <p className="text-xs text-muted-foreground">What the scale can&apos;t show you — with before/after</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {/* the panel */}
      {comp.groups.map((g) => (
        <section key={g.id}>
          <SectionHeader title={g.label} />
          <div className="grid grid-cols-2 gap-2">
            {g.metrics.map((m) => (
              <MetricCard
                key={m.kind}
                metric={m}
                series={seriesOf(m.kind)}
                goalMilli={m.kind === 'weight' ? comp.profile.goalWeightG : null}
              />
            ))}
          </div>
        </section>
      ))}

      <p className="px-1 text-[11px] text-muted-foreground">
        Bands come from published adult reference ranges (WHO for BMI, ACE for body fat). They describe populations, not
        you — bloodwork and how you feel matter more.
      </p>
    </div>
  )
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-bold capitalize tabular-nums">{value}</p>
    </div>
  )
}

/* ---------- movement ---------- */

function MovementTab({ onLog }: { onLog: () => void }) {
  const workouts = useWorkouts()
  const data = workouts.data

  if (!data) return null
  if (data.totals.count === 0) {
    return (
      <EmptyState
        emoji="💪"
        title="Nothing logged yet"
        body="Log workouts as you finish them. Gym sessions from the Fitness coach show up here automatically."
        action={
          <Button size="sm" className="mt-2 rounded-full" onClick={onLog}>
            <Plus className="mr-1 size-4" /> Log a workout
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-3 gap-3">
        <StatTile label="This week" value={`${data.weekStats.minutes}m`} sub={`${data.weekStats.count} workouts`} />
        <StatTile label="This month" value={`${data.monthMinutes}m`} sub="moved" />
        <StatTile label="All time" value={`${data.totals.count}`} sub={`${data.totals.minutes} min`} />
      </section>

      <div className="flex justify-end">
        <Button size="sm" className="h-9 rounded-full" onClick={onLog}>
          <Plus className="mr-1 size-4" /> Workout
        </Button>
      </div>

      <section>
        <SectionHeader title="Everything you moved" />
        <div className="flex flex-col gap-2">
          {data.workouts.map((w) => (
            <WorkoutRow key={`${w.source}-${w.id}`} workout={w} />
          ))}
        </div>
      </section>
    </div>
  )
}

function WorkoutRow({ workout: w }: { workout: WorkoutDTO }) {
  const del = useDeleteWorkout({ success: 'Workout removed' })
  const { navigate } = useUi()
  const meta = WORKOUT_TYPE_LABELS[(w.type as WorkoutTypeKey) in WORKOUT_TYPE_LABELS ? (w.type as WorkoutTypeKey) : 'other']
  // Coach sessions are owned by the Fitness screen: no delete here (the id is a
  // session id, not a Workout id) — tap through to the session instead.
  const fromSession = w.source === 'session'
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
        {meta.emoji}
      </span>
      <button
        type="button"
        disabled={!fromSession}
        onClick={fromSession ? () => navigate(`/growth/fitness/session/${w.id}`) : undefined}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <p className="text-sm font-semibold">
          {meta.label} · {w.minutes}m
          {fromSession ? (
            <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">GYM</span>
          ) : (
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
              {INTENSITY_LABELS[w.intensity]?.toUpperCase() ?? w.intensity}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{w.note || formatDayLabel(w.date)}</p>
      </button>
      <span className="shrink-0 text-xs text-muted-foreground">{formatDayLabel(w.date)}</span>
      {fromSession ? (
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <button
          type="button"
          aria-label="Delete workout"
          onClick={() => del.mutate(w.id)}
          className="shrink-0 rounded-lg p-2 text-muted-foreground opacity-60 hover:bg-accent hover:text-expense hover:opacity-100"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  )
}

/* ---------- workout form sheet ---------- */

function WorkoutFormSheet({ open, onOpenChange, tz }: { open: boolean; onOpenChange: (o: boolean) => void; tz: string }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Log a workout</DrawerTitle>
          <DrawerDescription>Right after the session — type is all you need.</DrawerDescription>
        </DrawerHeader>
        {open && <WorkoutForm key={tz} tz={tz} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function WorkoutForm({ tz, onClose }: { tz: string; onClose: () => void }) {
  const save = useSaveWorkout({ success: 'Workout logged 💪' })
  const [type, setType] = useState<WorkoutTypeKey>('strength')
  const [minutes, setMinutes] = useState('45')
  const [intensity, setIntensity] = useState('moderate')
  const [date, setDate] = useState(tz)
  const [note, setNote] = useState('')

  const valid = Number(minutes) >= 1

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {WORKOUT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                'flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all active:scale-95',
                type === t ? 'border-primary bg-primary/10' : 'bg-card',
              )}
            >
              <span aria-hidden>{WORKOUT_TYPE_LABELS[t].emoji}</span>
              {WORKOUT_TYPE_LABELS[t].label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Minutes">
          <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} className="h-11 rounded-xl" />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl" />
        </Field>
      </div>

      <Field label="How hard?">
        <div className="grid grid-cols-3 gap-2">
          {(['light', 'moderate', 'hard'] as const).map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIntensity(i)}
              className={cn(
                'flex h-10 items-center justify-center rounded-xl border text-sm font-semibold transition-all active:scale-95',
                intensity === i ? 'border-primary bg-primary/10' : 'bg-card text-muted-foreground',
              )}
            >
              {INTENSITY_LABELS[i]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Note (optional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Push day · 5k run…" />
      </Field>

      <Button
        disabled={!valid || save.isPending}
        className="mt-1 h-12 rounded-xl text-base font-semibold"
        onClick={() => {
          save.mutate({ type, minutes: Number(minutes), intensity, date, note: note.trim() || null }, { onSuccess: onClose })
        }}
      >
        {save.isPending ? 'Saving…' : 'Log workout'}
      </Button>
    </div>
  )
}

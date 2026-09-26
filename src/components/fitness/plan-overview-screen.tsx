'use client'

// Full 6-month training roadmap for a workout plan. The roadmap is derived
// from the editable plan days, so plan edits immediately reshape this view.

import { useMemo, useState } from 'react'
import { ArrowLeft, Dumbbell, Pencil, Play, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { PlanEditorSheet } from '@/components/fitness/plan-editor-sheet'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorCard, SectionHeader, SkeletonRow, StatTile } from '@/components/ui/saarthi'
import { useCreateSession, useFitnessPlans, useUpdatePlan } from '@/hooks/queries'
import type { PlanDayDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

interface FitnessPlanScreenProps {
  planId?: string
}

const ANCHORS = ['8k-10k steps', '3 L water', 'Protein every meal', 'SPF AM', '7-9 h sleep']

const PHASES = [
  { from: 1, to: 4, label: 'Foundation', intent: 'Lock technique, leave 2 reps in reserve, build the habit loop.' },
  { from: 5, to: 8, label: 'Volume Build', intent: 'Add reps first, then small load jumps when every set is clean.' },
  { from: 9, to: 12, label: 'Strength Base', intent: 'Keep compounds crisp, push accessories near the top of the range.' },
  { from: 13, to: 16, label: 'Density', intent: 'Tighter rest, better conditioning, same form standards.' },
  { from: 17, to: 20, label: 'Peak Consistency', intent: 'Stay boring, repeat wins, protect sleep and protein.' },
  { from: 21, to: 24, label: 'Consolidate', intent: 'Hold momentum, test progress, prepare the next block.' },
]

export function FitnessPlanScreen({ planId }: FitnessPlanScreenProps) {
  const { navigate } = useUi()
  const plans = useFitnessPlans()
  const updatePlan = useUpdatePlan({ success: 'Plan updated' })
  const createSession = useCreateSession()
  const [editorOpen, setEditorOpen] = useState(false)
  const [startingDayId, setStartingDayId] = useState<string | null>(null)

  const plan = useMemo(() => {
    const list = plans.data?.plans ?? []
    return list.find((p) => p.id === planId) ?? list.find((p) => p.active) ?? list[0] ?? null
  }, [planId, plans.data?.plans])

  const weeks = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => {
        const week = index + 1
        const phase = PHASES.find((p) => week >= p.from && week <= p.to) ?? PHASES[0]
        return {
          week,
          phase,
          deload: week % 4 === 0,
        }
      }),
    [],
  )

  if (plans.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onBack={() => navigate('/growth/fitness')} />
        <SkeletonRow />
      </div>
    )
  }

  if (plans.isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onBack={() => navigate('/growth/fitness')} />
        <ErrorCard message={(plans.error as Error).message} onRetry={() => plans.refetch()} />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onBack={() => navigate('/growth/fitness')} />
        <EmptyState
          emoji="🏋️"
          title="No plan yet"
          body="Create the vegetarian transformation plan from Fitness and the full 6-month roadmap will appear here."
          action={
            <Button size="sm" className="mt-2 rounded-full" onClick={() => navigate('/growth/fitness')}>
              Go to Fitness
            </Button>
          }
        />
      </div>
    )
  }

  const trainingDays = plan.days.filter((day) => day.exercises.length > 0)
  const totalExercises = plan.days.reduce((sum, day) => sum + day.exercises.length, 0)
  const weeklySets = plan.days.reduce((sum, day) => sum + day.exercises.reduce((daySum, exercise) => daySum + exercise.sets, 0), 0)

  async function startDay(day: PlanDayDTO) {
    setStartingDayId(day.id)
    try {
      const session = await createSession.mutateAsync({ planDayId: day.id })
      navigate(`/growth/fitness/session/${session.id}`)
    } finally {
      setStartingDayId(null)
    }
  }

  function activatePlan() {
    updatePlan.mutate({ id: plan.id, active: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <BackButton onBack={() => navigate('/growth/fitness')} />

      <header className="rounded-2xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">6-month roadmap</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              {plan.emoji} {plan.name}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{plan.note ?? 'Train, recover, progress, repeat.'}</p>
          </div>
          <Button size="icon" variant="outline" className="size-10 shrink-0 rounded-full" onClick={() => setEditorOpen(true)} aria-label="Edit plan">
            <Pencil className="size-4" />
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {plan.active ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <ShieldCheck className="size-3.5" /> Active
            </span>
          ) : (
            <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={activatePlan} disabled={updatePlan.isPending}>
              Make active
            </Button>
          )}
          {ANCHORS.map((anchor) => (
            <span key={anchor} className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {anchor}
            </span>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <StatTile label="Roadmap" value="24 wk" sub="6 training blocks" />
        <StatTile label="Deloads" value="6" sub="Every 4th week" />
        <StatTile label="Plan days" value={`${plan.days.length}`} sub={`${trainingDays.length} with work`} />
        <StatTile label="Weekly sets" value={`${weeklySets}`} sub={`${totalExercises} exercises`} />
      </section>

      <section>
        <SectionHeader title="Training days" action={<EditAction onClick={() => setEditorOpen(true)} />} />
        <div className="flex flex-col gap-2">
          {plan.days.map((day, index) => (
            <article key={day.id} className="rounded-2xl border bg-card p-3.5">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{day.label}</p>
                  {day.focus && <p className="text-xs text-muted-foreground">{day.focus}</p>}
                </div>
                {day.exercises.length > 0 && (
                  <Button
                    size="sm"
                    className="h-8 shrink-0 rounded-full"
                    onClick={() => startDay(day)}
                    disabled={startingDayId === day.id || createSession.isPending}
                  >
                    <Play className="mr-1 size-3.5" /> Start
                  </Button>
                )}
              </div>
              {day.exercises.length > 0 ? (
                <div className="mt-3 grid gap-1.5">
                  {day.exercises.map((exercise) => (
                    <div key={exercise.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2 text-xs">
                      <span className="min-w-0 truncate font-medium">{exercise.name}</span>
                      <span className="shrink-0 text-muted-foreground">{formatPrescription(exercise)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Recovery, steps, mobility, and sleep.</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="24-week roadmap" />
        <div className="flex flex-col gap-2">
          {weeks.map((week) => (
            <article
              key={week.week}
              className={cn(
                'rounded-2xl border bg-card p-3.5',
                week.deload && 'border-primary/35 bg-primary/5',
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    week.deload ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  )}
                >
                  {week.week}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold">Week {week.week}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {week.phase.label}
                    </span>
                    {week.deload && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        Deload
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {week.deload
                      ? 'Repeat the same days with 40-50% less volume, lighter loads, and perfect movement quality.'
                      : week.phase.intent}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {plan.days.map((day) => (
                      <span key={`${week.week}-${day.id}`} className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground">
                        {week.deload ? <RotateCcw className="size-3" /> : <Dumbbell className="size-3" />}
                        {day.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Progress rule</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              When every set reaches the top of its range with clean form, add a small amount of weight next time. If form breaks, keep the load and earn the reps again.
            </p>
          </div>
        </div>
      </section>

      <PlanEditorSheet open={editorOpen} onOpenChange={setEditorOpen} mode={{ kind: 'edit', plan }} />
    </div>
  )
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Fitness
    </button>
  )
}

function EditAction({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 text-xs font-medium text-primary">
      Edit <Pencil className="size-3" />
    </button>
  )
}

function formatPrescription(exercise: PlanDayDTO['exercises'][number]) {
  if (exercise.repMin != null) return `${exercise.sets}x${exercise.repMin}-${exercise.repMax ?? exercise.repMin}`
  if (exercise.secondsMin != null) return `${exercise.sets}x${exercise.secondsMin}-${exercise.secondsMax ?? exercise.secondsMin}s`
  return `${exercise.sets} sets`
}

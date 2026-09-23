'use client'

// Fitness hub (Phase 13) — Train / Progress / Fuel.
// Train: today's workout (rotation), plans, sessions. Progress: per-exercise
// est-1RM lines + bulk-pace verdict. Fuel: protein/kcal targets + veg chips.

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Play, Plus, Settings2, Trash2, X } from 'lucide-react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useUi } from '@/components/saarthi-app'
import { PlanEditorSheet } from '@/components/fitness/plan-editor-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip, EmptyState, ErrorCard, ProgressBar, SectionHeader, SkeletonRow, StatTile } from '@/components/ui/saarthi'
import {
  useAddMealEntry,
  useCreateSession,
  useDeleteMealEntry,
  useDeletePlan,
  useExerciseProgress,
  useFitnessPlans,
  useFitnessSessions,
  useFitnessSummary,
  useNutrition,
  useSaveNutritionDay,
  useTrainedExercises,
  useUpdateNutritionProfile,
} from '@/hooks/queries'
import { PROTEIN_CHIPS, SUPPLEMENT_NOTES } from '@/lib/fitness-presets'
import { mealTypeBreakdown, MEAL_TYPES } from '@/lib/meals'
import { formatDayLabel, todayISO } from '@/lib/date'
import type { FitnessSummaryDTO, WorkoutPlanDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

const VERDICTS: Record<string, { label: string; tone: string }> = {
  on_track: { label: 'on track', tone: 'text-income' },
  slow: { label: 'gaining slow', tone: 'text-warn' },
  fast: { label: 'gaining fast', tone: 'text-warn' },
  insufficient: { label: 'weigh in more', tone: 'text-muted-foreground' },
}

export function FitnessScreen() {
  const { user, navigate } = useUi()
  const summary = useFitnessSummary()
  const [tab, setTab] = useState<'train' | 'progress' | 'fuel'>('train')

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => navigate('/growth')} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Growth
      </button>
      <header className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold tracking-tight">Fitness</h1>
      </header>

      <div className="flex gap-2">
        <Chip active={tab === 'train'} emoji="🏋️" label="Train" onClick={() => setTab('train')} />
        <Chip active={tab === 'progress'} emoji="📈" label="Progress" onClick={() => setTab('progress')} />
        <Chip active={tab === 'fuel'} emoji="🥗" label="Fuel" onClick={() => setTab('fuel')} />
      </div>

      {summary.isLoading ? (
        <SkeletonRow />
      ) : summary.isError ? (
        <ErrorCard message={(summary.error as Error).message} onRetry={() => summary.refetch()} />
      ) : tab === 'train' ? (
        <TrainTab summary={summary.data} tz={user.timezone} />
      ) : tab === 'progress' ? (
        <ProgressTab />
      ) : (
        <FuelTab />
      )}
    </div>
  )
}

/* ================= Train ================= */

function TrainTab({ summary, tz }: { summary: FitnessSummaryDTO | undefined; tz: string }) {
  const { navigate } = useUi()
  const plans = useFitnessPlans()
  const sessions = useFitnessSessions()
  const createSession = useCreateSession()
  const delPlan = useDeletePlan({ success: 'Plan deleted' })
  const [editorOpen, setEditorOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<WorkoutPlanDTO | null>(null)
  const [starting, setStarting] = useState(false)

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
        <StatTile label="Protein" value={summary.nutrition.proteinG != null ? `${summary.nutrition.proteinG}g` : '—'} sub={summary.nutrition.proteinTargetG ? `of ${summary.nutrition.proteinTargetG}g` : 'set a target'} />
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
            <Button size="sm" className="h-9 shrink-0 rounded-full" disabled={starting || createSession.isPending} onClick={startToday}>
              <Play className="mr-1 size-4" /> Start
            </Button>
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
            body="One tap sets up the coach's Foundation A/B — three full-body days a week, alternating A and B."
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
                <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => delPlan.mutate(p.id)} aria-label={`Delete ${p.name}`}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
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
  const summary = useFitnessSummary()
  const { navigate } = useUi()

  const list = trained.data?.exercises ?? []
  const activeId = picked ?? list[0]?.exerciseId ?? null
  const progress = useExerciseProgress(activeId)
  const verdict = summary.data?.weight ? VERDICTS[summary.data.weight.verdict] : null

  return (
    <div className="flex flex-col gap-4">
      {/* bulk pace */}
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold">Bulk pace</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {summary.data?.weight
                ? `${summary.data.weight.latestKg} kg now · ${summary.data.weight.kgPerWeek != null ? `${summary.data.weight.kgPerWeek > 0 ? '+' : ''}${summary.data.weight.kgPerWeek} kg/week` : 'not enough weigh-ins'}`
                : 'Weigh yourself on the Body screen to track your pace'}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-full" onClick={() => navigate('/growth/body')}>
            Weigh-in
          </Button>
        </div>
        {summary.data?.weight?.kgPerWeek != null && verdict && (
          <p className={cn('mt-2 text-xs font-semibold', verdict.tone)}>
            Target {summary.data.weight.weeklyTargetG} g/week — you&apos;re {verdict.label}
          </p>
        )}
      </section>

      {trained.isLoading ? (
        <SkeletonRow />
      ) : list.length === 0 ? (
        <EmptyState compact emoji="📈" title="No training history yet" body="Finish your first session and every exercise gets a progression line here." />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
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

/* ================= Fuel ================= */

function FuelTab() {
  const { user, navigate } = useUi()
  const nutrition = useNutrition()
  const saveDay = useSaveNutritionDay({ success: 'Logged' })
  const updateProfile = useUpdateNutritionProfile({ success: 'Targets updated' })
  const addMeal = useAddMealEntry({ success: 'Meal logged' })
  const delMeal = useDeleteMealEntry({ success: 'Entry removed' })
  const [showTargets, setShowTargets] = useState(false)
  const [customP, setCustomP] = useState('')
  const [customK, setCustomK] = useState('')
  const [pTarget, setPTarget] = useState('')
  const [kTarget, setKTarget] = useState('')
  const [gainTarget, setGainTarget] = useState('')
  // meal form (Phase 19)
  const [mealType, setMealType] = useState('breakfast')
  const [mealName, setMealName] = useState('')
  const [mealKcal, setMealKcal] = useState('')
  const [mealP, setMealP] = useState('')

  if (nutrition.isLoading) return <SkeletonRow />
  if (nutrition.isError) return <ErrorCard message={(nutrition.error as Error).message} onRetry={() => nutrition.refetch()} />
  if (!nutrition.data) return null

  const n = nutrition.data
  const today = todayISO(user.timezone)
  // days[] is already the COMBINED total (meals + quick-adds) — merged server
  // side so this card, the hub tile and the Today card can never disagree.
  const todayRow = n.days.find((d) => d.iso === today)
  const meals = n.meals.totals
  const protein = todayRow?.proteinG ?? 0
  const kcal = todayRow?.caloriesKcal ?? 0
  // quick-adds must build on the MANUAL row alone, never the combined total
  const manualProtein = todayRow?.manualProteinG ?? 0
  const manualKcal = todayRow?.manualCaloriesKcal ?? 0
  const pTargetVal = n.profile?.proteinTargetG ?? n.suggestions?.proteinTargetG ?? null
  const kTargetVal = n.profile?.calorieTarget ?? n.suggestions?.calorieTarget ?? null

  function addChip(chipG: number, chipK: number) {
    saveDay.mutate({ date: today, proteinG: manualProtein + chipG, caloriesKcal: manualKcal + chipK })
  }
  function addCustom() {
    const p = customP.trim() === '' ? null : Number(customP)
    const k = customK.trim() === '' ? null : Number(customK)
    if ((p == null || !Number.isFinite(p)) && (k == null || !Number.isFinite(k))) return
    saveDay.mutate({
      date: today,
      proteinG: p != null && Number.isFinite(p) ? Math.max(0, manualProtein + Math.round(p)) : todayRow?.manualProteinG ?? null,
      caloriesKcal: k != null && Number.isFinite(k) ? Math.max(0, manualKcal + Math.round(k)) : todayRow?.manualCaloriesKcal ?? null,
    })
    setCustomP('')
    setCustomK('')
  }
  function undoToday() {
    saveDay.mutate({ date: today, proteinG: 0, caloriesKcal: 0 })
  }
  function saveMeal() {
    if (!mealName.trim()) return
    addMeal.mutate({
      date: today,
      mealType,
      name: mealName.trim(),
      ...(mealKcal.trim() !== '' && Number(mealKcal) >= 0 ? { caloriesKcal: Math.round(Number(mealKcal)) } : {}),
      ...(mealP.trim() !== '' && Number(mealP) >= 0 ? { proteinG: Math.round(Number(mealP)) } : {}),
    })
    setMealName('')
    setMealKcal('')
    setMealP('')
  }

  const last7 = [...n.days].slice(-7)
  const mealGroups = mealTypeBreakdown(n.meals.entries)

  return (
    <div className="flex flex-col gap-4">
      {/* today vs targets — combined: meal log + quick-adds */}
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Today</p>
          <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs" onClick={() => setShowTargets(!showTargets)}>
            <Settings2 className="mr-1 size-3.5" /> Targets
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {meals.caloriesKcal > 0 || meals.proteinG > 0
            ? `${meals.caloriesKcal} kcal · ${meals.proteinG}g from meals + ${manualKcal} kcal · ${manualProtein}g quick-adds`
            : 'meal log + quick-adds combined'}
        </p>
        {pTargetVal != null ? (
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <div className="flex justify-between text-xs">
                <span className="font-medium">🥛 Protein</span>
                <span className="tabular-nums text-muted-foreground">{protein} / {pTargetVal} g</span>
              </div>
              <ProgressBar value={Math.min(100, (protein / pTargetVal) * 100)} tone="income" />
            </div>
            {kTargetVal != null && (
              <div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium">🔥 Calories</span>
                  <span className="tabular-nums text-muted-foreground">{kcal} / {kTargetVal} kcal</span>
                </div>
                <ProgressBar value={Math.min(100, (kcal / kTargetVal) * 100)} />
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {n.suggestions
              ? `From your ${n.latestWeightKg} kg weigh-in: ~${n.suggestions.proteinTargetG} g protein and ~${n.suggestions.calorieTarget} kcal/day. Set them under Targets.`
              : 'Set protein and calorie targets to start tracking (no weigh-in found yet).'}
          </p>
        )}
        {n.suggestions && pTargetVal == null && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 rounded-full"
            onClick={() => updateProfile.mutate({ proteinTargetG: n.suggestions!.proteinTargetG, calorieTarget: n.suggestions!.calorieTarget })}
          >
            Use suggestions
          </Button>
        )}
        {(manualProtein > 0 || manualKcal > 0) && (
          <button type="button" onClick={undoToday} className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
            reset quick-adds today
          </button>
        )}
      </section>

      {/* food library entry point (Phase 21) */}
      <button
        type="button"
        onClick={() => navigate('/growth/fitness/food')}
        className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left hover:bg-accent"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
          🍛
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Food &amp; Plates</p>
          <p className="text-xs text-muted-foreground">
            Configure a food once, then build a plate and get the exact totals
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {/* meal-level log (Phase 19) */}
      <section className="rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold">Log a meal</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MEAL_TYPES.map((t) => (
            <Chip key={t.key} active={mealType === t.key} emoji={t.emoji} label={t.label} onClick={() => setMealType(t.key)} />
          ))}
        </div>
        <div className="mt-2.5 flex flex-col gap-2">
          <Input value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder="e.g. Paneer bhurji · 2 rotis" className="h-9" />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Input value={mealKcal} onChange={(e) => setMealKcal(e.target.value)} type="number" inputMode="numeric" className="h-9 w-20 text-center" placeholder="kcal" />
            <Input value={mealP} onChange={(e) => setMealP(e.target.value)} type="number" inputMode="numeric" className="h-9 w-16 text-center" placeholder="g prot" />
            <Button size="sm" className="ml-auto rounded-full" disabled={addMeal.isPending || !mealName.trim()} onClick={saveMeal}>
              <Plus className="mr-1 size-4" /> Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROTEIN_CHIPS.slice(0, 6).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setMealName((cur) => cur || `${c.label} · ${c.portion}`)
                  setMealKcal(String(c.kcal))
                  setMealP(String(c.proteinG))
                }}
                className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-accent"
              >
                {c.label} {c.proteinG}g/{c.kcal}
              </button>
            ))}
          </div>
        </div>

        {mealGroups.length > 0 && (
          <div className="mt-4 flex flex-col gap-2.5 border-t pt-3">
            {mealGroups.map((g) => {
              const meta = MEAL_TYPES.find((t) => t.key === g.mealType)!
              return (
                <div key={g.mealType}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{meta.emoji} {meta.label}</span>
                    <span className="tabular-nums text-muted-foreground">{g.caloriesKcal} kcal · {g.proteinG}g</span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    {n.meals.entries
                      .filter((e) => e.mealType === g.mealType)
                      .map((e) => (
                        <div key={e.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
                          <span className="min-w-0 flex-1 truncate">{e.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {e.caloriesKcal != null ? `${e.caloriesKcal} kcal` : '—'}{e.proteinG != null ? ` · ${e.proteinG}g` : ''}
                          </span>
                          <button type="button" aria-label={`Delete ${e.name}`} disabled={delMeal.isPending} onClick={() => delMeal.mutate(e.id)} className="shrink-0 text-muted-foreground hover:text-expense">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* targets editor */}
      {showTargets && (
        <section className="rounded-2xl border bg-card p-4">
          <p className="text-sm font-semibold">Targets</p>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              <Input value={pTarget} onChange={(e) => setPTarget(e.target.value)} type="number" className="h-9 w-24 text-center" placeholder={String(n.profile?.proteinTargetG ?? '')} />
              g protein/day
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Input value={kTarget} onChange={(e) => setKTarget(e.target.value)} type="number" className="h-9 w-24 text-center" placeholder={String(n.profile?.calorieTarget ?? '')} />
              kcal/day
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Input value={gainTarget} onChange={(e) => setGainTarget(e.target.value)} type="number" className="h-9 w-24 text-center" placeholder={String(n.profile?.weeklyGainTargetG ?? '')} />
              g body-weight gain/week
            </div>
            {n.suggestions && (
              <p className="text-[11px] text-muted-foreground">
                Suggested from {n.latestWeightKg} kg: {n.suggestions.proteinTargetG} g · {n.suggestions.calorieTarget} kcal (1.8 g/kg, 40 kcal/kg — edit freely, check labels).
              </p>
            )}
            <Button
              size="sm"
              className="self-start rounded-full"
              disabled={updateProfile.isPending || (pTarget.trim() === '' && kTarget.trim() === '' && gainTarget.trim() === '')}
              onClick={() =>
                updateProfile.mutate({
                  ...(pTarget.trim() !== '' && Number(pTarget) >= 30 ? { proteinTargetG: Number(pTarget) } : {}),
                  ...(kTarget.trim() !== '' && Number(kTarget) >= 1200 ? { calorieTarget: Number(kTarget) } : {}),
                  ...(gainTarget.trim() !== '' && Number(gainTarget) >= 50 ? { weeklyGainTargetG: Number(gainTarget) } : {}),
                })
              }
            >
              Save targets
            </Button>
          </div>
        </section>
      )}

      {/* quick add chips (manual totals) */}
      <section>
        <SectionHeader title="Quick add (no meal detail)" />
        <div className="flex flex-wrap gap-2">
          {PROTEIN_CHIPS.map((c) => (
            <Chip key={c.id} emoji="＋" label={`${c.label} +${c.proteinG}g`} onClick={() => addChip(c.proteinG, c.kcal)} className="text-xs" />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <Input value={customP} onChange={(e) => setCustomP(e.target.value)} type="number" inputMode="numeric" className="h-9 w-20 text-center" placeholder="g prot" />
          <Input value={customK} onChange={(e) => setCustomK(e.target.value)} type="number" inputMode="numeric" className="h-9 w-20 text-center" placeholder="kcal" />
          <Button size="sm" variant="outline" className="rounded-full" onClick={addCustom}>
            <Plus className="mr-1 size-4" /> Add
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Chip values are typical portions — check package labels. For real tracking, log meals above.</p>
      </section>

      {/* last 7 days */}
      {last7.length > 0 && (
        <section>
          <SectionHeader title="Last 7 days" />
          <div className="flex flex-col gap-1.5">
            {last7.map((d) => (
              <div key={d.iso} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-xs">
                <span className="font-medium">{formatDayLabel(d.iso)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {d.proteinG != null ? `${d.proteinG} g` : '—'} · {d.caloriesKcal != null ? `${d.caloriesKcal} kcal` : '—'}
                  {pTargetVal != null && d.proteinG != null ? (d.proteinG >= pTargetVal ? ' ✓' : '') : ''}
                </span>
              </div>
            ))}
          </div>
          {n.adherence30.loggedDays > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              30-day average {n.adherence30.avgG} g · hit target {n.adherence30.hitDays}/{n.adherence30.loggedDays} logged days
            </p>
          )}
        </section>
      )}

      {/* supplement reference */}
      <section className="rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold">Supplements — what actually matters</p>
        <div className="mt-2 flex flex-col gap-2">
          {SUPPLEMENT_NOTES.map((s) => (
            <div key={s.name} className="flex gap-2 text-xs">
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 font-semibold', s.verdict === 'Useful' ? 'bg-income/10 text-income' : s.verdict === 'Avoid' ? 'bg-expense/10 text-expense' : 'bg-muted text-muted-foreground')}>
                {s.verdict}
              </span>
              <span className="text-muted-foreground"><span className="font-medium text-foreground">{s.name}</span> — {s.detail}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

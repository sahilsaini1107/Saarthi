'use client'

// Plan create/edit sheet (Phase 13, presets widened in Phase 24). Creation
// offers a preset one-tap, a generated split, or a blank builder; editing
// covers rename/activate/delete, day rename/delete and prescription edits.

import { useState } from 'react'
import { Paperclip, Plus, Trash2 } from 'lucide-react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip, Field } from '@/components/ui/saarthi'
import { ExerciseMediaSheet } from '@/components/fitness/exercise-media-sheet'
import {
  useAddPlanDay,
  useAddPlanExercise,
  useCreatePlan,
  useDeletePlan,
  useDeletePlanDay,
  useDeletePlanExercise,
  useUpdatePlan,
  useUpdatePlanExercise,
} from '@/hooks/queries'
import { FOUNDATION_AB, PLAN_PRESETS, PLAN_PRESET_LEVELS, type PlanPreset } from '@/lib/fitness-presets'
import { GENERATOR_EQUIPMENT, GENERATOR_GOALS, generatePlan, weeklySetVolume, type GeneratorEquipment, type GeneratorGoal } from '@/lib/plan-generator'
import type { PlanDayDTO, WorkoutPlanDTO } from '@/lib/types'

type Mode = { kind: 'create' } | { kind: 'edit'; plan: WorkoutPlanDTO }
type CreateTab = 'preset' | 'generate' | 'blank'

export function PlanEditorSheet({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  mode: Mode | null
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{mode?.kind === 'edit' ? 'Edit plan' : 'New training plan'}</DrawerTitle>
          <DrawerDescription>
            {mode?.kind === 'edit'
              ? 'Tune the program as you grow — change sets, ranges and days.'
              : 'Pick a proven split, let Saarthi generate one, or build your own.'}
          </DrawerDescription>
        </DrawerHeader>
        {open && mode?.kind === 'create' && <CreateForm onClose={() => onOpenChange(false)} />}
        {open && mode?.kind === 'edit' && <EditForm plan={mode.plan} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

/* ================= create ================= */

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreatePlan({ success: 'Plan created and activated' })
  const [tab, setTab] = useState<CreateTab>('preset')
  const [presetId, setPresetId] = useState(FOUNDATION_AB.id)
  const preset: PlanPreset = PLAN_PRESETS.find((p) => p.id === presetId) ?? FOUNDATION_AB
  const [name, setName] = useState(FOUNDATION_AB.name)
  const [days, setDays] = useState(() => FOUNDATION_AB.days.map((d) => ({ label: d.label, focus: d.focus })))

  // generator state
  const [goal, setGoal] = useState<GeneratorGoal>('muscle')
  const [daysPerWeek, setDaysPerWeek] = useState(4)
  const [equipment, setEquipment] = useState<GeneratorEquipment>('gym')
  const generated = (() => {
    try {
      return generatePlan({ goal, daysPerWeek, equipment })
    } catch {
      return null
    }
  })()

  function submit() {
    if (tab === 'generate' && generated) {
      create.mutate(
        {
          name: generated.name,
          emoji: generated.emoji,
          note: generated.note,
          activate: true,
          days: generated.days.map((d) => ({
            label: d.label,
            focus: d.focus,
            exercises: d.exercises.map((e) => ({
              name: e.name,
              muscleGroup: e.muscleGroup,
              equipment: e.equipment,
              sets: e.sets,
              repMin: e.repMin ?? null,
              repMax: e.repMax ?? null,
              secondsMin: e.secondsMin ?? null,
              secondsMax: e.secondsMax ?? null,
              restSeconds: e.restSeconds,
              note: e.note ?? null,
            })),
          })),
        },
        { onSuccess: () => onClose() },
      )
      return
    }
    create.mutate(
      tab === 'preset'
        ? {
            name: preset.name,
            emoji: preset.emoji,
            note: preset.note,
            activate: true,
            days: preset.days.map((d) => ({
              label: d.label,
              focus: d.focus,
              exercises: d.exercises.map((e) => ({
                name: e.name,
                muscleGroup: e.muscleGroup,
                equipment: e.equipment,
                sets: e.sets,
                repMin: e.repMin ?? null,
                repMax: e.repMax ?? null,
                secondsMin: e.secondsMin ?? null,
                secondsMax: e.secondsMax ?? null,
                restSeconds: e.restSeconds ?? null,
                note: e.note ?? null,
              })),
            })),
          }
        : {
            name: name.trim() || 'My plan',
            activate: true,
            days: days.map((d) => ({ label: d.label.trim() || 'Workout', focus: d.focus?.trim() || null, exercises: [] })),
          },
      { onSuccess: () => onClose() },
    )
  }

  const blankValid = tab === 'blank' && name.trim().length > 0 && days.length > 0 && days.every((d) => d.label.trim().length > 0)

  return (
    <div className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto">
      <div className="flex gap-2">
        <Chip active={tab === 'preset'} emoji="🏋️" label="Proven splits" onClick={() => setTab('preset')} />
        <Chip active={tab === 'generate'} emoji="🪄" label="Generate for me" onClick={() => setTab('generate')} />
        <Chip active={tab === 'blank'} emoji="✍️" label="Build my own" onClick={() => { setTab('blank'); setName(''); setDays([{ label: 'Workout A', focus: '' }]) }} />
      </div>

      {tab === 'preset' ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {PLAN_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPresetId(p.id)}
                className={`flex shrink-0 flex-col items-start rounded-xl border px-3 py-2 text-left transition-all active:scale-95 ${
                  presetId === p.id ? 'border-primary bg-primary/10' : 'bg-card'
                }`}
              >
                <span className="text-xs font-semibold">
                  {p.emoji} {p.name}
                </span>
                <span className="text-[10px] text-muted-foreground">{PLAN_PRESET_LEVELS[p.id]}</span>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-sm font-semibold">
              {preset.emoji} {preset.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{preset.note}</p>
            <div className="mt-3 flex flex-col gap-2">
              {preset.days.map((d) => (
                <div key={d.label} className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs font-semibold">
                    {d.label} · {d.focus}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {d.exercises
                      .map(
                        (e) =>
                          `${e.name} ${e.sets}×${e.repMin != null ? `${e.repMin}–${e.repMax}` : `${e.secondsMin}–${e.secondsMax}s`}`,
                      )
                      .join(' · ')}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Lands as an ordinary plan — rename it, drop exercises, change any range.
            </p>
          </div>
        </div>
      ) : tab === 'generate' && generated ? (
        <div className="flex flex-col gap-3">
          <Field label="Goal">
            <div className="flex flex-wrap gap-2">
              {GENERATOR_GOALS.map((g) => (
                <Chip key={g.key} active={goal === g.key} emoji={g.emoji} label={g.label} onClick={() => setGoal(g.key)} />
              ))}
            </div>
          </Field>
          <Field label="Days per week">
            <div className="flex flex-wrap gap-2">
              {[2, 3, 4, 5, 6].map((n) => (
                <Chip key={n} active={daysPerWeek === n} label={`${n}×`} onClick={() => setDaysPerWeek(n)} />
              ))}
            </div>
          </Field>
          <Field label="Equipment">
            <div className="flex flex-wrap gap-2">
              {GENERATOR_EQUIPMENT.map((e) => (
                <Chip key={e.key} active={equipment === e.key} emoji={e.emoji} label={e.label} onClick={() => setEquipment(e.key)} />
              ))}
            </div>
          </Field>

          <div className="rounded-2xl border bg-card p-4">
            <p className="text-sm font-semibold">{generated.emoji} {generated.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{generated.note}</p>
            <div className="mt-3 flex flex-col gap-2">
              {generated.days.map((d) => (
                <div key={d.label} className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs font-semibold">{d.label} · {d.focus}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {d.exercises.map((e) => `${e.name} ${e.sets}×${e.repMin != null ? `${e.repMin}–${e.repMax}` : `${e.secondsMin}–${e.secondsMax}s`}`).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {weeklySetVolume(generated).map((v) => (
                <span key={v.muscleGroup} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {v.muscleGroup.replace('_', ' ')} {v.sets} sets/wk
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Plan name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Push / Pull / Legs" />
          </Field>
          {days.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={d.label}
                onChange={(e) => setDays(days.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                placeholder={`Day ${i + 1}`}
                className="flex-1"
              />
              <Input
                value={d.focus ?? ''}
                onChange={(e) => setDays(days.map((x, j) => (j === i ? { ...x, focus: e.target.value } : x)))}
                placeholder="Focus (optional)"
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                disabled={days.length <= 1}
                onClick={() => setDays(days.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {days.length < 10 && (
            <Button variant="outline" size="sm" className="self-start rounded-full" onClick={() => setDays([...days, { label: `Workout ${String.fromCharCode(65 + days.length)}`, focus: '' }])}>
              <Plus className="mr-1 size-4" /> Add day
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground">You can add exercises after creating the plan.</p>
        </div>
      )}

      <Button
        disabled={create.isPending || (tab === 'blank' && !blankValid) || (tab === 'generate' && !generated)}
        onClick={submit}
      >
        {create.isPending ? 'Creating…' : tab === 'generate' ? `Create ${generated?.name ?? 'plan'}` : 'Create plan'}
      </Button>
    </div>
  )
}

/* ================= edit ================= */

function EditForm({ plan, onClose }: { plan: WorkoutPlanDTO; onClose: () => void }) {
  const update = useUpdatePlan({ success: 'Plan updated' })
  const del = useDeletePlan({ success: 'Plan deleted' })
  const addDay = useAddPlanDay({ success: 'Day added' })
  const delDay = useDeletePlanDay({ success: 'Day removed' })
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto">
      <div className="flex items-center gap-2">
        <Input
          defaultValue={plan.name}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v && v !== plan.name) update.mutate({ id: plan.id, name: v })
          }}
          className="flex-1"
        />
        <Button size="sm" variant={plan.active ? 'default' : 'outline'} className="rounded-full" onClick={() => update.mutate({ id: plan.id, active: !plan.active })}>
          {plan.active ? '★ Active' : 'Activate'}
        </Button>
      </div>
      {plan.note && <p className="text-xs text-muted-foreground">{plan.note}</p>}

      {plan.days.map((day) => (
        <DayEditor key={day.id} day={day} />
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={addDay.isPending}
          onClick={() => addDay.mutate({ planId: plan.id, label: `Workout ${String.fromCharCode(65 + plan.days.length)}` })}
        >
          <Plus className="mr-1 size-4" /> Add day
        </Button>
        <Button
          variant={confirmDelete ? 'destructive' : 'ghost'}
          size="sm"
          className="rounded-full"
          onClick={() => {
            if (confirmDelete) {
              del.mutate(plan.id, { onSuccess: () => onClose() })
            } else setConfirmDelete(true)
          }}
        >
          <Trash2 className="mr-1 size-4" /> {confirmDelete ? 'Tap again to delete plan' : 'Delete plan'}
        </Button>
      </div>
    </div>
  )
}

function DayEditor({ day }: { day: PlanDayDTO }) {
  const delDay = useDeletePlanDay({ success: 'Day removed' })
  const delPe = useDeletePlanExercise({ success: 'Exercise removed' })
  const updPe = useUpdatePlanExercise()
  const [mediaFor, setMediaFor] = useState<{ id: string; name: string } | null>(null)

  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{day.label}{day.focus ? <span className="font-normal text-muted-foreground"> · {day.focus}</span> : null}</p>
        <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => delDay.mutate(day.id)}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      {day.exercises.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No exercises yet — add one below.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {day.exercises.map((pe) => (
            <div key={pe.id} className="flex items-center gap-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium">{pe.name}</span>
              <button
                type="button"
                aria-label={`Media for ${pe.name}`}
                onClick={() => setMediaFor({ id: pe.exerciseId, name: pe.name })}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Paperclip className="size-3.5" />
              </button>
              <Input
                defaultValue={pe.sets}
                type="number"
                min={1}
                max={20}
                className="h-7 w-14 px-1 text-center"
                onBlur={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isInteger(v) && v >= 1 && v <= 20 && v !== pe.sets) updPe.mutate({ id: pe.id, sets: v })
                }}
              />
              <span className="text-muted-foreground">×{pe.repMin != null ? `${pe.repMin}–${pe.repMax}` : pe.secondsMin != null ? `${pe.secondsMin}–${pe.secondsMax}s` : '?'}</span>
              <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" onClick={() => delPe.mutate(pe.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <AddPlanExerciseRow dayId={day.id} />

      <ExerciseMediaSheet
        open={mediaFor != null}
        onOpenChange={(o) => {
          if (!o) setMediaFor(null)
        }}
        exerciseId={mediaFor?.id ?? ''}
        exerciseName={mediaFor?.name ?? ''}
        media={null}
      />
    </div>
  )
}

function AddPlanExerciseRow({ dayId }: { dayId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [sets, setSets] = useState('3')
  const [repMin, setRepMin] = useState('8')
  const [repMax, setRepMax] = useState('12')
  const add = useAddPlanExercise({ success: 'Exercise added' })

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="mt-1 h-7 rounded-full text-xs" onClick={() => setOpen(true)}>
        <Plus className="mr-1 size-3" /> Exercise
      </Button>
    )
  }
  const valid = name.trim().length > 0 && Number(sets) >= 1
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-muted/50 p-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exercise name" className="h-8 text-xs" />
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Input value={sets} onChange={(e) => setSets(e.target.value)} type="number" className="h-7 w-14 px-1 text-center" /> sets
        <Input value={repMin} onChange={(e) => setRepMin(e.target.value)} type="number" className="h-7 w-14 px-1 text-center" />–
        <Input value={repMax} onChange={(e) => setRepMax(e.target.value)} type="number" className="h-7 w-14 px-1 text-center" /> reps
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7 rounded-full text-xs"
          disabled={!valid || add.isPending}
          onClick={() =>
            add.mutate(
              {
                dayId,
                name: name.trim(),
                sets: Number(sets),
                ...(Number(repMin) > 0 ? { repMin: Number(repMin) } : {}),
                ...(Number(repMax) > 0 ? { repMax: Number(repMax) } : {}),
              },
              {
                onSuccess: () => {
                  setName('')
                  setOpen(false)
                },
              },
            )
          }
        >
          Add
        </Button>
        <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

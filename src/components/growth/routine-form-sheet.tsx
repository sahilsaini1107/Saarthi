'use client'

// Routine builder: ordered steps with optional per-step minutes.
// The full step list is sent on save — the server replaces it atomically.

import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/saarthi'
import { useDeleteRoutine, useSaveRoutine } from '@/hooks/queries'
import { WEEKDAY_LABELS } from '@/lib/constants'
import type { RoutineStepDTO, RoutineWithMeta } from '@/lib/types'
import { cn } from '@/lib/utils'

interface StepDraft {
  key: string
  title: string
  minutes: string
}

function toDrafts(steps: RoutineStepDTO[]): StepDraft[] {
  return steps.map((s, i) => ({ key: `${s.id}-${i}`, title: s.title, minutes: s.minutes != null ? String(s.minutes) : '' }))
}

export function RoutineFormSheet({
  open,
  onOpenChange,
  routine,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  routine?: RoutineWithMeta | null
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{routine ? 'Edit routine' : 'Build a routine'}</DrawerTitle>
          <DrawerDescription>Chain small steps into one tap-to-play sequence — mornings and evenings on autopilot.</DrawerDescription>
        </DrawerHeader>
        {open && <RoutineForm key={routine?.id ?? 'new'} routine={routine ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

const ROUTINE_EMOJIS = ['🌅', '🌙', '⚡', '🧘', '📚', '🏋️', '🧴', '☕']

function RoutineForm({ routine, onClose }: { routine: RoutineWithMeta | null; onClose: () => void }) {
  const save = useSaveRoutine({ success: routine ? 'Routine updated' : 'Routine created' })
  const del = useDeleteRoutine({ success: 'Routine removed' })
  const [name, setName] = useState(routine?.name ?? '')
  const [emoji, setEmoji] = useState(routine?.emoji ?? '🌅')
  const [weekdays, setWeekdays] = useState<string>(routine?.weekdays ?? '1111111')
  const [reminder, setReminder] = useState(routine?.reminderTime ?? '')
  const [steps, setSteps] = useState<StepDraft[]>(routine ? toDrafts(routine.steps) : [{ key: 's0', title: '', minutes: '' }])

  const valid = name.trim().length > 0 && steps.length > 0 && steps.every((s) => s.title.trim().length > 0)

  function setStep(i: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }

  function move(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function onSave() {
    if (!valid) return
    save.mutate(
      {
        ...(routine ? { id: routine.id } : {}),
        name: name.trim(),
        emoji,
        weekdays,
        reminderTime: reminder || null,
        steps: steps.map((s) => ({ title: s.title.trim(), minutes: s.minutes ? Number(s.minutes) : null })),
      },
      { onSuccess: onClose },
    )
  }

  const totalMin = steps.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0)

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Routine name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning kickstart" />
      </Field>

      <Field label="Icon">
        <div className="flex flex-wrap gap-2">
          {ROUTINE_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={cn(
                'flex size-10 items-center justify-center rounded-xl border text-lg transition-all active:scale-90',
                emoji === e ? 'border-primary bg-primary/10' : 'bg-card',
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Days to play">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((label, i) => {
            const on = weekdays[i] === '1'
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const chars = weekdays.padEnd(7, '1').slice(0, 7).split('')
                  chars[i] = on ? '0' : '1'
                  setWeekdays(chars.join(''))
                }}
                className={cn(
                  'flex h-10 items-center justify-center rounded-xl border text-sm font-semibold transition-all active:scale-90',
                  on ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Reminder" hint="Optional nudge before you usually run this">
        <Input type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} className="h-11 rounded-xl" />
      </Field>

      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-medium text-muted-foreground">
          Steps {totalMin > 0 && <span className="text-xs">· ~{totalMin} min total</span>}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-full px-2.5 text-xs"
          disabled={steps.length >= 20}
          onClick={() => setSteps((prev) => [...prev, { key: `s${Date.now()}`, title: '', minutes: '' }])}
        >
          <Plus className="mr-1 size-3.5" /> Step
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 rounded-xl border bg-card p-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <Input value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder="Step title" className="h-9 rounded-lg border-0 bg-transparent px-2 shadow-none focus-visible:ring-1" />
              <Input
                inputMode="numeric"
                value={s.minutes}
                onChange={(e) => setStep(i, { minutes: e.target.value.replace(/\D/g, '') })}
                placeholder="minutes (optional)"
                className="h-7 rounded-lg border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none focus-visible:ring-1"
              />
            </div>
            <div className="flex shrink-0 flex-col">
              <button type="button" aria-label="move up" onClick={() => move(i, -1)} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0}>
                <ArrowUp className="size-3.5" />
              </button>
              <button type="button" aria-label="move down" onClick={() => move(i, 1)} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === steps.length - 1}>
                <ArrowDown className="size-3.5" />
              </button>
            </div>
            <button
              type="button"
              aria-label="remove step"
              onClick={() => setSteps((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))}
              className="shrink-0 rounded-lg p-2 text-expense hover:bg-expense/10"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <Button onClick={onSave} disabled={!valid || save.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {save.isPending ? 'Saving…' : routine ? 'Save changes' : 'Create routine'}
      </Button>
      {routine && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Delete "${routine.name}" and its run history?`)) del.mutate(routine.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          Delete routine
        </Button>
      )}
    </div>
  )
}

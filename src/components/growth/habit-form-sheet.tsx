'use client'

// Habit create/edit sheet. Weekday chips write a Mon..Sun bitstring,
// building window defaults to 66 days (the brief's habit-building mode).

import { useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/saarthi'
import { Switch } from '@/components/ui/switch'
import { useDeleteHabit, useSaveHabit } from '@/hooks/queries'
import { HABIT_COLORS, HABIT_EMOJIS, WEEKDAY_LABELS } from '@/lib/constants'
import { todayISO } from '@/lib/date'
import type { HabitWithStats } from '@/lib/types'
import { cn } from '@/lib/utils'

export function HabitFormSheet({
  open,
  onOpenChange,
  habit,
  tz,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  habit?: HabitWithStats | null
  tz: string
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{habit ? 'Edit habit' : 'Build a new habit'}</DrawerTitle>
          <DrawerDescription>
            Check in daily and watch the streak grow. 66 days is all it takes.
          </DrawerDescription>
        </DrawerHeader>
        {open && <HabitForm key={habit?.id ?? 'new'} habit={habit ?? null} tz={tz} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function HabitForm({ habit, tz, onClose }: { habit: HabitWithStats | null; tz: string; onClose: () => void }) {
  const save = useSaveHabit({ success: habit ? 'Habit updated' : 'Habit added — day 1 starts now' })
  const del = useDeleteHabit({ success: 'Habit removed' })
  const [name, setName] = useState(habit?.name ?? '')
  const [emoji, setEmoji] = useState(habit?.emoji ?? '✅')
  const [color, setColor] = useState(habit?.color ?? HABIT_COLORS[0])
  const [weekdays, setWeekdays] = useState<string>(habit?.weekdays ?? '1111111')
  const [buildingDays, setBuildingDays] = useState(habit ? String(habit.buildingDays) : '66')
  const [startDate, setStartDate] = useState(habit?.startDate ?? todayISO(tz))
  const [reminder, setReminder] = useState(habit?.reminderTime ?? '')

  const valid = name.trim().length > 0 && /^[01]{7}$/.test(weekdays) && weekdays.includes('1')

  function toggleDay(i: number) {
    const chars = weekdays.padEnd(7, '1').slice(0, 7).split('')
    chars[i] = chars[i] === '1' ? '0' : '1'
    setWeekdays(chars.join(''))
  }

  function onSave() {
    if (!valid) return
    save.mutate(
      {
        ...(habit ? { id: habit.id } : {}),
        name: name.trim(),
        emoji,
        color,
        weekdays,
        buildingDays: Number(buildingDays) || 66,
        startDate,
        reminderTime: reminder || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Habit name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning run" />
      </Field>

      <Field label="Icon">
        <div className="flex flex-wrap gap-2">
          {HABIT_EMOJIS.map((e) => (
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

      <Field label="Colour">
        <div className="flex gap-2">
          {HABIT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`colour ${c}`}
              onClick={() => setColor(c)}
              className={cn('size-8 rounded-full border-2 transition-transform active:scale-90', color === c ? 'border-foreground' : 'border-transparent')}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>

      <Field label="Repeat on" hint="Unscheduled days never break your streak — rest days are free.">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((label, i) => {
            const on = weekdays[i] === '1'
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Building window (days)" hint="66 is the science-backed default">
          <Input inputMode="numeric" value={buildingDays} onChange={(e) => setBuildingDays(e.target.value.replace(/\D/g, ''))} placeholder="66" />
        </Field>
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 rounded-xl" />
        </Field>
      </div>

      <Field label="Daily reminder" hint="Optional — a local nudge at this time each day">
        <Input type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} className="h-11 rounded-xl" />
      </Field>

      {habit && (
        <div className="flex items-center justify-between rounded-xl border p-3">
          <div>
            <p className="text-sm font-medium">Archived</p>
            <p className="text-xs text-muted-foreground">Hidden from Today; history is kept</p>
          </div>
          <Switch
            checked={habit.archived}
            onCheckedChange={(v) => {
              save.mutate({ id: habit.id, archived: v })
              onClose()
            }}
          />
        </div>
      )}

      <Button onClick={onSave} disabled={!valid || save.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {save.isPending ? 'Saving…' : habit ? 'Save changes' : 'Start building'}
      </Button>
      {habit && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Delete "${habit.name}" and all its check-ins? This cannot be undone.`)) del.mutate(habit.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          Delete habit
        </Button>
      )}
    </div>
  )
}

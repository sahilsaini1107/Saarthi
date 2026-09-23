'use client'

// Practice log sheet (Phase 17) — one sitting of deliberate practice.
// Quick-minute chips keep entry under 10 seconds; the note is optional.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Field } from '@/components/ui/saarthi'
import { useLogPractice } from '@/hooks/queries'
import { cn } from '@/lib/utils'
import type { SkillWithStats } from '@/lib/types'

const QUICK_MINUTES = [15, 25, 45, 60, 90]

export function PracticeSheet({
  skill,
  today,
  onOpenChange,
}: {
  skill: SkillWithStats | null
  today: string
  onOpenChange: (o: boolean) => void
}) {
  const open = Boolean(skill)
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Log practice — {skill?.name}</DrawerTitle>
          <DrawerDescription>Every minute counts as 1 XP. Multiple sessions a day are welcome.</DrawerDescription>
        </DrawerHeader>
        {open && skill && <PracticeForm key={skill.id} skill={skill} today={today} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function PracticeForm({ skill, today, onClose }: { skill: SkillWithStats; today: string; onClose: () => void }) {
  const log = useLogPractice({ success: 'Practice logged' })
  const [minutes, setMinutes] = useState(25)
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const pending = log.isPending

  function onSave() {
    if (minutes < 1) return
    log.mutate({ skillId: skill.id, date, minutes, note: note.trim() || null }, { onSuccess: onClose })
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Minutes">
        <div className="flex flex-wrap gap-2">
          {QUICK_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              className={cn(
                'flex h-10 min-w-14 items-center justify-center rounded-full border px-3 text-sm font-semibold tabular-nums transition-all active:scale-95',
                minutes === m ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {m}m
            </button>
          ))}
        </div>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          value={minutes || ''}
          onChange={(e) => setMinutes(Math.max(0, Math.min(1440, Number(e.target.value) || 0)))}
          className="mt-2"
          aria-label="Custom minutes"
        />
      </Field>

      <Field label="Day" hint="Retro-logging yesterday's session is fine">
        <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <Field label="What did you practice?" hint="Optional — future-you will thank present-you">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 3 scales at 80bpm, chord transitions…" className="min-h-16 rounded-xl" />
      </Field>

      <Button onClick={onSave} disabled={minutes < 1 || pending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {pending ? 'Saving…' : `+${minutes} XP`}
      </Button>
    </div>
  )
}

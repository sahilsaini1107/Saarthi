'use client'

// Touchpoint log sheet (Phase 17) — one interaction, under 10 seconds:
// pick the type, optional note, done.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Field } from '@/components/ui/saarthi'
import { useLogTouchpoint } from '@/hooks/queries'
import { TOUCH_TYPES, TOUCH_TYPE_META } from '@/lib/people'
import { cn } from '@/lib/utils'
import type { PersonWithMeta } from '@/lib/types'

export function TouchSheet({
  person,
  today,
  onOpenChange,
}: {
  person: PersonWithMeta | null
  today: string
  onOpenChange: (o: boolean) => void
}) {
  const open = Boolean(person)
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Touched base — {person?.name}</DrawerTitle>
          <DrawerDescription>The reconnect clock resets the moment you log this.</DrawerDescription>
        </DrawerHeader>
        {open && person && <TouchForm key={person.id} person={person} today={today} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function TouchForm({ person, today, onClose }: { person: PersonWithMeta; today: string; onClose: () => void }) {
  const log = useLogTouchpoint({ success: 'Touchpoint logged' })
  const [type, setType] = useState('call')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const pending = log.isPending

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="How">
        <div className="flex flex-wrap gap-2">
          {TOUCH_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-all active:scale-95',
                type === t ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              <span aria-hidden>{TOUCH_TYPE_META[t].emoji}</span> {TOUCH_TYPE_META[t].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Day" hint="Logging yesterday's long call counts too">
        <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <Field label="What did you talk about?" hint="Optional — but names, plans and promises are gold later">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Catching up; she's hiring in March — send the deck" className="min-h-16 rounded-xl" />
      </Field>

      <Button onClick={() => log.mutate({ personId: person.id, date, type, note: note.trim() || null }, { onSuccess: onClose })} disabled={pending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {pending ? 'Saving…' : 'Log touchpoint'}
      </Button>
    </div>
  )
}

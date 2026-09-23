'use client'

// Person form (Phase 17) — who matters, how often you want to see them, and
// where they came from. Cadence defaults come from importance; an explicit
// override wins.

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Field } from '@/components/ui/saarthi'
import { useCreatePerson, useDeletePerson, useUpdatePerson } from '@/hooks/queries'
import { PERSON_CATEGORIES } from '@/lib/people'
import { cn } from '@/lib/utils'
import type { PersonWithMeta } from '@/lib/types'

const IMPORTANCE_META = [
  { value: 3, label: 'Core', hint: '~2×/month' },
  { value: 2, label: 'Regular', hint: '~monthly' },
  { value: 1, label: 'Extended', hint: '~quarterly' },
]

export function PersonFormSheet({
  open,
  onOpenChange,
  person,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  person?: PersonWithMeta | null
}) {
  const isEdit = Boolean(person)
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Edit person' : 'Add person'}</DrawerTitle>
          <DrawerDescription>The network you actually keep — not a contacts dump.</DrawerDescription>
        </DrawerHeader>
        {open && <PersonForm key={isEdit ? person!.id : 'new'} person={person ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function PersonForm({ person, onClose }: { person: PersonWithMeta | null; onClose: () => void }) {
  const isNew = !person
  const create = useCreatePerson({ success: 'Person added' })
  const save = useUpdatePerson({ success: 'Person updated' })
  const del = useDeletePerson({ success: 'Person removed' })
  const [name, setName] = useState(isNew ? '' : person.name)
  const [category, setCategory] = useState(isNew ? 'friend' : person.category)
  const [importance, setImportance] = useState(isNew ? 2 : person.importance)
  const [cadenceEnabled, setCadenceEnabled] = useState(!isNew && person.cadenceOverride != null)
  const [cadenceDays, setCadenceDays] = useState(!isNew && person.cadenceOverride != null ? person.cadenceOverride : 30)
  const [role, setRole] = useState(isNew ? '' : (person.role ?? ''))
  const [howMet, setHowMet] = useState(isNew ? '' : (person.howMet ?? ''))
  const [contact, setContact] = useState(isNew ? '' : (person.contact ?? ''))
  const [tags, setTags] = useState(isNew ? '' : person.tags.join(', '))
  const [notes, setNotes] = useState(isNew ? '' : (person.notes ?? ''))
  const [archived, setArchived] = useState(isNew ? false : person.archived)
  const pending = create.isPending || save.isPending
  const valid = name.trim().length > 0

  function onSave() {
    if (!valid) return
    const payload = {
      name: name.trim(),
      category,
      importance,
      cadenceDays: cadenceEnabled ? cadenceDays : null,
      role: role.trim() || null,
      howMet: howMet.trim() || null,
      contact: contact.trim() || null,
      tags: tags.trim() || null,
      notes: notes.trim() || null,
    }
    if (isNew) create.mutate(payload, { onSuccess: onClose })
    else save.mutate({ id: person.id, ...payload, archived }, { onSuccess: onClose })
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aditi Sharma" />
      </Field>

      <Field label="Circle">
        <div className="flex flex-wrap gap-2">
          {PERSON_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-all active:scale-95',
                category === c.key ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              <span aria-hidden>{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Importance" hint="Sets the default reconnect cadence">
        <div className="flex gap-2">
          {IMPORTANCE_META.map((i) => (
            <button
              key={i.value}
              type="button"
              onClick={() => setImportance(i.value)}
              className={cn(
                'flex h-14 flex-1 flex-col items-center justify-center rounded-xl border text-sm font-medium transition-all active:scale-95',
                importance === i.value ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              <span>{i.label}</span>
              <span className={cn('text-[10px]', importance === i.value ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{i.hint}</span>
            </button>
          ))}
        </div>
      </Field>

      <div className="flex items-center justify-between rounded-xl border bg-card p-3">
        <div>
          <p className="text-sm font-medium">Custom cadence</p>
          <p className="text-xs text-muted-foreground">Override the default (e.g. every 10 days)</p>
        </div>
        <Switch checked={cadenceEnabled} onCheckedChange={setCadenceEnabled} aria-label="Custom cadence" />
      </div>
      {cadenceEnabled && (
        <Field label={`Every ${cadenceDays} day${cadenceDays === 1 ? '' : 's'}`}>
          <input
            type="range"
            min={1}
            max={180}
            value={Math.min(cadenceDays, 180)}
            onChange={(e) => setCadenceDays(Number(e.target.value))}
            className="w-full accent-primary"
            aria-label="Cadence in days"
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Role / where">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="SDE2 at X" />
        </Field>
        <Field label="Contact">
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="handle / phone / link" />
        </Field>
      </div>

      <Field label="How you met" hint="Optional — context is memory fuel">
        <Input value={howMet} onChange={(e) => setHowMet(e.target.value)} placeholder="e.g. conference 2025, ex-colleague" />
      </Field>

      <Field label="Tags" hint="Comma-separated, e.g. goa-trip, college">
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="college, startup-circle" />
      </Field>

      <Field label="Notes" hint="What they care about, promises made, last conversation thread">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Wants intro to a design mentor; recommend books, don't small-talk" className="min-h-16 rounded-xl" />
      </Field>

      {!isNew && (
        <div className="flex items-center justify-between rounded-xl border bg-card p-3">
          <div>
            <p className="text-sm font-medium">Archived</p>
            <p className="text-xs text-muted-foreground">Archived people hide from the reconnect engine</p>
          </div>
          <Switch checked={archived} onCheckedChange={setArchived} aria-label="Archived" />
        </div>
      )}

      <Button onClick={onSave} disabled={!valid || pending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {pending ? 'Saving…' : isNew ? 'Add person' : 'Save changes'}
      </Button>

      {!isNew && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Delete "${person.name}" and all touchpoints?`)) del.mutate(person.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          <Trash2 className="mr-1 size-4" /> Delete person
        </Button>
      )}
    </div>
  )
}

'use client'

// Journal entry editor: templates seed the body, mood is one tap,
// tags are free-typed comma-separated and sanitised server-side.

import { useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/saarthi'
import { useDeleteJournalEntry, useSaveJournalEntry } from '@/hooks/queries'
import { JOURNAL_TEMPLATES } from '@/lib/constants'
import { MOOD_META, MOODS } from '@/lib/journal'
import { todayISO } from '@/lib/date'
import type { JournalEntryDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

export function EntryFormSheet({
  open,
  onOpenChange,
  entry,
  tz,
  defaultDate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  entry?: JournalEntryDTO | null
  tz: string
  defaultDate?: string
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{entry ? 'Edit entry' : 'New entry'}</DrawerTitle>
          <DrawerDescription>Two honest lines beat a perfect page you never write.</DrawerDescription>
        </DrawerHeader>
        {open && (
          <EntryForm
            key={entry?.id ?? 'new'}
            entry={entry ?? null}
            tz={tz}
            defaultDate={defaultDate}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function EntryForm({
  entry,
  tz,
  defaultDate,
  onClose,
}: {
  entry: JournalEntryDTO | null
  tz: string
  defaultDate?: string
  onClose: () => void
}) {
  const save = useSaveJournalEntry({ success: entry ? 'Entry updated' : 'Entry saved' })
  const del = useDeleteJournalEntry({ success: 'Entry deleted' })
  const [title, setTitle] = useState(entry?.title ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [mood, setMood] = useState<string | null>(entry?.mood ?? null)
  const [tags, setTags] = useState(entry?.tags.join(', ') ?? '')
  const [date, setDate] = useState(entry?.date ?? defaultDate ?? todayISO(tz))

  const valid = content.trim().length > 0

  function applyTemplate(tplKey: string) {
    const tpl = JOURNAL_TEMPLATES.find((t) => t.key === tplKey)
    if (!tpl) return
    setContent((c) => (c.trim() ? `${c.trimEnd()}\n\n${tpl.content()}` : tpl.content()))
  }

  function onSave() {
    if (!valid) return
    save.mutate(
      {
        ...(entry ? { id: entry.id } : {}),
        title: title.trim() || null,
        content: content,
        mood,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        date,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="flex max-h-[72vh] flex-col gap-3 overflow-y-auto">
      <div className="flex flex-wrap gap-2">
        {JOURNAL_TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            title={t.hint}
            onClick={() => applyTemplate(t.key)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium transition-all hover:bg-accent active:scale-95"
          >
            <span aria-hidden>{t.emoji}</span> {t.name}
          </button>
        ))}
      </div>

      <Field label="Title (optional)">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A few words about today…" />
      </Field>

      <Field label="Entry">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="How was your day? What's on your mind?"
          className="min-h-40 rounded-xl bg-card text-base"
        />
      </Field>

      <Field label="Mood">
        <div className="flex justify-between gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              aria-label={MOOD_META[m].label}
              onClick={() => setMood((cur) => (cur === m ? null : m))}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-xl border py-2 transition-all active:scale-90',
                mood === m ? 'border-primary bg-primary/10' : 'bg-card',
              )}
            >
              <span className="text-xl" aria-hidden>
                {MOOD_META[m].emoji}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground">{MOOD_META[m].label}</span>
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tags" hint="Comma separated">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="work, family" />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl" />
        </Field>
      </div>

      <Button onClick={onSave} disabled={!valid || save.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {save.isPending ? 'Saving…' : entry ? 'Save changes' : 'Save entry'}
      </Button>
      {entry && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm('Delete this entry? This cannot be undone.')) del.mutate(entry.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          Delete entry
        </Button>
      )}
    </div>
  )
}

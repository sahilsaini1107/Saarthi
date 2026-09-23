'use client'

// Life Principles (Phase 15) — the personal constitution. Define rules you
// refuse to break, review each one daily (kept / broken / n-a), capture what
// happened when you break one, and watch adherence compound into character.

import { useState } from 'react'
import { Pencil, Plus, ScrollText, Trash2 } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { EmptyState, ErrorCard, Field, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import {
  useCreatePrinciple,
  useDeletePrinciple,
  usePrinciples,
  useSetPrincipleCheck,
  useUpdatePrinciple,
} from '@/hooks/queries'
import { todayISO } from '@/lib/date'
import { PRINCIPLE_CATEGORIES } from '@/lib/principles'
import { cn } from '@/lib/utils'
import type { PrincipleStatus } from '@/lib/principles'
import type { PrincipleWithStats } from '@/lib/types'

const STARTERS: { title: string; detail: string; category: string }[] = [
  { title: 'I don’t lie — even when it’s inconvenient', detail: 'Trust compounds faster than any shortcut.', category: 'character' },
  { title: 'First hour of the day is phone-free', detail: 'Own the morning before the world owns you.', category: 'discipline' },
  { title: 'I spend less than I earn', detail: 'The one money rule every other rule stands on.', category: 'money' },
  { title: 'Move every day — train, walk, stretch', detail: 'The body carries everything else you’re building.', category: 'health' },
  { title: 'Reach out to one person I care about, weekly', detail: 'Relationships die of silence, not of conflict.', category: 'relationships' },
  { title: 'Ship before perfect', detail: 'Done and improved beats imaginary and flawless.', category: 'work' },
]

export function PrinciplesScreen() {
  const { user } = useUi()
  const today = todayISO(user.timezone)
  const principles = usePrinciples()
  const check = useSetPrincipleCheck({ success: 'Recorded' })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PrincipleWithStats | 'new' | { prefill: (typeof STARTERS)[number] }>('new')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  if (principles.isLoading) return <SkeletonRow />
  if (principles.isError) return <ErrorCard message={(principles.error as Error).message} onRetry={() => principles.refetch()} />

  const list = principles.data ?? []
  const active = list.filter((p) => p.active)
  const archived = list.filter((p) => !p.active)
  const judged = active.filter((p) => p.adherence30 !== null)
  const adherenceMean = judged.length
    ? Math.round((judged.reduce((s, p) => s + (p.adherence30 ?? 0), 0) / judged.length) * 100)
    : null
  const reviewedToday = active.filter((p) => p.todayStatus !== null).length

  function mark(p: PrincipleWithStats, status: PrincipleStatus) {
    check.mutate(
      { principleId: p.id, date: today, status },
      {
        onSuccess: () => {
          if (status === 'broken') {
            setExpanded(p.id)
            setNoteDraft(p.todayNote ?? '')
          }
        },
      },
    )
  }

  async function saveNote(p: PrincipleWithStats) {
    if (!p.todayStatus) return
    await check.mutateAsync({ principleId: p.id, date: today, status: p.todayStatus, note: noteDraft || null })
    setNoteDraft('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Principles</h1>
          <p className="text-sm text-muted-foreground">Your constitution — the rules you don’t break.</p>
        </div>
        <Button
          size="sm"
          className="h-9 rounded-full"
          onClick={() => {
            setEditing('new')
            setFormOpen(true)
          }}
        >
          <Plus className="mr-1 size-4" /> New
        </Button>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border bg-card p-3 text-center">
            <p className="text-lg font-bold tabular-nums">
              {reviewedToday}/{active.length}
            </p>
            <p className="text-[10px] text-muted-foreground">reviewed today</p>
          </div>
          <div className="rounded-2xl border bg-card p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{adherenceMean !== null ? `${adherenceMean}%` : '—'}</p>
            <p className="text-[10px] text-muted-foreground">kept · 30 days</p>
          </div>
          <div className="rounded-2xl border bg-card p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{active.reduce((s, p) => s + p.breaks30, 0)}</p>
            <p className="text-[10px] text-muted-foreground">breaks · 30 days</p>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          emoji="📜"
          title="No principles yet"
          body="Write the rules you refuse to break. Each day you mark them kept or broken — honesty here is the whole exercise. Tap a suggestion to start:"
          action={
            <div className="mt-3 flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => {
                    setEditing({ prefill: s })
                    setFormOpen(true)
                  }}
                  className="rounded-xl border bg-card px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent"
                >
                  + {s.title}
                </button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="mt-1 self-center rounded-full"
                onClick={() => {
                  setEditing('new')
                  setFormOpen(true)
                }}
              >
                <ScrollText className="mr-1 size-4" /> Write my own
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          <SectionHeader title="Review today" />
          {active.map((p) => (
            <PrincipleRow
              key={p.id}
              p={p}
              today={today}
              busy={check.isPending}
              expanded={expanded === p.id}
              noteDraft={expanded === p.id ? noteDraft : ''}
              onNoteDraft={setNoteDraft}
              onToggleExpand={() => {
                const opening = expanded !== p.id
                setExpanded(opening ? p.id : null)
                setNoteDraft(opening ? (p.todayNote ?? '') : '')
              }}
              onMark={(status) => mark(p, status)}
              onSaveNote={() => saveNote(p)}
              onEdit={() => {
                setEditing(p)
                setFormOpen(true)
              }}
            />
          ))}

          {archived.length > 0 && (
            <>
              <SectionHeader title="Archived" />
              {archived.map((p) => (
                <ArchivedRow key={p.id} p={p} />
              ))}
            </>
          )}
        </div>
      )}

      <PrincipleFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        principle={editing && editing !== 'new' && !('prefill' in editing) ? editing : null}
        prefill={editing && typeof editing === 'object' && 'prefill' in editing ? editing.prefill : undefined}
      />
    </div>
  )
}

/* ---------- row ---------- */

function PrincipleRow({
  p,
  today,
  busy,
  expanded,
  noteDraft,
  onNoteDraft,
  onToggleExpand,
  onMark,
  onSaveNote,
  onEdit,
}: {
  p: PrincipleWithStats
  today: string
  busy: boolean
  expanded: boolean
  noteDraft: string
  onNoteDraft: (v: string) => void
  onToggleExpand: () => void
  onMark: (status: PrincipleStatus) => void
  onSaveNote: () => void
  onEdit: () => void
}) {
  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center gap-2 p-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggleExpand} aria-expanded={expanded}>
          <p className="truncate text-sm font-semibold">
            {p.title}
            {p.keptStreak > 0 && <span className="ml-1.5 whitespace-nowrap text-xs font-medium text-warn">🔥 {p.keptStreak}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {p.categoryEmoji} {p.categoryLabel}
            {p.adherence30 !== null && ` · ${Math.round(p.adherence30 * 100)}% kept`}
            {p.breaks30 > 0 && ` · ${p.breaks30} break${p.breaks30 === 1 ? '' : 's'}`}
          </p>
        </button>
        <Seg3 status={p.todayStatus} busy={busy} onMark={onMark} />
        <button
          type="button"
          aria-label={`Edit ${p.title}`}
          onClick={onEdit}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t px-3.5 py-3">
          <DayStrip days={p.recent} today={today} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted p-2">
              <p className="text-sm font-bold tabular-nums">{p.longestRun}</p>
              <p className="text-[10px] text-muted-foreground">longest run</p>
            </div>
            <div className="rounded-xl bg-muted p-2">
              <p className="text-sm font-bold tabular-nums">{p.breaks30}</p>
              <p className="text-[10px] text-muted-foreground">breaks 30d</p>
            </div>
            <div className="rounded-xl bg-muted p-2">
              <p className="truncate text-sm font-bold tabular-nums">{p.lastBreak ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground">last break</p>
            </div>
          </div>

          {p.detail && <p className="mt-3 rounded-xl bg-muted p-2.5 text-xs text-muted-foreground">“{p.detail}”</p>}

          {p.todayStatus === 'broken' && (
            <div className="mt-3">
              {/* Save sits in the label row — never below the fold behind the bottom nav */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">What happened? What triggered it?</p>
                <Button size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-xs" onClick={onSaveNote}>
                  Save note
                </Button>
              </div>
              <p className="mb-1.5 text-xs text-muted-foreground">Name the trigger and the fix — that's how a rule gets stronger.</p>
              <Textarea
                value={noteDraft}
                onChange={(e) => onNoteDraft(e.target.value)}
                placeholder="e.g. Scrolled reels after waking. Fix: phone charges outside the bedroom."
                className="min-h-16 rounded-xl"
              />
            </div>
          )}
          {p.todayStatus === 'kept' && (
            <p className="mt-3 rounded-xl bg-income/10 p-2.5 text-xs font-medium text-income">Kept today ✓ — streak safe.</p>
          )}
          {p.todayStatus === 'na' && (
            <p className="mt-3 rounded-xl bg-muted p-2.5 text-xs text-muted-foreground">Marked n/a today — streak not affected.</p>
          )}
        </div>
      )}
    </div>
  )
}

function ArchivedRow({ p }: { p: PrincipleWithStats }) {
  const update = useUpdatePrinciple({ success: 'Principle restored' })
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 opacity-60">
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">ARCHIVED</span>
      <p className="min-w-0 flex-1 truncate text-sm">{p.title}</p>
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => update.mutate({ id: p.id, active: true })}>
        Restore
      </Button>
    </div>
  )
}

/* ---------- today's 3-state segmented control (shared with Today card) ---------- */

export function Seg3({
  status,
  busy,
  onMark,
  size = 'default',
}: {
  status: PrincipleStatus | null
  busy?: boolean
  onMark: (s: PrincipleStatus) => void
  size?: 'default' | 'sm'
}) {
  const dim = size === 'sm'
  const opts: { key: PrincipleStatus; label: string; on: string }[] = [
    { key: 'kept', label: '✓', on: 'bg-income text-white' },
    { key: 'broken', label: '✗', on: 'bg-expense text-white' },
    { key: 'na', label: '–', on: 'bg-muted-foreground text-white' },
  ]
  return (
    <div role="group" aria-label="Mark today" className={cn('flex shrink-0 items-center rounded-full border p-0.5', dim ? 'gap-0.5' : 'gap-1')}>
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-label={o.key === 'kept' ? 'Kept' : o.key === 'broken' ? 'Broke it' : 'Not applicable'}
          aria-pressed={status === o.key}
          disabled={busy}
          onClick={() => onMark(o.key)}
          className={cn(
            'flex items-center justify-center rounded-full font-bold transition-all active:scale-90',
            dim ? 'size-7 text-xs' : 'size-8 text-sm',
            status === o.key ? `${o.on} border-transparent` : 'text-muted-foreground hover:bg-accent',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- 14-day strip ---------- */

function DayStrip({ days, today }: { days: PrincipleWithStats['recent']; today: string }) {
  return (
    <div className="flex justify-between gap-1" aria-label="Last 14 days">
      {days.map((d) => (
        <div
          key={d.iso}
          title={`${d.iso}${d.status ? `: ${d.status}` : ': not reviewed'}`}
          aria-label={`${d.iso}${d.status ? `: ${d.status}` : ': not reviewed'}`}
          className={cn(
            'h-6 flex-1 rounded-md border',
            d.status === 'kept' && 'border-transparent bg-income',
            d.status === 'broken' && 'border-transparent bg-expense',
            d.status === 'na' && 'border-transparent bg-muted-foreground/40',
            d.status === null && !d.future && 'bg-muted',
            d.future && 'border-dashed opacity-40',
            d.iso === today && 'ring-1 ring-primary/50',
          )}
        />
      ))}
    </div>
  )
}

/* ---------- form sheet ---------- */

export function PrincipleFormSheet({
  open,
  onOpenChange,
  principle,
  prefill,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  principle?: PrincipleWithStats | null
  prefill?: { title: string; detail: string; category: string }
}) {
  const isEdit = Boolean(principle)
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Edit principle' : 'New principle'}</DrawerTitle>
          <DrawerDescription>Keep it sharp and personal — a rule you can honestly judge every day.</DrawerDescription>
        </DrawerHeader>
        {open && (
          <PrincipleForm
            key={isEdit ? principle!.id : prefill?.title ?? 'new'}
            principle={principle ?? null}
            prefill={prefill}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function PrincipleForm({
  principle,
  prefill,
  onClose,
}: {
  principle: PrincipleWithStats | null
  prefill?: { title: string; detail: string; category: string }
  onClose: () => void
}) {
  const isNew = !principle
  const create = useCreatePrinciple({ success: 'Principle added' })
  const save = useUpdatePrinciple({ success: 'Principle updated' })
  const del = useDeletePrinciple({ success: 'Principle removed' })
  const [title, setTitle] = useState(isNew ? (prefill?.title ?? '') : principle.title)
  const [detail, setDetail] = useState(isNew ? (prefill?.detail ?? '') : (principle.detail ?? ''))
  const [category, setCategory] = useState(isNew ? (prefill?.category ?? 'character') : principle.category)
  const [active, setActive] = useState(isNew ? true : principle.active)
  const pending = create.isPending || save.isPending
  const valid = title.trim().length > 0

  function onSave() {
    if (!valid) return
    if (isNew) {
      create.mutate({ title: title.trim(), detail: detail.trim() || null, category, active: true }, { onSuccess: onClose })
    } else {
      save.mutate({ id: principle.id, title: title.trim(), detail: detail.trim() || null, category, active }, { onSuccess: onClose })
    }
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="The rule">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. I never skip two days in a row" />
      </Field>

      <Field label="Why it matters" hint="Optional — the reason you'll reread on hard days">
        <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="What breaking this actually costs you…" className="min-h-16 rounded-xl" />
      </Field>

      <Field label="Area">
        <div className="flex flex-wrap gap-2">
          {PRINCIPLE_CATEGORIES.map((c) => (
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

      {!isNew && (
        <div className="flex items-center justify-between rounded-xl border bg-card p-3">
          <div>
            <p className="text-sm font-medium">Active</p>
            <p className="text-xs text-muted-foreground">Inactive principles hide from daily review</p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} aria-label="Active" />
        </div>
      )}

      <Button onClick={onSave} disabled={!valid || pending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {pending ? 'Saving…' : isNew ? 'Add principle' : 'Save changes'}
      </Button>

      {!isNew && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Delete "${principle.title}" and its full review history?`)) del.mutate(principle.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          <Trash2 className="mr-1 size-4" /> Delete principle
        </Button>
      )}
    </div>
  )
}

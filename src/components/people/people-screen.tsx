'use client'

// People (Phase 17) — a personal CRM. The reconnect engine sorts who needs a
// tap: overdue first, then never-touched, due today, and the healthy rest.

import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorCard, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { PersonFormSheet } from '@/components/people/person-form-sheet'
import { TouchSheet } from '@/components/people/touch-sheet'
import { useDeleteTouchpoint, usePeople, useUpdatePerson } from '@/hooks/queries'
import { todayISO } from '@/lib/date'
import { TOUCH_TYPE_META, isTouchType } from '@/lib/people'
import { cn } from '@/lib/utils'
import type { PersonWithMeta } from '@/lib/types'

const IMPORTANCE_BADGE: Record<number, { label: string; cls: string }> = {
  3: { label: 'CORE', cls: 'bg-primary/15 text-primary' },
  2: { label: 'REGULAR', cls: 'bg-muted text-muted-foreground' },
  1: { label: 'EXTENDED', cls: 'bg-muted text-muted-foreground' },
}

type Filter = 'attention' | 'all' | 'archived'

export function PeopleScreen() {
  const { user } = useUi()
  const today = todayISO(user.timezone)
  const people = usePeople()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PersonWithMeta | 'new' | null>(null)
  const [touchTarget, setTouchTarget] = useState<PersonWithMeta | null>(null)
  const [filter, setFilter] = useState<Filter>('attention')
  const [expanded, setExpanded] = useState<string | null>(null)

  if (people.isLoading) return <SkeletonRow />
  if (people.isError) return <ErrorCard message={(people.error as Error).message} onRetry={() => people.refetch()} />

  const list = people.data ?? []
  const active = list.filter((p) => !p.archived)
  const archived = list.filter((p) => p.archived)
  const needsAttention = active.filter((p) => p.reconnect.status !== 'ok')
  const visible = filter === 'archived' ? archived : filter === 'attention' ? needsAttention : active
  const touchedToday = active.filter((p) => p.reconnect.daysSinceLast === 0).length

  function initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">Relationships die of silence. Keep the clock honest.</p>
        </div>
        <Button
          size="sm"
          className="h-9 rounded-full"
          onClick={() => {
            setEditing('new')
            setFormOpen(true)
          }}
        >
          <Plus className="mr-1 size-4" /> Add
        </Button>
      </div>

      {list.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border bg-card p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{needsAttention.length}</p>
              <p className="text-[10px] text-muted-foreground">need a tap</p>
            </div>
            <div className="rounded-2xl border bg-card p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{active.length}</p>
              <p className="text-[10px] text-muted-foreground">tracked</p>
            </div>
            <div className="rounded-2xl border bg-card p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{touchedToday}</p>
              <p className="text-[10px] text-muted-foreground">touched today</p>
            </div>
          </div>

          <div className="flex gap-1.5">
            {(
              [
                { key: 'attention', label: `Needs a tap (${needsAttention.length})` },
                { key: 'all', label: `All (${active.length})` },
                { key: 'archived', label: `Archived (${archived.length})` },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-semibold transition-all active:scale-95',
                  filter === f.key ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}

      {list.length === 0 ? (
        <EmptyState
          emoji="🤝"
          title="No people yet"
          body="Add the people you genuinely want in your life — mentors, friends, colleagues. Saarthi nudges you before the relationship goes quiet."
          action={
            <Button
              size="sm"
              variant="outline"
              className="mt-3 self-center rounded-full"
              onClick={() => {
                setEditing('new')
                setFormOpen(true)
              }}
            >
              <Plus className="mr-1 size-4" /> Add your first person
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          emoji={filter === 'attention' ? '🎉' : '🗂️'}
          title={filter === 'attention' ? 'Everyone is in rhythm' : 'Nothing here'}
          body={filter === 'attention' ? 'Nobody is overdue or due — the network is warm. Switch to All to browse.' : 'No people in this view.'}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filter !== 'attention' && <SectionHeader title={filter === 'archived' ? 'Archived' : 'By reconnect urgency'} />}
          {visible.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              today={today}
              expanded={expanded === p.id}
              onToggleExpand={() => setExpanded(expanded === p.id ? null : p.id)}
              onTouch={() => setTouchTarget(p)}
              onEdit={() => {
                setEditing(p)
                setFormOpen(true)
              }}
              initials={initials(p.name)}
            />
          ))}
        </div>
      )}

      <PersonFormSheet open={formOpen} onOpenChange={setFormOpen} person={editing && editing !== 'new' ? editing : null} />
      <TouchSheet person={touchTarget} today={today} onOpenChange={(o) => !o && setTouchTarget(null)} />
    </div>
  )
}

/* ---------- row ---------- */

function reconnectBadge(p: PersonWithMeta): { text: string; cls: string } {
  const { status, dueInDays } = p.reconnect
  if (status === 'overdue') return { text: `Overdue ${Math.abs(dueInDays)}d`, cls: 'bg-expense/15 text-expense' }
  if (status === 'never') return { text: 'Never touched', cls: 'bg-warn/15 text-warn' }
  if (status === 'due') return { text: 'Due today', cls: 'bg-warn/15 text-warn' }
  return { text: dueInDays <= 7 ? `Due in ${dueInDays}d` : `Due in ${dueInDays}d`, cls: 'bg-muted text-muted-foreground' }
}

function PersonRow({
  person,
  today,
  expanded,
  onToggleExpand,
  onTouch,
  onEdit,
  initials,
}: {
  person: PersonWithMeta
  today: string
  expanded: boolean
  onToggleExpand: () => void
  onTouch: () => void
  onEdit: () => void
  initials: string
}) {
  const delTouch = useDeleteTouchpoint({ success: 'Touchpoint removed' })
  const update = useUpdatePerson()
  const badge = reconnectBadge(person)
  const imp = IMPORTANCE_BADGE[person.importance]

  return (
    <div className={cn('rounded-2xl border bg-card', person.archived && 'opacity-60')}>
      <div className="flex items-center gap-2 p-3">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onToggleExpand} aria-expanded={expanded}>
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-bold text-primary">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{person.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {person.categoryEmoji} {person.categoryLabel}
              {person.role ? ` · ${person.role}` : ''}
              {` · every ${person.cadenceDays}d`}
            </p>
          </div>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', badge.cls)}>{badge.text}</span>
        </button>
        <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold" onClick={onTouch}>
          Log
        </Button>
        <button
          type="button"
          aria-label={`Edit ${person.name}`}
          onClick={onEdit}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t px-3.5 py-3">
          <DayStrip days={person.recent} today={today} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted p-2">
              <p className="truncate text-sm font-bold tabular-nums">{person.lastTouch ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground">last touch</p>
            </div>
            <div className="rounded-xl bg-muted p-2">
              <p className="text-sm font-bold tabular-nums">{person.touchCount30}</p>
              <p className="text-[10px] text-muted-foreground">touches · 30d</p>
            </div>
            <div className="rounded-xl bg-muted p-2">
              <p className="text-sm font-bold tabular-nums">{person.touchCount}</p>
              <p className="text-[10px] text-muted-foreground">all time</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', imp.cls)}>{imp.label}</span>
            {person.howMet && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">met: {person.howMet}</span>}
            {person.tags.map((t) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>

          {person.contact && (
            <p className="mt-3 rounded-xl bg-muted p-2.5 text-xs">
              <span className="font-medium">Contact:</span> {person.contact}
            </p>
          )}
          {person.notes && <p className="mt-2 rounded-xl bg-muted p-2.5 text-xs text-muted-foreground">“{person.notes}”</p>}

          {person.logs.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Recent touchpoints</p>
              {person.logs.map((log) => (
                <div key={log.id} className="flex items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-2">
                  <span aria-hidden className="text-sm">
                    {isTouchType(log.type) ? TOUCH_TYPE_META[log.type].emoji : '✳️'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">{log.note ?? <span className="text-muted-foreground">{isTouchType(log.type) ? TOUCH_TYPE_META[log.type].label : 'Touchpoint'}</span>}</p>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{log.date}</span>
                  <button
                    type="button"
                    aria-label="Delete touchpoint"
                    onClick={() => delTouch.mutate({ personId: person.id, touchId: log.id })}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-expense"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {person.archived && (
            <Button size="sm" variant="ghost" className="mt-2 h-8 text-xs" onClick={() => update.mutate({ id: person.id, archived: false })}>
              Restore from archive
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- 14-day touch strip ---------- */

function DayStrip({ days, today }: { days: PersonWithMeta['recent']; today: string }) {
  return (
    <div className="flex justify-between gap-1" aria-label="Last 14 days of touchpoints">
      {days.map((d) => (
        <div
          key={d.iso}
          title={`${d.iso}${d.count ? `: ${d.count} touchpoint${d.count > 1 ? 's' : ''}` : ': nothing'}`}
          aria-label={`${d.iso}${d.count ? `: ${d.count}` : ': nothing'}`}
          className={cn(
            'h-6 flex-1 rounded-md border',
            d.count === 1 && 'border-transparent bg-primary/50',
            d.count > 1 && 'border-transparent bg-primary',
            d.count === 0 && 'bg-muted',
          )}
        />
      ))}
      <span className="sr-only">today: {today}</span>
    </div>
  )
}

'use client'

// Ideas Lab (Phase 18) — capture sparks, grow the promising ones through the
// lean-canvas pipeline, ship them. ICE ranks the board; a deterministic
// spark-of-the-day resurfaces one live idea daily (quote-rotation pattern).

import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorCard, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { IdeaFormSheet } from '@/components/ideas/idea-form-sheet'
import { useIdeas, useUpdateIdea } from '@/hooks/queries'
import { todayISO } from '@/lib/date'
import { ageLabel, daysInPipeline, iceBand, iceScore, sortForAction, sparkOfTheDay } from '@/lib/ideas'
import { cn } from '@/lib/utils'
import type { IdeaDTO } from '@/lib/types'

type Filter = 'pipeline' | 'launched' | 'shelved'

const STARTERS = [
  { title: 'A paid newsletter', category: 'business' },
  { title: 'Micro-SaaS for creators', category: 'startup' },
  { title: 'YouTube channel on my skills', category: 'content' },
]

const BAND_STYLES: Record<string, string> = {
  strong: 'bg-income/15 text-income',
  promising: 'bg-primary/10 text-primary',
  seed: 'bg-muted text-muted-foreground',
}
export function IdeasScreen() {
  const { user } = useUi()
  const today = todayISO(user.timezone)
  const ideas = useIdeas()
  const update = useUpdateIdea({ success: 'Idea updated' })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<IdeaDTO | 'new' | null>(null)
  const [prefill, setPrefill] = useState<{ title: string } | undefined>(undefined)
  const [filter, setFilter] = useState<Filter>('pipeline')
  const [expanded, setExpanded] = useState<string | null>(null)

  if (ideas.isLoading) return <SkeletonRow />
  if (ideas.isError) return <ErrorCard message={(ideas.error as Error).message} onRetry={() => ideas.refetch()} />

  const list = ideas.data ?? []
  const pipeline = sortForAction(list.filter((i) => i.status === 'spark' || i.status === 'exploring' || i.status === 'planned'))
  const launched = list.filter((i) => i.status === 'launched')
  const shelved = list.filter((i) => i.status === 'parked' || i.status === 'dropped')
  const shown = filter === 'pipeline' ? pipeline : filter === 'launched' ? launched : shelved

  const scores = pipeline.map((i) => iceScore(i.impact, i.confidence, i.effort) ?? 0)
  const avgIce = scores.length ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100 : null
  const spark = sparkOfTheDay(list.filter((i) => i.status === 'spark' || i.status === 'exploring' || i.status === 'planned'), today)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ideas Lab</h1>
          <p className="text-sm text-muted-foreground">Spark → exploring → planned → launched. ICE picks what&apos;s next.</p>
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

      {list.length === 0 ? (
        <EmptyState
          emoji="💡"
          title="No ideas yet"
          body="Business, startup, content, personal projects — capture the spark first, grow the canvas later. Tap a starter or name your own:"
          action={
            <div className="mt-3 flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => {
                    setPrefill({ title: s.title })
                    setEditing('new')
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
                  setPrefill(undefined)
                  setEditing('new')
                  setFormOpen(true)
                }}
              >
                Capture my own
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border bg-card p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{pipeline.length}</p>
              <p className="text-[10px] text-muted-foreground">in pipeline</p>
            </div>
            <div className="rounded-2xl border bg-card p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{avgIce != null ? avgIce : '—'}</p>
              <p className="text-[10px] text-muted-foreground">avg ICE</p>
            </div>
            <div className="rounded-2xl border bg-card p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{launched.length}</p>
              <p className="text-[10px] text-muted-foreground">launched 🚢</p>
            </div>
          </div>

          {spark && (
            <section>
              <SectionHeader title="Today's spark" />
              <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
                <p className="text-sm font-bold">{spark.title}</p>
                {spark.nextStep ? (
                  <p className="pt-1 text-xs text-muted-foreground">Next: {spark.nextStep}</p>
                ) : (
                  <p className="pt-1 text-xs text-muted-foreground">Give it 15 minutes today — define its next step.</p>
                )}
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === spark.id ? null : spark.id)}
                  className="pt-2 text-xs font-medium text-primary"
                >
                  Open idea →
                </button>
              </div>
            </section>
          )}

          <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {(
              [
                ['pipeline', 'Pipeline'],
                ['launched', 'Launched'],
                ['shelved', 'Shelved'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  'flex h-9 items-center justify-center rounded-lg text-sm font-semibold transition-colors',
                  filter === key ? 'bg-card shadow-sm' : 'text-muted-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {shown.map((i) => (
              <IdeaRow
                key={i.id}
                idea={i}
                today={today}
                highlighted={spark?.id === i.id}
                expanded={expanded === i.id}
                onToggleExpand={() => setExpanded(expanded === i.id ? null : i.id)}
                onEdit={() => {
                  setEditing(i)
                  setFormOpen(true)
                }}
                onStatus={(status) => update.mutate({ id: i.id, status })}
              />
            ))}
            {shown.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
          </div>
        </>
      )}

      <IdeaFormSheet
        open={formOpen}
        prefill={editing === 'new' ? prefill : undefined}
        onOpenChange={(o) => {
          setFormOpen(o)
          if (!o) {
            setEditing(null)
            setPrefill(undefined)
          }
        }}
        idea={editing && editing !== 'new' ? editing : null}
      />
    </div>
  )
}

function IdeaRow({
  idea,
  today,
  highlighted,
  expanded,
  onToggleExpand,
  onEdit,
  onStatus,
}: {
  idea: IdeaDTO
  today: string
  highlighted?: boolean
  expanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onStatus: (s: string) => void
}) {
  const age = idea.addedOn ? daysInPipeline(idea.addedOn, today) : 0
  return (
    <div
      className={cn(
        'rounded-2xl border bg-card',
        highlighted && 'border-primary/40',
        (idea.status === 'dropped' || idea.status === 'parked') && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-3 p-3.5">
        <button type="button" aria-label="Toggle details" onClick={onToggleExpand} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-lg">
              {idea.categoryEmoji}
            </span>
            <p className="truncate text-sm font-semibold">{idea.title}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {idea.statusEmoji} {idea.statusLabel} · saved {age === 0 ? 'today' : `${ageLabel(age)} ago`}
            {idea.nextStep ? ` · next: ${idea.nextStep}` : ' · no next step yet'}
          </p>
        </button>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
            BAND_STYLES[iceBand(idea.ice)],
          )}
          title={`Impact ${idea.impact} × Confidence ${idea.confidence} ÷ Effort ${idea.effort}`}
        >
          ICE {idea.ice ?? '—'}
        </span>
        <button type="button" aria-label="Edit" onClick={onEdit} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
          <Pencil className="size-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t px-3.5 py-3">
          <IdeaCanvas idea={idea} />
          <IdeaActions idea={idea} onStatus={onStatus} />
        </div>
      )}
    </div>
  )
}

const CANVAS_BLOCKS: { key: keyof Pick<IdeaDTO, 'problem' | 'audience' | 'value' | 'solution' | 'revenue' | 'costs' | 'metrics' | 'advantage'>; label: string }[] = [
  { key: 'problem', label: 'Problem' },
  { key: 'audience', label: 'Audience' },
  { key: 'value', label: 'Unique value' },
  { key: 'solution', label: 'Solution' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'costs', label: 'Costs' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'advantage', label: 'Unfair advantage' },
]

function IdeaCanvas({ idea }: { idea: IdeaDTO }) {
  const filled = CANVAS_BLOCKS.filter((b) => (idea[b.key] ?? '') !== '')
  if (filled.length === 0 && !idea.notes) {
    return <p className="text-xs text-muted-foreground">The lean canvas is empty — open the edit sheet to grow this idea.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {filled.map((b) => (
        <div key={b.key} className="rounded-xl bg-muted p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{b.label}</p>
          <p className="pt-0.5 text-sm leading-relaxed">{idea[b.key]}</p>
        </div>
      ))}
      {idea.notes && (
        <div className="rounded-xl border border-dashed p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Notes</p>
          <p className="whitespace-pre-wrap pt-0.5 text-sm leading-relaxed">{idea.notes}</p>
        </div>
      )}
      {idea.tags.length > 0 && <p className="text-[11px] text-primary/80">{idea.tags.map((t) => `#${t}`).join(' ')}</p>}
    </div>
  )
}

function IdeaActions({ idea, onStatus }: { idea: IdeaDTO; onStatus: (s: string) => void }) {
  const moves: { label: string; to: string; primary?: boolean }[] = []
  if (idea.status === 'spark') moves.push({ label: '🔍 Start exploring', to: 'exploring', primary: true })
  if (idea.status === 'exploring') moves.push({ label: '🛠️ Move to planned', to: 'planned', primary: true })
  if (idea.status === 'planned') moves.push({ label: '🚢 Launch', to: 'launched', primary: true })
  if (!['launched', 'parked', 'dropped'].includes(idea.status)) moves.push({ label: '⏸️ Park', to: 'parked' }, { label: '✖️ Drop', to: 'dropped' })
  if (idea.status === 'parked' || idea.status === 'dropped' || idea.status === 'launched') moves.push({ label: '↩ Back to pipeline', to: 'spark' })
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {moves.map((m) => (
        <button
          key={m.to}
          type="button"
          onClick={() => onStatus(m.to)}
          className={cn(
            'h-9 rounded-full px-3.5 text-xs font-semibold transition-all active:scale-95',
            m.primary ? 'border-transparent bg-primary text-primary-foreground' : 'border text-muted-foreground hover:bg-accent',
            m.to === 'launched' && 'border-transparent bg-income text-white',
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

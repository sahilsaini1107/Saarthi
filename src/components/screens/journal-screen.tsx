'use client'

// Journal tab (Phase 2): search + mood/tag filters, streak stat, and the
// entry list. Tapping an entry opens the editor.
// Phase 5.3: this tab is also the Reflection pillar home — the Life Score
// breakdown lives at the top.
// Phase 12: "💡 Key learnings" monthly digest — every key takeaway captured
// in goal-journal milestone logs this month, grouped by goal, with a month
// stepper to browse history.

import { useMemo, useState } from 'react'
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, Flame, Plus, Search } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip, EmptyState, ErrorCard, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { EntryFormSheet } from '@/components/journal/entry-form-sheet'
import { useJournal, useJournalLearnings, useLifeScore } from '@/hooks/queries'
import { formatDayLabel, formatMonthLabel, shiftMonthKey } from '@/lib/date'
import { formatMinutes } from '@/lib/effort-grid'
import { MOOD_META, isMood } from '@/lib/journal'
import { cn } from '@/lib/utils'
import type { JournalEntryDTO, LearningItemDTO } from '@/lib/types'
import type { LifeScorePayload } from '@/services/lifescore'

const MOOD_FILTERS = ['great', 'good', 'okay', 'low', 'bad'] as const

/** "YYYY-MM" for the user's current month, resolved client-side in their tz. */
function currentMonthKeyIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date())
}

/* ---------- Key-learnings digest (Phase 12) ---------- */

interface LearningGoalGroup {
  goalId: string
  goalTitle: string
  goalEmoji: string
  goalColor: string
  items: LearningItemDTO[]
}

function KeyLearningsDigest({ monthKey, setMonthKey, tz }: { monthKey: string; setMonthKey: (key: string) => void; tz: string }) {
  const { navigate } = useUi()
  const query = useJournalLearnings(monthKey)
  const items = query.data?.items ?? []
  const thisMonth = currentMonthKeyIn(tz)
  const atNow = monthKey >= thisMonth

  // group by goal (goals with the most learnings first — the digest reads as
  // "which goals taught me this month"); items arrive newest-first
  const groups = useMemo<LearningGoalGroup[]>(() => {
    const map = new Map<string, LearningGoalGroup>()
    for (const it of items) {
      const g =
        map.get(it.goalId) ??
        { goalId: it.goalId, goalTitle: it.goalTitle, goalEmoji: it.goalEmoji, goalColor: it.goalColor, items: [] }
      g.items.push(it)
      map.set(it.goalId, g)
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length)
  }, [items])

  return (
    <section className="rounded-2xl border bg-card p-4" data-testid="key-learnings">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">💡 Key learnings</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            data-testid="learnings-prev"
            onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            data-testid="learnings-next"
            disabled={atNow}
            onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {formatMonthLabel(monthKey)} ·{' '}
          {query.data
            ? `${query.data.stats.count} takeaway${query.data.stats.count === 1 ? '' : 's'}${
                query.data.stats.count > 0
                  ? ` · ${formatMinutes(query.data.stats.totalMinutes)} across ${query.data.stats.goalCount} goal${query.data.stats.goalCount === 1 ? '' : 's'}`
                  : ''
              }`
            : '…'}
        </p>
      </div>

      {query.isLoading ? (
        <SkeletonRow />
      ) : query.isError ? (
        <ErrorCard message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title={atNow ? 'No key learnings yet this month' : 'Nothing captured this month'}
          body={
            atNow
              ? 'Add a 💡 takeaway whenever you log goal progress — your best insights will collect here for the monthly review.'
              : 'No takeaways were captured in this month. Step through your months with the arrows above.'
          }
          compact
        />
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.goalId} className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => navigate('/growth/goals')}
                className="flex items-center gap-1.5 self-start text-xs font-semibold hover:text-foreground"
                title="Open your goals"
              >
                <span className="text-sm" aria-hidden>
                  {g.goalEmoji}
                </span>
                <span className="truncate">{g.goalTitle}</span>
                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: `${g.goalColor}1a`, color: g.goalColor }}>
                  {g.items.length}
                </span>
              </button>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => navigate('/growth/goals')}
                  className="rounded-xl bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <p className="text-[11px] font-bold tabular-nums text-muted-foreground">
                    {formatDayLabel(it.date)} · {it.milestoneTitle} · {formatMinutes(it.minutes)}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-primary">💡 {it.keyLearning}</p>
                  {it.learned && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">📚 {it.learned}</p>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/* ---------- Life Score breakdown (Phase 5.3) ---------- */

function LifeScoreBreakdown({ data }: { data: LifeScorePayload }) {
  const pillars: { key: string; label: string; emoji: string; score: number | null; components: { label: string; score: number | null }[] }[] = [
    { key: 'wealth', label: 'Wealth', emoji: '💰', score: data.wealth.score, components: data.wealth.components },
    { key: 'growth', label: 'Growth', emoji: '🌱', score: data.growth.score, components: data.growth.components },
    { key: 'reflection', label: 'Reflection', emoji: '🪞', score: data.reflection.score, components: data.reflection.components },
  ]
  const allComponents = pillars.flatMap((pillar) => pillar.components)
  const measured = allComponents.filter((component) => component.score !== null).length
  const coverage = allComponents.length ? Math.round((measured / allComponents.length) * 100) : 0
  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Life Score</p>
          <p className="text-xs text-muted-foreground">
            {coverage < 50 ? 'Early estimate' : 'Measured from your recent activity'} · {measured}/{allComponents.length} signals available
          </p>
        </div>
        <p
          className={cn(
            'text-3xl font-bold tabular-nums',
            data.overall === null ? 'text-muted-foreground' : data.overall >= 75 ? 'text-income' : data.overall >= 50 ? 'text-primary' : 'text-warn',
          )}
        >
          {data.overall ?? '—'}
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {pillars.map((p) => (
          <div key={p.key}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">
                <span className="mr-1" aria-hidden>
                  {p.emoji}
                </span>
                {p.label}
              </span>
              <span className="font-bold tabular-nums">{p.score ?? '—'}</span>
            </div>
            <div className="mt-1">
              <ProgressBar
                value={p.score ?? 0}
                tone={p.score === null ? 'primary' : p.score >= 75 ? 'income' : p.score >= 50 ? 'primary' : 'warn'}
                className="h-1.5"
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {p.components.map((c) => (
                <span
                  key={c.label}
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums',
                    c.score === null ? 'bg-muted text-muted-foreground/70' : c.score >= 75 ? 'bg-income/10 text-income' : c.score >= 50 ? 'bg-primary/10 text-primary' : 'bg-warn/10 text-warn',
                  )}
                >
                  {c.label} {c.score === null ? '—' : Math.round(c.score)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function JournalScreen() {
  const { user } = useUi()
  const [q, setQ] = useState('')
  const [mood, setMood] = useState<string>('')
  const [tag, setTag] = useState<string>('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<JournalEntryDTO | null>(null)
  const [showInsights, setShowInsights] = useState(false)
  const life = useLifeScore()
  // Phase 12 — digest month under review (defaults to the user's current month)
  const [learnMonth, setLearnMonth] = useState(() => currentMonthKeyIn(user.timezone))

  // debounce-free: TanStack Query keys change per keystroke but the fetch is
  // cheap at personal scale; debouncing arrives with the Phase 7 polish pass.
  const journal = useJournal({ q, mood, tag })

  const items = journal.data?.items ?? []

  const grouped = useMemo(() => {
    const groups: { label: string; entries: JournalEntryDTO[] }[] = []
    for (const e of items) {
      const label = formatDayLabel(e.date)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.entries.push(e)
      else groups.push({ label, entries: [e] })
    }
    return groups
  }, [items])

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journal</h1>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Flame className="size-3.5 text-warn" />
              {journal.data?.streakDays ?? 0}-day streak
            </span>
            · {journal.data?.monthCount ?? 0} this month
          </p>
        </div>
        <Button
          size="sm"
          className="h-9 rounded-full"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="mr-1 size-4" /> Write
        </Button>
      </header>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <button
          type="button"
          onClick={() => setShowInsights((value) => !value)}
          aria-expanded={showInsights}
          className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Reflection insights</span>
            <span className="block text-xs text-muted-foreground">
              Life Score {life.data?.overall ?? '—'} · monthly lessons and trends
            </span>
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', showInsights && 'rotate-180')} />
        </button>
        {showInsights && (
          <div className="flex flex-col gap-3 border-t p-3">
            {life.data && <LifeScoreBreakdown data={life.data} />}
            <KeyLearningsDigest monthKey={learnMonth} setMonthKey={setLearnMonth} tz={user.timezone} />
          </div>
        )}
      </section>

      {/* search + filters */}
      <div className="flex flex-col gap-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entries…" className="h-11 rounded-xl bg-card pl-9" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5">
          <Chip label="All moods" active={mood === ''} onClick={() => setMood('')} />
          {MOOD_FILTERS.map((m) => (
            <Chip key={m} emoji={MOOD_META[m].emoji} label={MOOD_META[m].label} active={mood === m} onClick={() => setMood(mood === m ? '' : m)} />
          ))}
        </div>
        {(journal.data?.topTags.length ?? 0) > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5">
            {journal.data!.topTags.map((t) => (
              <Chip key={t} label={`#${t}`} active={tag === t} onClick={() => setTag(tag === t ? '' : t)} />
            ))}
          </div>
        )}
      </div>

      {/* list */}
      {journal.isLoading ? (
        <SkeletonRow />
      ) : journal.isError ? (
        <ErrorCard message={(journal.error as Error).message} onRetry={() => journal.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          emoji="📔"
          title={q || mood || tag ? 'Nothing matches' : 'Your story starts here'}
          body={
            q || mood || tag
              ? 'Try a different search or clear the filters.'
              : 'One honest paragraph a day. Templates make it a 60-second habit — gratitude, wins, lessons, tomorrow\u2019s priority.'
          }
          action={
            !q && !mood && !tag ? (
              <Button
                size="sm"
                className="mt-2 rounded-full"
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="mr-1 size-4" /> Write the first one
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((group) => (
            <section key={group.label}>
              <SectionHeader title={group.label} />
              <div className="flex flex-col gap-2">
                {group.entries.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      setEditing(e)
                      setFormOpen(true)
                    }}
                    className={cn(
                      'flex w-full gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent',
                      isMood(e.mood ?? '') && 'border-l-4',
                    )}
                    style={isMood(e.mood ?? '') ? { borderLeftColor: MOOD_META[e.mood as keyof typeof MOOD_META].color } : undefined}
                  >
                    <span className="text-xl" aria-hidden>
                      {e.mood && isMood(e.mood) ? MOOD_META[e.mood].emoji : '📝'}
                    </span>
                    <div className="min-w-0 flex-1">
                      {e.title && <p className="truncate text-sm font-semibold">{e.title}</p>}
                      <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{e.content}</p>
                      {e.tags.length > 0 && (
                        <p className="mt-1.5 flex flex-wrap gap-1">
                          {e.tags.map((t) => (
                            <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              #{t}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {journal.data?.nextOffset == null && items.length >= 5 && (
            <p className="text-center text-xs text-muted-foreground">
              {'You\u2019ve reached the beginning — '}{journal.data?.total ?? items.length} entries kept.
            </p>
          )}
        </div>
      )}

      <EntryFormSheet open={formOpen} onOpenChange={setFormOpen} entry={editing} tz={user.timezone} />
    </div>
  )
}

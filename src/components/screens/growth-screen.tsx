'use client'

// Growth tab — hub over six modules (Phase 3): Habits, Routines, Goals,
// Study, Body, Skin. Deep screens live at #/growth/<module>.

import { useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Dumbbell,
  Flame,
  Pencil,
  Play,
  Plus,
  Repeat2,
  ScrollText,
  Target,
} from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import {
  EmptyState,
  ErrorCard,
  ProgressBar,
  SectionHeader,
  SkeletonRow,
} from '@/components/ui/saarthi'
import { StreakCalendar } from '@/components/ui/streak-calendar'
import { HabitFormSheet } from '@/components/growth/habit-form-sheet'
import { HabitGridPanel } from '@/components/growth/habit-grid-panel'
import { RoutineFormSheet } from '@/components/growth/routine-form-sheet'
import { RoutinePlay } from '@/components/growth/routine-play'
import {
  useBodyMetrics,
  useBooks,
  useCheckIn,
  useCheckInHabit,
  useContent,
  useCourses,
  useFitnessSummary,
  useGoals,
  useHabits,
  useIdeas,
  usePeople,
  usePrinciples,
  useQuotes,
  useRoutines,
  useSkills,
  useSaveRoutine,
  useSkin,
  useWorkouts,
} from '@/hooks/queries'
import { todayISO } from '@/lib/date'
import { DINCHARYA } from '@/lib/dincharya'
import { cn } from '@/lib/utils'
import type { HabitWithStats, RoutineWithMeta } from '@/lib/types'

type Tab = 'habits' | 'routines'

interface HubCard {
  path: string
  emoji: string
  title: string
  sub: string
}

/** One hub tile. Extracted so every section renders identically. */
function HubTile({ card, onClick }: { card: HubCard; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex min-h-20 items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-accent hover:shadow-sm sm:min-h-28 sm:flex-col sm:items-stretch sm:gap-2 sm:p-4"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-xl sm:size-auto sm:justify-start sm:bg-transparent"
        aria-hidden
      >
        {card.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{card.title}</p>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{card.sub}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:absolute sm:top-4 sm:right-4" />
    </button>
  )
}

/* ================= Hub (default /growth) ================= */

export function GrowthHub() {
  const { user, navigate } = useUi()
  const [showMore, setShowMore] = useState(false)
  const habits = useHabits()
  const routines = useRoutines()
  const goals = useGoals()
  const courses = useCourses()
  const workouts = useWorkouts()
  const skin = useSkin()
  const fitness = useFitnessSummary()
  const checkIn = useCheckIn()
  const principles = usePrinciples()
  const books = useBooks()
  const quotes = useQuotes()
  const skills = useSkills()
  const people = usePeople()
  const content = useContent()
  const ideas = useIdeas()

  const loading = habits.isLoading || routines.isLoading || goals.isLoading || courses.isLoading
  const err = [habits, routines, goals, courses].find((q) => q.isError)
  if (err) return <ErrorCard message={(err.error as Error).message} onRetry={() => err.refetch()} />
  if (loading)
    return (
      <div className="flex min-h-[60vh] flex-col gap-5">
        <h1 className="px-1 text-2xl font-bold tracking-tight">Growth</h1>
        <SkeletonRow />
      </div>
    )

  const habitList = habits.data ?? []
  const scheduled = habitList.filter((h) => h.scheduledToday)
  const habitsDone = scheduled.filter((h) => h.doneToday).length
  const routinesPlayed = (routines.data ?? []).filter((r) => r.todayRun).length
  const activeGoals = (goals.data ?? []).filter((g) => g.status === 'active')
  const goalPct = activeGoals.length
    ? Math.round((activeGoals.reduce((s, g) => s + g.progress, 0) / activeGoals.length) * 100)
    : 0
  const activeCourses = (courses.data ?? []).filter((c) => c.status === 'active')
  const revisionsDue = (courses.data ?? []).reduce((s, c) => s + c.stats.revisionsDue, 0)
  const lastWorkout = workouts.data?.workouts[0]
  const fitnessSub = fitness.data?.openSession
    ? 'Session in progress — tap to continue'
    : fitness.data?.nextWorkout
      ? `Next: ${fitness.data.nextWorkout.label} · ${fitness.data.week.sessions}× this week`
      : fitness.data?.lastSession
        ? `Last: ${fitness.data.lastSession.label} ${fitness.data.lastSession.durationMin}m`
        : 'Strength plans · progression · fuel'
  const checkInMissing = checkIn.data?.prompts.filter((p) => !p.answered).length ?? 0
  const checkInSub = checkIn.data
    ? checkInMissing === 0
      ? `All done today${checkIn.data.streak ? ` \u00b7 ${checkIn.data.streak}-day streak` : ''}`
      : `${checkInMissing} left today${checkIn.data.streak ? ` \u00b7 ${checkIn.data.streak}-day streak` : ''}`
    : 'Sleep, energy, steps \u2014 the coach\u2019s daily questions'
  const skinStreak = skin.data?.streak ?? 0
  const activePrinciples = (principles.data ?? []).filter((p) => p.active)
  const principlesReviewed = activePrinciples.filter((p) => p.todayStatus !== null).length
  const activeSkills = (skills.data ?? []).filter((s) => s.status === 'active')
  const skillsMinutes7d = activeSkills.reduce((sum, s) => sum + s.minutes7d, 0)
  const skillsBestStreak = activeSkills.reduce((m, s) => Math.max(m, s.streak), 0)
  const activePeople = (people.data ?? []).filter((p) => !p.archived)
  const peopleDue = activePeople.filter((p) => p.reconnect.status !== 'ok').length
  const liveContent = (content.data ?? []).filter((c) => c.status !== 'archived')
  const contentQueue = liveContent.filter((c) => c.status !== 'done').length
  const contentDone = liveContent.length - contentQueue
  const ideaList = ideas.data ?? []
  const ideaPipeline = ideaList.filter(
    (i) => i.status === 'spark' || i.status === 'exploring' || i.status === 'planned'
  ).length
  const ideaLaunched = ideaList.filter((i) => i.status === 'launched').length

  // Habits and routines are one screen with two tabs, so they are one tile now
  // and the subtitle has to speak for both.
  const routineCount = (routines.data ?? []).length
  const habitSub = habitList.length
    ? `${habitsDone}/${scheduled.length} habits done${routineCount ? ` · ${routinesPlayed}/${routineCount} routines` : ''}`
    : routineCount
      ? `${routinesPlayed}/${routineCount} routines played`
      : 'Build a 66-day streak · chain steps, press play'
  const goalSub = activeGoals.length
    ? `${activeGoals.length} active · avg ${goalPct}%`
    : 'Set goals, break them down'
  const studySub = activeCourses.length
    ? `${activeCourses.length} course${activeCourses.length === 1 ? '' : 's'}${revisionsDue ? ` · ${revisionsDue} to revise` : ''}`
    : 'Paced courses + revisions'

  /**
   * Grouped, and ordered by how often a thing is actually opened.
   *
   * The hub used to be 16 undifferentiated tiles with Reports first and the
   * daily items (check-in, fitness, body) last, below the fold. Now the
   * everyday work is at the top, the body stack is one section rather than
   * four scattered tiles, and the long tail is collapsed behind "More" so it
   * stays reachable without being in the way.
   */
  const sections: { id: string; label: string; cards: HubCard[] }[] = [
    {
      id: 'daily',
      label: 'Every day',
      cards: [
        {
          path: '/growth/checkin',
          emoji: '\u{1F4CB}',
          title: 'Daily check-in',
          sub: checkInSub,
        },
        {
          path: '/growth/habits',
          emoji: '\u{1F525}',
          title: 'Habits & routines',
          sub: habitSub,
        },
      ],
    },
    {
      id: 'body',
      label: 'Health & body',
      cards: [
        {
          path: '/growth/health',
          emoji: '\u{1FAC0}',
          title: 'Health coach',
          sub: 'Your daily plan across fuel, training, body, supplements and skin',
        },
        {
          path: '/growth/fitness',
          emoji: '\u{1F3CB}\uFE0F',
          title: 'Fitness',
          sub: fitnessSub,
        },
        {
          path: '/growth/fitness/food',
          emoji: '\u{1F35B}',
          title: 'Food & plates',
          sub: 'Configure a food once \u00b7 build a plate, get the totals',
        },
        {
          path: '/growth/body',
          emoji: '\u{1F4AA}',
          title: 'Body',
          sub: lastWorkout
            ? `Last: ${lastWorkout.type} ${lastWorkout.minutes}m`
            : 'Composition, weight, measurements',
        },
        {
          path: '/growth/body/photos',
          emoji: '\u{1F4F8}',
          title: 'Progress photos',
          sub: 'What the scale cannot show you',
        },
      ],
    },
    {
      id: 'build',
      label: 'Goals & learning',
      cards: [
        {
          path: '/growth/goals',
          emoji: '\u{1F3AF}',
          title: 'Goals',
          sub: goalSub,
        },
        {
          path: '/growth/study',
          emoji: '\u{1F4DA}',
          title: 'Study',
          sub: studySub,
        },
      ],
    },
    {
      id: 'more',
      label: 'More',
      cards: [
        {
          path: '/growth/principles',
          emoji: '\u{1F4DC}',
          title: 'Principles',
          sub: activePrinciples.length
            ? `${principlesReviewed}/${activePrinciples.length} reviewed today`
            : 'Rules you don\u2019t break',
        },
        {
          path: '/growth/library',
          emoji: '\u{1F4D6}',
          title: 'Library',
          sub: `${(books.data ?? []).length} books \u00b7 read in-app`,
        },
        {
          path: '/growth/quotes',
          emoji: '\u{1F4AC}',
          title: 'Quotes',
          sub: `${(quotes.data ?? []).length} saved`,
        },
        {
          path: '/growth/content',
          emoji: '\u{1F3AC}',
          title: 'Content',
          sub: contentQueue
            ? `${contentQueue} queued \u00b7 ${contentDone} done`
            : 'Watch & read in-app',
        },
        {
          path: '/growth/ideas',
          emoji: '\u{1F4A1}',
          title: 'Ideas',
          sub: ideaPipeline
            ? `${ideaPipeline} in pipeline \u00b7 ${ideaLaunched} launched`
            : 'Spark \u2192 launched',
        },
        {
          path: '/growth/skills',
          emoji: '\u26A1',
          title: 'Skills',
          sub: activeSkills.length
            ? `${activeSkills.length} tracked \u00b7 ${skillsMinutes7d}m this week${skillsBestStreak ? ` \u00b7 ${skillsBestStreak}d streak` : ''}`
            : 'XP for practice minutes',
        },
        {
          path: '/growth/people',
          emoji: '\u{1F91D}',
          title: 'People',
          sub: activePeople.length
            ? peopleDue
              ? `${peopleDue} need a tap`
              : `${activePeople.length} tracked \u00b7 all in rhythm`
            : 'Reconnect engine',
        },
        {
          path: '/growth/skin',
          emoji: '\u{1F9F4}',
          title: 'Skin',
          sub: skinStreak ? `${skinStreak}-day streak` : 'AM/PM checklists',
        },
      ],
    },
  ]

  const moreCards = sections.find((x) => x.id === 'more')?.cards ?? []

  return (
    <div className="flex flex-col gap-5">
      <h1 className="px-1 text-2xl font-bold tracking-tight">Growth</h1>

      {sections
        .filter((s) => s.id !== 'more')
        .map((section) => (
          <section key={section.id}>
            <SectionHeader title={section.label} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.cards.map((c) => (
                <HubTile key={c.path} card={c} onClick={() => navigate(c.path)} />
              ))}
            </div>
          </section>
        ))}

      {/* The long tail: reachable, but not competing with the daily work. */}
      <section>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-dashed px-4 py-3 text-left"
          aria-expanded={showMore}
        >
          <span className="text-sm font-semibold">More</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {moreCards.length} more
            <ChevronRight className={cn('size-4 transition-transform', showMore && 'rotate-90')} />
          </span>
        </button>
        {showMore && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {moreCards.map((c) => (
              <HubTile key={c.path} card={c} onClick={() => navigate(c.path)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/* ================= Habits + Routines (deep screens) ================= */

export function GrowthScreen({ initialTab = 'habits' }: { initialTab?: Tab }) {
  const { user, navigate } = useUi()
  const today = todayISO(user.timezone)
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate('/growth')}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Growth
      </button>

      <h1 className="px-1 text-2xl font-bold tracking-tight">Habits & routines</h1>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(
          [
            ['habits', 'Habits'],
            ['routines', 'Routines'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors',
              tab === key ? 'bg-card shadow-sm' : 'text-muted-foreground'
            )}
          >
            {key === 'habits' ? <Flame className="size-4" /> : <Repeat2 className="size-4" />}
            {label}
          </button>
        ))}
      </div>

      {tab === 'habits' ? <HabitsTab today={today} /> : <RoutinesTab />}
    </div>
  )
}

/* ================= Habits ================= */

function HabitsTab({ today }: { today: string }) {
  const { user } = useUi()
  const habits = useHabits()
  const checkin = useCheckInHabit()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<HabitWithStats | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  if (habits.isLoading) return <SkeletonRow />
  if (habits.isError)
    return <ErrorCard message={(habits.error as Error).message} onRetry={() => habits.refetch()} />

  const list = habits.data ?? []
  const scheduledToday = list.filter((h) => h.scheduledToday)
  const doneToday = scheduledToday.filter((h) => h.doneToday).length

  return (
    <div className="flex flex-col gap-3">
      {list.length === 0 ? (
        <EmptyState
          emoji="🌱"
          title="No habits yet"
          body="Pick one small thing worth doing daily. Check in each day — the streak and the 66-day bar take care of the rest."
          action={
            <Button
              size="sm"
              className="mt-2 rounded-full"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="mr-1 size-4" /> New habit
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
            <div>
              <p className="text-sm font-semibold">
                {doneToday} of {scheduledToday.length} done today
              </p>
              <p className="text-xs text-muted-foreground">
                {doneToday === scheduledToday.length && scheduledToday.length > 0
                  ? 'All clear — streaks are safe 🎉'
                  : 'Tap a habit to check in'}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="mr-1 size-4" /> New
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {list.map((h) => (
              <div
                key={h.id}
                className={cn('rounded-2xl border bg-card', h.archived && 'opacity-60')}
              >
                <div className="flex items-center gap-3 p-3.5">
                  <button
                    type="button"
                    aria-label={h.doneToday ? `Undo ${h.name}` : `Check in ${h.name}`}
                    disabled={!h.scheduledToday || checkin.isPending}
                    onClick={() => checkin.mutate({ habitId: h.id, date: today })}
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-lg transition-all active:scale-90',
                      h.doneToday
                        ? 'border-transparent text-white'
                        : 'border-muted-foreground/30 bg-transparent',
                      !h.scheduledToday && 'opacity-40'
                    )}
                    style={h.doneToday ? { background: h.color } : undefined}
                  >
                    {h.doneToday ? '✓' : h.emoji}
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setExpanded((e) => (e === h.id ? null : h.id))}
                  >
                    <p className="truncate text-sm font-semibold">
                      {h.name}
                      {h.streak > 0 && (
                        <span className="ml-1.5 text-xs font-medium text-warn">🔥 {h.streak}</span>
                      )}
                      {h.archived && (
                        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                          ARCHIVED
                        </span>
                      )}
                    </p>
                    {!h.scheduledToday ? (
                      <p className="text-xs text-muted-foreground">Rest day — streak stays safe</p>
                    ) : h.building.built ? (
                      <p className="text-xs text-income">
                        Built in {h.building.total} days — keep it alive 🎉
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Day {h.building.day} of {h.building.total}
                      </p>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit ${h.name}`}
                    onClick={() => {
                      setEditing(h)
                      setFormOpen(true)
                    }}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>

                {!h.building.built && h.building.day > 0 && (
                  <div className="px-3.5 pb-3">
                    <ProgressBar
                      value={h.building.pct}
                      tone={h.building.pct >= 100 ? 'income' : 'primary'}
                    />
                  </div>
                )}

                {expanded === h.id && (
                  <div className="border-t px-3.5 py-3">
                    <StreakCalendar days={h.recent} />
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-muted p-2">
                        <p className="text-sm font-bold tabular-nums">{h.streak}</p>
                        <p className="text-[10px] text-muted-foreground">current</p>
                      </div>
                      <div className="rounded-xl bg-muted p-2">
                        <p className="text-sm font-bold tabular-nums">{h.longest}</p>
                        <p className="text-[10px] text-muted-foreground">best</p>
                      </div>
                      <div className="rounded-xl bg-muted p-2">
                        <p className="text-sm font-bold tabular-nums">
                          {Math.round(h.rate30 * 100)}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">30-day rate</p>
                      </div>
                    </div>
                    {/* Phase 10 — the full GitHub-style effort grid, tap-to-toggle */}
                    <div className="mt-3 -mx-3.5">
                      <HabitGridPanel habitId={h.id} color={h.color} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <HabitFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        habit={editing}
        tz={user.timezone}
      />
    </div>
  )
}

/* ================= Routines ================= */

function RoutinesTab() {
  const routines = useRoutines()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RoutineWithMeta | null>(null)
  const [playing, setPlaying] = useState<RoutineWithMeta | null>(null)
  const dincharya = useSaveRoutine({ success: 'Dincharya installed — play it tonight 🌅' })
  const hasDincharya = (routines.data ?? []).some((r) => r.name.toLowerCase().includes('dincharya'))

  if (routines.isLoading) return <SkeletonRow />
  if (routines.isError)
    return (
      <ErrorCard message={(routines.error as Error).message} onRetry={() => routines.refetch()} />
    )

  const list = routines.data ?? []

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="Play a routine"
        action={
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="mr-1 size-3.5" /> New routine
          </Button>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          emoji="🌅"
          title="No routines yet"
          body="Chain small steps — stretch, splash, journal, breathe — into one guided flow you can play every morning or night."
          action={
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex justify-center gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  <Plus className="mr-1 size-4" /> Build a routine
                </Button>
                <DincharyaButton
                  busy={dincharya.isPending}
                  onInstall={() => installDincharya(dincharya)}
                />
              </div>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((r) => (
            <div key={r.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-xl"
                  aria-hidden
                >
                  {r.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {r.name}
                    {r.streak > 0 && (
                      <span className="ml-1.5 text-xs font-medium text-warn">🔥 {r.streak}</span>
                    )}
                    {r.todayRun && (
                      <span className="ml-1.5 rounded-full bg-income/10 px-1.5 py-0.5 text-[9px] font-bold text-income">
                        PLAYED
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.steps.length} step{r.steps.length === 1 ? '' : 's'}
                    {r.plannedMinutes > 0 && ` · ~${r.plannedMinutes} min`}
                    {r.lastRun ? ` · last ${r.lastRun.date}` : ' · never played'}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="h-9 rounded-full px-4"
                  onClick={() => setPlaying(r)}
                  disabled={r.steps.length === 0}
                >
                  <Play className="mr-1 size-4" /> Play
                </Button>
                <button
                  type="button"
                  aria-label={`Edit ${r.name}`}
                  onClick={() => {
                    setEditing(r)
                    setFormOpen(true)
                  }}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </button>
              </div>
              {r.steps.length > 0 && (
                <p className="mt-2.5 truncate border-t pt-2.5 text-xs text-muted-foreground">
                  {r.steps.map((s) => s.title).join(' → ')}
                </p>
              )}
            </div>
          ))}

          {!hasDincharya && (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed p-4">
              <span className="text-xl" aria-hidden>
                🕉️
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Dincharya — the classical daily rhythm</p>
                <p className="text-xs text-muted-foreground">
                  {DINCHARYA.steps.length} steps: wake before sunrise → deep work → light dinner →
                  bed by 22:30.
                </p>
              </div>
              <DincharyaButton
                busy={dincharya.isPending}
                onInstall={() => installDincharya(dincharya)}
              />
            </div>
          )}
        </div>
      )}

      <RoutineFormSheet open={formOpen} onOpenChange={setFormOpen} routine={editing} />
      {playing && <RoutinePlay routine={playing} onExit={() => setPlaying(null)} />}
    </div>
  )
}

/* ---------- Dincharya preset (Phase 15) ---------- */

function DincharyaButton({ busy, onInstall }: { busy: boolean; onInstall: () => void }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-9 shrink-0 rounded-full px-3 text-xs font-semibold"
      disabled={busy}
      onClick={onInstall}
    >
      {busy ? 'Installing…' : 'Install'}
    </Button>
  )
}

function installDincharya(save: ReturnType<typeof useSaveRoutine>) {
  save.mutate({
    name: DINCHARYA.name,
    emoji: DINCHARYA.emoji,
    weekdays: '1111111',
    steps: DINCHARYA.steps.map((s) => ({ title: s.title, minutes: s.minutes })),
  })
}

'use client'

// Growth tab — hub over six modules (Phase 3): Habits, Routines, Goals,
// Study, Body, Skin. Deep screens live at #/growth/<module>.

import { useState } from 'react'
import { BookOpen, ChevronRight, Dumbbell, Flame, Pencil, Play, Plus, Repeat2, ScrollText, Target } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorCard, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { StreakCalendar } from '@/components/ui/streak-calendar'
import { HabitFormSheet } from '@/components/growth/habit-form-sheet'
import { HabitGridPanel } from '@/components/growth/habit-grid-panel'
import { RoutineFormSheet } from '@/components/growth/routine-form-sheet'
import { RoutinePlay } from '@/components/growth/routine-play'
import { useBodyMetrics, useBooks, useCheckIn, useCheckInHabit, useContent, useCourses, useFitnessSummary, useGoals, useHabits, useIdeas, usePeople, usePrinciples, useQuotes, useRoutines, useSkills, useSaveRoutine, useSkin, useWorkouts } from '@/hooks/queries'
import { todayISO } from '@/lib/date'
import { DINCHARYA } from '@/lib/dincharya'
import { cn } from '@/lib/utils'
import type { HabitWithStats, RoutineWithMeta } from '@/lib/types'

type Tab = 'habits' | 'routines'

/* ================= Hub (default /growth) ================= */

export function GrowthHub() {
  const { user, navigate } = useUi()
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
  if (loading) return <SkeletonRow />

  const habitList = habits.data ?? []
  const scheduled = habitList.filter((h) => h.scheduledToday)
  const habitsDone = scheduled.filter((h) => h.doneToday).length
  const routinesPlayed = (routines.data ?? []).filter((r) => r.todayRun).length
  const activeGoals = (goals.data ?? []).filter((g) => g.status === 'active')
  const goalPct = activeGoals.length ? Math.round((activeGoals.reduce((s, g) => s + g.progress, 0) / activeGoals.length) * 100) : 0
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
  const ideaPipeline = ideaList.filter((i) => i.status === 'spark' || i.status === 'exploring' || i.status === 'planned').length
  const ideaLaunched = ideaList.filter((i) => i.status === 'launched').length

  const cards = [
    {
      path: '/reports',
      emoji: '📊',
      icon: null,
      title: 'Reports',
      sub: 'Per-domain insights · monthly Life Report · print to PDF',
      tone: 'text-income',
    },
    {
      path: '/growth/principles',
      emoji: '📜',
      icon: ScrollText,
      title: 'Principles',
      sub: activePrinciples.length
        ? `${principlesReviewed}/${activePrinciples.length} reviewed today${activePrinciples.some((p) => p.keptStreak > 0) ? ` · best 🔥 ${Math.max(...activePrinciples.map((p) => p.keptStreak))}` : ''}`
        : 'Your constitution — rules you don’t break',
      tone: 'text-primary',
    },
    {
      path: '/growth/habits',
      emoji: '🔥',
      icon: Flame,
      title: 'Habits',
      sub: habitList.length ? `${habitsDone}/${scheduled.length} done today · ${habitList.length} tracked` : 'Build a 66-day streak',
      tone: 'text-warn',
    },
    {
      path: '/growth/routines',
      emoji: '🌅',
      icon: Repeat2,
      title: 'Routines',
      sub: (routines.data ?? []).length ? `${routinesPlayed} played today · ${(routines.data ?? []).length} built` : 'Chain steps, press play',
      tone: 'text-primary',
    },
    {
      path: '/growth/goals',
      emoji: '🎯',
      icon: Target,
      title: 'Goals',
      sub: activeGoals.length ? `${activeGoals.length} active · avg ${goalPct}%` : 'Set goals, break them down',
      tone: 'text-income',
    },
    {
      path: '/growth/study',
      emoji: '📚',
      icon: BookOpen,
      title: 'Study',
      sub: activeCourses.length ? `${activeCourses.length} course${activeCourses.length === 1 ? '' : 's'}${revisionsDue ? ` · ${revisionsDue} to revise` : ''}` : 'Paced courses + revisions',
      tone: 'text-primary',
    },
    {
      path: '/growth/content',
      emoji: '🎬',
      icon: null,
      title: 'Content',
      sub: liveContent.length
        ? `${contentQueue} to consume · ${contentDone} done${liveContent.some((c) => c.favorite) ? ' · ★ favorites' : ''}`
        : 'Watch & read in-app · private vault',
      tone: 'text-primary',
    },
    {
      path: '/growth/ideas',
      emoji: '💡',
      icon: null,
      title: 'Ideas',
      sub: ideaList.length
        ? `${ideaPipeline} in pipeline${ideaLaunched ? ` · ${ideaLaunched} launched 🚢` : ''}`
        : 'Spark → launched · ICE-ranked',
      tone: 'text-warn',
    },
    {
      path: '/growth/library',
      emoji: '📖',
      icon: null,
      title: 'Library',
      sub: books.data?.length
        ? `${(books.data ?? []).filter((b) => b.status === 'reading').length} reading · ${books.data.reduce((s, b) => s + b.minutes7d, 0)}m this week`
        : 'Read in-app · highlights · notes',
      tone: 'text-primary',
    },
    {
      path: '/growth/quotes',
      emoji: '💬',
      icon: null,
      title: 'Quotes',
      sub: quotes.data?.length ? `${quotes.data.length} saved · ${quotes.data.filter((q) => q.favorite).length} favorites` : 'Lines worth carrying for life',
      tone: 'text-warn',
    },
    {
      path: '/growth/skills',
      emoji: '⚡',
      icon: null,
      title: 'Skills',
      sub: activeSkills.length
        ? `${activeSkills.length} tracked${skillsMinutes7d ? ` · ${skillsMinutes7d}m this week` : ''}${skillsBestStreak > 0 ? ` · 🔥${skillsBestStreak}` : ''}`
        : 'XP for practice minutes · levels · ETA',
      tone: 'text-primary',
    },
    {
      path: '/growth/people',
      emoji: '🤝',
      icon: null,
      title: 'People',
      sub: activePeople.length
        ? peopleDue
          ? `${peopleDue} need a tap · ${activePeople.length} tracked`
          : `${activePeople.length} tracked · all in rhythm`
        : 'Reconnect engine · touchpoints · cadence',
      tone: 'text-expense',
    },
    {
      path: '/growth/checkin',
      emoji: '📋',
      icon: null,
      title: 'Daily check-in',
      sub: checkInSub,
      tone: 'text-primary',
    },
    {
      path: '/growth/fitness',
      emoji: '🏋️',
      icon: null,
      title: 'Fitness',
      sub: fitnessSub,
      tone: 'text-primary',
    },
    {
      path: '/growth/body',
      emoji: '💪',
      icon: Dumbbell,
      title: 'Body',
      sub: lastWorkout ? `Last: ${lastWorkout.type} ${lastWorkout.minutes}m` : 'Workouts, weight, measurements',
      tone: 'text-expense',
    },
    {
      path: '/growth/skin',
      emoji: '🧴',
      icon: null,
      title: 'Skin',
      sub: skinStreak ? `${skinStreak}-day streak · ${skin.data?.today.amDone ? 'AM ✓' : 'AM —'}/${skin.data?.today.pmDone ? 'PM ✓' : 'PM —'}` : 'AM/PM checklists + PAO',
      tone: 'text-income',
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 text-2xl font-bold tracking-tight">Growth</h1>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <button key={c.path} type="button" onClick={() => navigate(c.path)} className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
            <div className="flex items-center justify-between">
              <span className="text-xl" aria-hidden>
                {c.emoji}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">{c.title}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{c.sub}</p>
            </div>
          </button>
        ))}
      </div>

      <p className="rounded-2xl border border-dashed p-3 text-center text-xs text-muted-foreground">
        Everything here compounds — streaks, syllabus pace, goal progress. Miss a day, not two.
      </p>
    </div>
  )
}

/* ================= Habits + Routines (deep screens) ================= */

export function GrowthScreen({ initialTab = 'habits' }: { initialTab?: Tab }) {
  const { user } = useUi()
  const today = todayISO(user.timezone)
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 text-2xl font-bold tracking-tight">Growth</h1>

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
              tab === key ? 'bg-card shadow-sm' : 'text-muted-foreground',
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
  if (habits.isError) return <ErrorCard message={(habits.error as Error).message} onRetry={() => habits.refetch()} />

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
            <Button size="sm" className="mt-2 rounded-full" onClick={() => { setEditing(null); setFormOpen(true) }}>
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
                {doneToday === scheduledToday.length && scheduledToday.length > 0 ? 'All clear — streaks are safe 🎉' : 'Tap a habit to check in'}
              </p>
            </div>
            <Button size="sm" variant="outline" className="h-9 rounded-full" onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus className="mr-1 size-4" /> New
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {list.map((h) => (
              <div key={h.id} className={cn('rounded-2xl border bg-card', h.archived && 'opacity-60')}>
                <div className="flex items-center gap-3 p-3.5">
                  <button
                    type="button"
                    aria-label={h.doneToday ? `Undo ${h.name}` : `Check in ${h.name}`}
                    disabled={!h.scheduledToday || checkin.isPending}
                    onClick={() => checkin.mutate({ habitId: h.id, date: today })}
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-lg transition-all active:scale-90',
                      h.doneToday ? 'border-transparent text-white' : 'border-muted-foreground/30 bg-transparent',
                      !h.scheduledToday && 'opacity-40',
                    )}
                    style={h.doneToday ? { background: h.color } : undefined}
                  >
                    {h.doneToday ? '✓' : h.emoji}
                  </button>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded((e) => (e === h.id ? null : h.id))}>
                    <p className="truncate text-sm font-semibold">
                      {h.name}
                      {h.streak > 0 && <span className="ml-1.5 text-xs font-medium text-warn">🔥 {h.streak}</span>}
                      {h.archived && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">ARCHIVED</span>}
                    </p>
                    {!h.scheduledToday ? (
                      <p className="text-xs text-muted-foreground">Rest day — streak stays safe</p>
                    ) : h.building.built ? (
                      <p className="text-xs text-income">Built in {h.building.total} days — keep it alive 🎉</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Day {h.building.day} of {h.building.total}
                      </p>
                    )}
                  </button>
                  <button type="button" aria-label={`Edit ${h.name}`} onClick={() => { setEditing(h); setFormOpen(true) }} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                    <Pencil className="size-4" />
                  </button>
                </div>

                {!h.building.built && h.building.day > 0 && (
                  <div className="px-3.5 pb-3">
                    <ProgressBar value={h.building.pct} tone={h.building.pct >= 100 ? 'income' : 'primary'} />
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
                        <p className="text-sm font-bold tabular-nums">{Math.round(h.rate30 * 100)}%</p>
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

      <HabitFormSheet open={formOpen} onOpenChange={setFormOpen} habit={editing} tz={user.timezone} />
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
  if (routines.isError) return <ErrorCard message={(routines.error as Error).message} onRetry={() => routines.refetch()} />

  const list = routines.data ?? []

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="Play a routine"
        action={
          <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={() => { setEditing(null); setFormOpen(true) }}>
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
                <Button size="sm" className="rounded-full" onClick={() => { setEditing(null); setFormOpen(true) }}>
                  <Plus className="mr-1 size-4" /> Build a routine
                </Button>
                <DincharyaButton busy={dincharya.isPending} onInstall={() => installDincharya(dincharya)} />
              </div>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((r) => (
            <div key={r.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-xl" aria-hidden>
                  {r.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {r.name}
                    {r.streak > 0 && <span className="ml-1.5 text-xs font-medium text-warn">🔥 {r.streak}</span>}
                    {r.todayRun && <span className="ml-1.5 rounded-full bg-income/10 px-1.5 py-0.5 text-[9px] font-bold text-income">PLAYED</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.steps.length} step{r.steps.length === 1 ? '' : 's'}
                    {r.plannedMinutes > 0 && ` · ~${r.plannedMinutes} min`}
                    {r.lastRun ? ` · last ${r.lastRun.date}` : ' · never played'}
                  </p>
                </div>
                <Button size="sm" className="h-9 rounded-full px-4" onClick={() => setPlaying(r)} disabled={r.steps.length === 0}>
                  <Play className="mr-1 size-4" /> Play
                </Button>
                <button type="button" aria-label={`Edit ${r.name}`} onClick={() => { setEditing(r); setFormOpen(true) }} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
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
              <span className="text-xl" aria-hidden>🕉️</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Dincharya — the classical daily rhythm</p>
                <p className="text-xs text-muted-foreground">
                  {DINCHARYA.steps.length} steps: wake before sunrise → deep work → light dinner → bed by 22:30.
                </p>
              </div>
              <DincharyaButton busy={dincharya.isPending} onInstall={() => installDincharya(dincharya)} />
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
    <Button size="sm" variant="outline" className="h-9 shrink-0 rounded-full px-3 text-xs font-semibold" disabled={busy} onClick={onInstall}>
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

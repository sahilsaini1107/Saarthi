'use client'

// Today screen — "Today-first" home. Money + habits + reflection + intelligence,
// one glance.

import { useState } from 'react'
import { toast } from 'sonner'
import { useCheckInHabit, useInsights, useLifeScore, useLogContribution, useLogMilestoneProgress, usePayBill, useReviseTopic, useSetPrincipleCheck, useSkinCheckIn, useToday, useUpdateGoalTask } from '@/hooks/queries'
import { useUi } from '@/components/saarthi-app'
import { EmptyState, ErrorCard, Money, ProgressBar, SectionHeader, SkeletonRow, StatTile } from '@/components/ui/saarthi'
import { TrainingTodayCard } from '@/components/fitness/today-card'
import { CheckInTodayCard } from '@/components/screens/checkin-screen'
import { Seg3 } from '@/components/screens/principles-screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDayLabel, formatMonthLabel, todayISO } from '@/lib/date'
import { formatMinutes } from '@/lib/effort-grid'
import { formatINRCompact } from '@/lib/money'
import { countToMilli, formatMilliAmount } from '@/lib/goals-grid'
import { parseAmountToPaise } from '@/lib/money'
import { MOOD_META, isMood } from '@/lib/journal'
import { BUDGET_BAND_META } from '@/lib/constants'
import { ArrowRight, ArrowRightCircle, BookOpen, CalendarClock, CheckCircle2, ChevronDown, Circle, Compass, Flame, Landmark, PiggyBank, Plane, Play, ShieldCheck, Sparkles, Sprout, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TodaySnapshot } from '@/services/overview'
import type { Insight } from '@/lib/insights'

type TodaySnapshotTask = TodaySnapshot['goalTasksToday'][number]
type TodaySnapshotRevision = TodaySnapshot['revisionsToday'][number]

function greeting(tz: string): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()))
  if (hour < 5) return 'Up late?'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function TodayScreen() {
  const { user, navigate, openQuickAdd } = useUi()
  const today = useToday()
  const pay = usePayBill({ success: 'Bill paid — transaction logged' })
  const checkin = useCheckInHabit()
  const principleCheck = useSetPrincipleCheck()
  const life = useLifeScore()
  const insights = useInsights()
  const tzToday = todayISO(user.timezone)
  const [showOverview, setShowOverview] = useState(false)

  if (today.isLoading) return <SkeletonRow />
  if (today.isError) return <ErrorCard message={(today.error as Error).message} onRetry={() => today.refetch()} />
  if (!today.data) return null

  const d = today.data
  const spendDelta =
    d.prevMonthSpendPaise > 0 ? Math.round(((d.monthSpendPaise - d.prevMonthSpendPaise) / d.prevMonthSpendPaise) * 100) : null
  const habitsDone = d.habitsToday.filter((habit) => habit.doneToday).length
  const routinesDone = d.routinesToday.filter((routine) => routine.doneToday).length
  const dueCount = d.billsDue.length + d.goalTasksToday.length + d.revisionsToday.length
  const pendingCount =
    d.habitsToday.length - habitsDone +
    (d.routinesToday.length - routinesDone) +
    dueCount

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header className="flex items-start justify-between px-1">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{formatDayLabel(d.today)}</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting(user.timezone)}, {user.name.split(' ')[0]}
          </h1>
        </div>
        <Button size="sm" className="h-9 rounded-full px-4 shadow-sm" onClick={() => openQuickAdd()}>
          + Add
        </Button>
      </header>

      {!d.hasNoData && (
        <section className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">Today at a glance</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight">
                {pendingCount === 0 ? 'Everything important is handled.' : `${pendingCount} ${pendingCount === 1 ? 'item needs' : 'items need'} your attention.`}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Focus on the next useful action. The rest can wait.</p>
            </div>
            <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl text-lg', pendingCount === 0 ? 'bg-income/15' : 'bg-primary/15')} aria-hidden>
              {pendingCount === 0 ? '✓' : '🧭'}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <TodaySummaryStat label="Habits" value={`${habitsDone}/${d.habitsToday.length}`} />
            <TodaySummaryStat label="Routines" value={`${routinesDone}/${d.routinesToday.length}`} />
            <TodaySummaryStat label="Due" value={String(dueCount)} warn={dueCount > 0} />
          </div>
        </section>
      )}

      {d.hasNoData && (
        <EmptyState
          emoji="🧭"
          title="Welcome to Saarthi"
          body="Your guide for money and life. Start with one account, a habit to build, or a bill you never want to forget."
          action={
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => navigate('/money/accounts')}>
                <PiggyBank className="mr-1 size-4" /> Add account
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/growth')}>
                <Sprout className="mr-1 size-4" /> Build a habit
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/money/fds')}>
                <Landmark className="mr-1 size-4" /> Track an FD
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/journal')}>
                <BookOpen className="mr-1 size-4" /> Write a journal
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/money/bills')}>
                <CalendarClock className="mr-1 size-4" /> Add a bill
              </Button>
            </div>
          }
        />
      )}

      {/* training (Phase 13) */}
      <div className="grid gap-4 md:grid-cols-2">
        <CheckInTodayCard />
        <TrainingTodayCard />
      </div>

      {/* habits today (Phase 2) */}
      {d.habitsToday.length > 0 && (
        <section>
          <SectionHeader
            title="Habits today"
            action={
              <button type="button" onClick={() => navigate('/growth')} className="flex items-center text-xs font-medium text-primary">
                All habits <ArrowRight className="size-3" />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            {d.habitsToday.map((h) => (
              <button
                key={h.id}
                type="button"
                disabled={checkin.isPending}
                onClick={() => checkin.mutate({ habitId: h.id, date: tzToday })}
                className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 text-left transition-colors hover:bg-accent"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-base transition-all active:scale-90',
                    h.doneToday ? 'border-transparent text-white' : 'border-muted-foreground/30',
                  )}
                  style={h.doneToday ? { background: h.color } : undefined}
                >
                  {h.doneToday ? '✓' : h.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-semibold', h.doneToday && 'text-muted-foreground line-through')}>
                    {h.name}
                    {h.streak > 0 && <span className="ml-1.5 text-xs font-medium text-warn">🔥 {h.streak}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.built ? `Built — day ${h.buildingTotal}+` : `Day ${h.buildingDay} of ${h.buildingTotal}`}
                  </p>
                </div>
                {h.streak > 0 && <Flame className="size-4 shrink-0 text-warn" aria-hidden />}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* routines today (Phase 2) */}
      {d.routinesToday.length > 0 && (
        <section>
          <SectionHeader title="Routines" />
          <div className="grid grid-cols-2 gap-3">
            {d.routinesToday.slice(0, 4).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate('/growth')}
                className="flex items-center gap-2.5 rounded-2xl border bg-card p-3.5 text-left transition-colors hover:bg-accent"
              >
                <span className="text-lg" aria-hidden>
                  {r.emoji}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{r.name}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {r.doneToday ? (
                      <span className="font-medium text-income">Played ✓</span>
                    ) : (
                      <>
                        <Play className="size-3" /> {r.totalSteps} steps
                      </>
                    )}
                    {r.streak > 0 && ` · 🔥${r.streak}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* bills due */}
      <section>
        <SectionHeader
          title="Bills due this week"
          action={
            <button type="button" onClick={() => navigate('/money/bills')} className="flex items-center text-xs font-medium text-primary">
              All bills <ArrowRight className="size-3" />
            </button>
          }
        />
        {d.billsDue.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">Nothing due in the next 7 days. Breathe. 🌿</p>
        ) : (
          <div className="flex flex-col gap-2">
            {d.billsDue.map((b) => (
              <div key={b.id} className={`flex items-center justify-between gap-2 rounded-2xl border bg-card p-4 ${b.overdue ? 'border-expense/40' : ''}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
                    {b.emoji}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {b.name} {b.overdue && <span className="ml-1 rounded-full bg-expense/10 px-1.5 py-0.5 text-[10px] font-bold text-expense">OVERDUE</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.overdue ? `Was due ${formatDayLabel(b.dueDate)}` : b.daysUntilDue === 0 ? 'Due today' : `Due in ${b.daysUntilDue} day${b.daysUntilDue === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Money paise={b.amountPaise} className="text-sm font-semibold" />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full px-3 text-xs"
                    disabled={pay.isPending}
                    onClick={() => pay.mutate({ billId: b.id, dueDate: b.dueDate })}
                  >
                    Pay
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>


      {/* goal tasks due (Phase 3) */}
      {d.goalTasksToday.length > 0 && (
        <section>
          <SectionHeader
            title="Goal tasks due"
            action={
              <button type="button" onClick={() => navigate('/growth/goals')} className="flex items-center text-xs font-medium text-primary">
                All goals <ArrowRight className="size-3" />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            {d.goalTasksToday.map((t) => (
              <GoalTaskRow key={t.id} task={t} today={tzToday} />
            ))}
          </div>
        </section>
      )}

      {/* revisions due (Phase 3) */}
      {d.revisionsToday.length > 0 && (
        <section>
          <SectionHeader
            title="Revisions due"
            action={
              <button type="button" onClick={() => navigate('/growth/study')} className="flex items-center text-xs font-medium text-primary">
                Study <ArrowRight className="size-3" />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            {d.revisionsToday.map((r) => (
              <RevisionRow key={r.topicId} revision={r} />
            ))}
          </div>
        </section>
      )}

      {!d.hasNoData && (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <button
            type="button"
            onClick={() => setShowOverview((value) => !value)}
            aria-expanded={showOverview}
            className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Your full overview</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Money, wellbeing, learning and recent activity</p>
            </div>
            <div className="hidden items-center gap-4 text-right sm:flex">
              <div>
                <p className="text-xs text-muted-foreground">Net worth</p>
                <p className="text-sm font-bold tabular-nums">{formatINRCompact(d.netWorthPaise)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Life score</p>
                <p className={cn('text-sm font-bold tabular-nums', scoreTone(life.data?.overall ?? null))}>{life.data?.overall ?? '—'}</p>
              </div>
            </div>
            <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', showOverview && 'rotate-180')} />
          </button>
        </section>
      )}

      {showOverview && (
        <div className="flex flex-col gap-5 border-t pt-5">

      {/* life score (Phase 5.3) */}
      {!d.hasNoData && <LifeScoreCard score={life.data?.overall ?? null} pillars={{ wealth: life.data?.wealth.score ?? null, growth: life.data?.growth.score ?? null, reflection: life.data?.reflection.score ?? null }} onOpen={() => navigate('/journal')} />}

      {/* quick stats */}
      <section className="grid grid-cols-2 gap-3">
        <StatTile
          label={`Spent · ${formatMonthLabel(d.monthKey).split(' ')[0]}`}
          value={formatINRCompact(d.monthSpendPaise)}
          sub={spendDelta === null ? 'No last-month data' : `${spendDelta >= 0 ? '+' : ''}${spendDelta}% vs last month`}
          tone={spendDelta !== null && spendDelta > 20 ? 'warn' : undefined}
        />
        <StatTile
          label="Net worth"
          value={formatINRCompact(d.netWorthPaise)}
          sub={
            d.netWorthDeltaPaise !== null
              ? `${d.netWorthDeltaPaise >= 0 ? '▲' : '▼'} ${formatINRCompact(Math.abs(d.netWorthDeltaPaise))} vs last snapshot`
              : 'Everything you own, minus cards'
          }
        />
        <StatTile label="Liquid money" value={formatINRCompact(d.liquidPaise)} sub="Savings + cash" />
        <StatTile
          label="Growing"
          value={formatINRCompact(d.depositsPaise + d.investmentsValuePaise + d.assetsValuePaise)}
          sub={`Deposits · investments · assets`}
        />
      </section>


      {/* budgets (Phase 5.1) */}
      {d.budgetsToday && (
        <section>
          <SectionHeader
            title="Budgets"
            action={
              <button type="button" onClick={() => navigate('/money/budgets')} className="flex items-center text-xs font-medium text-primary">
                Manage <ArrowRight className="size-3" />
              </button>
            }
          />
          <button
            type="button"
            onClick={() => navigate('/money/budgets')}
            className="w-full rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {formatINRCompact(d.budgetsToday.spentPaise)}{' '}
                <span className="text-xs font-normal text-muted-foreground">of {formatINRCompact(d.budgetsToday.budgetPaise)} this month</span>
              </p>
              {d.budgetsToday.overCount > 0 ? (
                <span className="rounded-full bg-expense/10 px-2 py-1 text-[10px] font-bold text-expense">{d.budgetsToday.overCount} OVER</span>
              ) : d.budgetsToday.watchCount > 0 ? (
                <span className="rounded-full bg-warn/10 px-2 py-1 text-[10px] font-bold text-warn">{d.budgetsToday.watchCount} WATCH</span>
              ) : (
                <span className="rounded-full bg-income/10 px-2 py-1 text-[10px] font-bold text-income">ON TRACK</span>
              )}
            </div>
            <div className="mt-2">
              <ProgressBar
                value={Math.min(Math.round((d.budgetsToday.spentPaise / Math.max(d.budgetsToday.budgetPaise, 1)) * 100), 100)}
                tone={d.budgetsToday.overCount ? 'expense' : d.budgetsToday.watchCount ? 'warn' : 'income'}
                className="h-2"
              />
            </div>
            {d.budgetsToday.topRisk && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {d.budgetsToday.overCount ? `${d.budgetsToday.topRisk} crossed its limit` : `${d.budgetsToday.topRisk} is ahead of pace`}
              </p>
            )}
          </button>
        </section>
      )}

      {/* portfolio planner nudge (Phase 8) */}
      {d.plannerToday && (d.plannerToday.health === 'drift' || d.plannerToday.dicgcOverLimitCount > 0 || (!d.plannerToday.hasTargets && d.plannerToday.health !== 'empty')) && (
        <button
          type="button"
          onClick={() => navigate('/money/planner')}
          className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Compass className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {d.plannerToday.health === 'drift'
                ? `Portfolio drifting — ${d.plannerToday.driftAlerts[0]?.emoji ?? ''} ${d.plannerToday.driftAlerts[0]?.label ?? 'a bucket'} ${d.plannerToday.driftAlerts[0] && d.plannerToday.driftAlerts[0].driftPp > 0 ? 'over' : 'under'} target`
                : d.plannerToday.dicgcOverLimitCount > 0
                  ? `Deposit insurance: ${d.plannerToday.dicgcOverLimitCount} bank(s) above ₹5L DICGC cover`
                  : 'Give every rupee a job — set your plan'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {d.plannerToday.hasTargets
                ? `Income machine ≈ ₹${Math.round(d.plannerToday.monthlyIncomePaise / 100).toLocaleString('en-IN')}/mo · review balance moves`
                : 'Six jobs, one target plan — decide with full knowledge'}
            </p>
          </div>
          <ArrowRight className="ml-auto size-4 shrink-0 text-primary" />
        </button>
      )}

      {/* FD / RD maturity alerts */}
      {d.maturityAlerts.length > 0 && (
        <section>
          <SectionHeader title="Maturity alerts" />
          <div className="flex flex-col gap-2">
            {d.maturityAlerts.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => navigate('/money/fds')}
                className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  <span className={`flex size-9 items-center justify-center rounded-xl ${f.level === 'matured' ? 'bg-income/15 text-income' : 'bg-warn/15 text-warn'}`}>
                    <Landmark className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      <span className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${f.kind === 'fd' ? 'bg-primary/10 text-primary' : 'bg-warn/15 text-warn'}`}>
                        {f.kind.toUpperCase()}
                      </span>
                      {f.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {f.level === 'matured' ? 'Matured — ready to renew or reinvest' : `Matures in ${f.daysLeft} day${f.daysLeft === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Money paise={f.maturityAmountPaise} compact className="text-sm font-semibold" />
                  <p className="text-xs text-muted-foreground">on maturity</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* insurance premium alerts (Phase 7) */}
      {d.insuranceToday.length > 0 && (
        <section>
          <SectionHeader
            title="Insurance premiums"
            action={
              <button type="button" onClick={() => navigate('/money/insurance')} className="flex items-center text-xs font-medium text-primary">
                All policies <ArrowRight className="size-3" />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            {d.insuranceToday.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate('/money/insurance')}
                className={cn('flex items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent', ['overdue', 'due'].includes(p.level) && 'border-expense/40')}
              >
                <div className="flex items-center gap-3">
                  <span className={cn('flex size-9 items-center justify-center rounded-xl', ['overdue', 'due', 'd1'].includes(p.level) ? 'bg-expense/15 text-expense' : 'bg-warn/15 text-warn')}>
                    <ShieldCheck className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.dueLabel}</p>
                  </div>
                </div>
                <Money paise={p.premiumPaise} className="text-sm font-semibold" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* insights (Phase 5.4) */}
      {insights.data && insights.data.insights.length > 0 && (
        <section>
          <SectionHeader title="Insights" />
          <div className="flex flex-col gap-2">
            {insights.data.insights.slice(0, 4).map((i) => {
              const route = i.route
              return <InsightCard key={i.id} insight={i} onOpen={route ? () => navigate(route) : undefined} />
            })}
          </div>
        </section>
      )}

      {/* principles today (Phase 15) */}
      {d.principlesToday.length > 0 && (
        <section>
          <SectionHeader
            title="Principles"
            action={
              <button type="button" onClick={() => navigate('/growth/principles')} className="flex items-center text-xs font-medium text-primary">
                All principles <ArrowRight className="size-3" />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            {d.principlesToday.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {p.title}
                    {p.keptStreak > 0 && <span className="ml-1.5 whitespace-nowrap text-xs font-medium text-warn">🔥 {p.keptStreak}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.status === 'kept' ? 'Kept ✓' : p.status === 'broken' ? 'Broke it today' : p.status === 'na' ? 'N/A today' : 'Not reviewed yet'}
                  </p>
                </div>
                <Seg3
                  size="sm"
                  status={p.status}
                  busy={principleCheck.isPending}
                  onMark={(status) => {
                    if (status === 'broken') toast.info('Marked broken — tap the title to add what happened')
                    principleCheck.mutate({ principleId: p.id, date: tzToday, status })
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* goal contributions due (Phase 9) */}
      {d.goalContributionsToday.length > 0 && (
        <section>
          <SectionHeader
            title="Goal contributions"
            action={
              <button type="button" onClick={() => navigate('/growth/goals')} className="flex items-center text-xs font-medium text-primary">
                All goals <ArrowRight className="size-3" />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            {d.goalContributionsToday.map((g) => (
              <GoalContributionRow key={g.id} row={g} today={tzToday} />
            ))}
          </div>
        </section>
      )}

      {/* goal journals due (Phase 11) */}
      {d.goalJournalsToday.length > 0 && (
        <section>
          <SectionHeader
            title="Goal journals"
            action={
              <button type="button" onClick={() => navigate('/growth/goals')} className="flex items-center text-xs font-medium text-primary">
                All goals <ArrowRight className="size-3" />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            {d.goalJournalsToday.map((r) => (
              <GoalJournalRow key={r.milestoneId} row={r} today={tzToday} />
            ))}
          </div>
        </section>
      )}

      {/* journal nudge (Phase 2) */}
      <section>
        <button
          type="button"
          onClick={() => navigate('/journal')}
          className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg" aria-hidden>
            {d.journalToday.hasEntry && d.journalToday.mood && isMood(d.journalToday.mood) ? MOOD_META[d.journalToday.mood].emoji : '📔'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Journal</p>
            <p className="text-xs text-muted-foreground">
              {d.journalToday.hasEntry
                ? d.journalToday.mood && isMood(d.journalToday.mood)
                  ? `Logged today — feeling ${MOOD_META[d.journalToday.mood].label.toLowerCase()}`
                  : 'Logged today — nice'
                : 'Two minutes now, a memory forever'}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            {d.journalToday.hasEntry ? 'Open' : 'Write'}
          </span>
        </button>
      </section>


      {/* skin check (Phase 3) */}
      <section>
        <SkinCard
          today={tzToday}
          amDone={d.skinToday.amDone}
          pmDone={d.skinToday.pmDone}
          streak={d.skinToday.streak}
          hasProducts={d.skinToday.hasProducts}
        />
      </section>


      {/* trip (Phase 5.2) */}
      {d.tripToday && <TripWidget trip={d.tripToday} onOpen={() => navigate(`/money/travel/${d.tripToday!.id}`)} onOpenAll={() => navigate('/money/travel')} />}

      {/* recent */}
      {d.recentTxns.length > 0 && (
        <section>
          <SectionHeader
            title="Recent activity"
            action={
              <button type="button" onClick={() => navigate('/money/transactions')} className="flex items-center text-xs font-medium text-primary">
                View all <ArrowRight className="size-3" />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            {d.recentTxns.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
                    {t.emoji ?? '❓'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.categoryName ?? 'Uncategorised'}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.note || `${t.accountName} · ${formatDayLabel(t.date)}`}</p>
                  </div>
                </div>
                <Money paise={t.amountPaise} signed={t.direction as 'in' | 'out'} className="text-sm font-semibold" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* continue reading (Phase 16) */}
      {d.readingToday && (
        <section>
          <SectionHeader
            title="Reading"
            action={
              <button type="button" onClick={() => navigate('/growth/library')} className="flex items-center text-xs font-medium text-primary">
                Library <ArrowRight className="size-3" />
              </button>
            }
          />
          <button
            type="button"
            onClick={() => navigate(d.readingToday!.format === 'physical' ? `/growth/library/${d.readingToday!.bookId}` : `/growth/library/${d.readingToday!.bookId}/read`)}
            className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3.5 text-left transition-colors hover:bg-accent"
          >
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500/25 to-amber-500/10 text-xl">
              📖
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{d.readingToday.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {d.readingToday.author ?? 'Unknown author'} · {d.readingToday.progressLabel}
                {d.readingToday.streak > 0 && <span className="text-warn"> · 🔥 {d.readingToday.streak}</span>}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-primary">
              {d.readingToday.format === 'physical' ? 'Track' : 'Read'}
            </span>
          </button>
        </section>
      )}

      {/* daily quote (Phase 16) */}
      {d.dailyQuoteToday && (
        <section>
          <SectionHeader
            title="Quote of the day"
            action={
              <button type="button" onClick={() => navigate('/growth/quotes')} className="flex items-center text-xs font-medium text-primary">
                All quotes <ArrowRight className="size-3" />
              </button>
            }
          />
          <figure className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
            <blockquote className="text-sm font-medium leading-relaxed">“{d.dailyQuoteToday.text}”</blockquote>
            {(d.dailyQuoteToday.author || d.dailyQuoteToday.source) && (
              <p className="pt-1 text-xs text-muted-foreground">
                — {d.dailyQuoteToday.author ?? 'Unknown'}
                {d.dailyQuoteToday.source ? ` · ${d.dailyQuoteToday.source}` : ''}
              </p>
            )}
          </figure>
        </section>
      )}

      {/* skill practice (Phase 17) */}
      {d.skillsToday.total > 0 && (
        <section>
          <SectionHeader
            title="Skill practice"
            action={
              <button type="button" onClick={() => navigate('/growth/skills')} className="flex items-center text-xs font-medium text-primary">
                All skills <ArrowRight className="size-3" />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            {d.skillsToday.skills
              .slice()
              .sort((a, b) => Number(a.practicedToday) - Number(b.practicedToday))
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => navigate('/growth/skills')}
                  className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                      s.practicedToday ? 'bg-income/15 text-income' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    L{s.level}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.practicedToday ? `${s.minutesToday}m today — done ✓` : 'Not practiced yet'}
                      {s.streak > 0 && <span className="text-warn"> · 🔥 {s.streak}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-primary">Log</span>
                </button>
              ))}
          </div>
        </section>
      )}

      {/* reconnect (Phase 17) */}
      {d.peopleToday.dueCount > 0 && (
        <section>
          <SectionHeader
            title="Reconnect"
            action={
              <button type="button" onClick={() => navigate('/growth/people')} className="flex items-center text-xs font-medium text-primary">
                All people <ArrowRight className="size-3" />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            {d.peopleToday.people.slice(0, 3).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate('/growth/people')}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent"
              >
                <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
                  {p.reconnect.status === 'overdue' ? '⏰' : p.reconnect.status === 'never' ? '🌱' : '📬'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.reconnect.status === 'overdue'
                      ? `Overdue by ${Math.abs(p.reconnect.dueInDays)} day${Math.abs(p.reconnect.dueInDays) === 1 ? '' : 's'}`
                      : p.reconnect.status === 'never'
                        ? 'Never reached out — say hi'
                        : 'Due today'}
                    {p.reconnect.daysSinceLast != null && ` · last touch ${p.reconnect.daysSinceLast === 0 ? 'today' : `${p.reconnect.daysSinceLast}d ago`}`}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-primary">Tap</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* content queue (Phase 18) */}
      {d.contentToday.total > 0 && (
        <section>
          <SectionHeader
            title="Content queue"
            action={
              <button type="button" onClick={() => navigate('/growth/content')} className="flex items-center text-xs font-medium text-primary">
                Library <ArrowRight className="size-3" />
              </button>
            }
          />
          {d.contentToday.nextUp ? (
            <button
              type="button"
              onClick={() => navigate('/growth/content')}
              className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent"
            >
              <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
                {d.contentToday.nextUp.kindEmoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.contentToday.nextUp.title}</p>
                <p className="text-xs text-muted-foreground">
                  Oldest in your queue
                  {d.contentToday.nextUp.ageDays > 0 && ` — waiting ${d.contentToday.nextUp.ageDays}d`}
                  {d.contentToday.active > 0 && ` · ${d.contentToday.active} in progress`}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-primary">Consume</span>
            </button>
          ) : (
            <p className="rounded-2xl border bg-card p-3 text-sm text-muted-foreground">
              Queue clear — {d.contentToday.done} consumed{d.contentToday.completionPct != null ? ` (${d.contentToday.completionPct}% of the library)` : ''}. 🎉
            </p>
          )}
        </section>
      )}

      {/* today's spark (Phase 18) */}
      {d.ideasToday.total > 0 && d.ideasToday.sparkToday && (
        <section>
          <SectionHeader
            title="Today's spark"
            action={
              <button type="button" onClick={() => navigate('/growth/ideas')} className="flex items-center text-xs font-medium text-primary">
                Ideas Lab <ArrowRight className="size-3" />
              </button>
            }
          />
          <button
            type="button"
            onClick={() => navigate('/growth/ideas')}
            className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4 text-left transition-colors hover:bg-accent"
          >
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-base">
              {d.ideasToday.sparkToday.categoryEmoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{d.ideasToday.sparkToday.title}</p>
              <p className="text-xs text-muted-foreground">
                {d.ideasToday.sparkToday.nextStep ? `Next: ${d.ideasToday.sparkToday.nextStep}` : 'Define its next 15-minute step'}
                {d.ideasToday.sparkToday.ice != null && ` · ICE ${d.ideasToday.sparkToday.ice}`}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-primary">Open</span>
          </button>
        </section>
      )}

      {/* growth teaser */}
      <section className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => navigate('/growth')} className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <Sprout className="size-4 text-income" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Growth</p>
            <p className="text-xs text-muted-foreground">Habits · goals · study</p>
          </div>
        </button>
        <button type="button" onClick={() => navigate('/journal')} className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
          <BookOpen className="size-4 text-primary" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Journal</p>
            <p className="text-xs text-muted-foreground">Search & reflect</p>
          </div>
        </button>
      </section>
        </div>
      )}
    </div>
  )
}

function TodaySummaryStat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-background/70 bg-background/70 px-3 py-2.5 backdrop-blur">
      <p className={cn('text-base font-bold tabular-nums', warn && 'text-warn')}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

/* ---------- Phase 5 widgets ---------- */

function scoreTone(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 75) return 'text-income'
  if (score >= 50) return 'text-primary'
  return 'text-warn'
}

function LifeScoreCard({
  score,
  pillars,
  onOpen,
}: {
  score: number | null
  pillars: { wealth: number | null; growth: number | null; reflection: number | null }
  onOpen: () => void
}) {
  const deg = score === null ? 0 : Math.round((score / 100) * 360)
  const pillarChips: { label: string; value: number | null }[] = [
    { label: 'Wealth', value: pillars.wealth },
    { label: 'Growth', value: pillars.growth },
    { label: 'Reflect', value: pillars.reflection },
  ]
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
      <div
        className="relative flex size-20 shrink-0 items-center justify-center rounded-full"
        style={{ background: score === null ? 'var(--muted)' : `conic-gradient(var(--primary) ${deg}deg, var(--muted) ${deg}deg)` }}
        role="img"
        aria-label={`Life score ${score ?? 'not enough data'} out of 100`}
      >
        <div className="flex size-[68px] flex-col items-center justify-center rounded-full bg-card">
          <span className={cn('text-xl font-bold tabular-nums', scoreTone(score))}>{score ?? '—'}</span>
          <span className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase">Life</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Life Score</p>
        <p className="text-xs text-muted-foreground">
          {score === null ? 'Add data across pillars to unlock your score' : score >= 75 ? 'Life is humming. Keep the streaks alive.' : score >= 50 ? 'Steady — a few pillars want attention.' : 'Some pillars need care today.'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pillarChips.map((p) => (
            <span
              key={p.label}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
                p.value === null ? 'bg-muted text-muted-foreground' : p.value >= 75 ? 'bg-income/10 text-income' : p.value >= 50 ? 'bg-primary/10 text-primary' : 'bg-warn/10 text-warn',
              )}
            >
              {p.label} {p.value ?? '—'}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}

function TripWidget({ trip, onOpen, onOpenAll }: { trip: NonNullable<TodaySnapshot['tripToday']>; onOpen: () => void; onOpenAll: () => void }) {
  const over = trip.remainingPaise != null && trip.remainingPaise < 0
  return (
    <section>
      <SectionHeader
        title="Trip"
        action={
          <button type="button" onClick={onOpenAll} className="flex items-center text-xs font-medium text-primary">
            All trips <ArrowRight className="size-3" />
          </button>
        }
      />
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl" aria-hidden>
          {trip.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{trip.name}</p>
          <p className="text-xs text-muted-foreground">
            {trip.phase === 'planned'
              ? `Starts in ${trip.daysUntilStart} day${trip.daysUntilStart === 1 ? '' : 's'}`
              : trip.daysLeft != null
                ? `${trip.daysLeft} day${trip.daysLeft === 1 ? '' : 's'} left`
                : 'Ongoing'}
            {trip.budgetPaise != null && ` · ${formatINRCompact(trip.spentPaise)} of ${formatINRCompact(trip.budgetPaise)}`}
          </p>
        </div>
        {trip.budgetPaise != null && (
          <span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-bold', over ? 'bg-expense/10 text-expense' : 'bg-primary/10 text-primary')}>
            {over ? 'OVER' : 'ON BUDGET'}
          </span>
        )}
      </button>
    </section>
  )
}

function InsightCard({ insight, onOpen }: { insight: Insight; onOpen?: () => void }) {
  const tone =
    insight.severity === 'warning'
      ? 'border-expense/30 bg-expense/5'
      : insight.severity === 'positive'
        ? 'border-income/30 bg-income/5'
        : 'bg-card'
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className={cn('flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors', tone, onOpen && 'hover:bg-accent')}
    >
      <span className="text-lg" aria-hidden>
        {insight.emoji}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{insight.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{insight.body}</p>
      </div>
    </button>
  )
}

/* ---------- Phase 3 widgets ---------- */

function GoalTaskRow({ task: t, today }: { task: TodaySnapshotTask; today: string }) {
  const update = useUpdateGoalTask({ success: 'Task done — goal progress updated' })
  const { navigate } = useUi()
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
      <button
        type="button"
        aria-label={`Complete ${t.title}`}
        disabled={update.isPending}
        onClick={() => update.mutate({ id: t.id, done: true })}
        className="shrink-0 text-muted-foreground transition-colors hover:text-income"
      >
        <Circle className="size-6" />
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate('/growth/goals')}>
        <p className="truncate text-sm font-semibold">
          <span className="mr-1" aria-hidden>
            {t.goalEmoji}
          </span>
          {t.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {t.goalTitle}
          {t.dueDate && (t.overdue ? ' · overdue' : t.dueDate === today ? ' · due today' : ` · ${formatDayLabel(t.dueDate)}`)}
        </p>
      </button>
      {t.overdue && <span className="shrink-0 rounded-full bg-expense/10 px-2 py-1 text-[10px] font-bold text-expense">LATE</span>}
    </div>
  )
}

function RevisionRow({ revision: r }: { revision: TodaySnapshotRevision }) {
  const revise = useReviseTopic({ success: 'Revision logged — next one scheduled' })
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: `${r.courseColor}1A` }} aria-hidden>
        {r.courseEmoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{r.topicTitle}</p>
        <p className="truncate text-xs text-muted-foreground">
          {r.courseTitle} · revision {r.stage + 1}
          {r.overdue ? ' · overdue' : ''}
        </p>
      </div>
      <Button size="sm" className="h-8 shrink-0 rounded-full px-3 text-xs" disabled={revise.isPending} onClick={() => revise.mutate({ topicId: r.topicId, outcome: 'revised' })}>
        Revised
      </Button>
      <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-full px-3 text-xs" disabled={revise.isPending} onClick={() => revise.mutate({ topicId: r.topicId, outcome: 'forgot' })}>
        Forgot
      </Button>
    </div>
  )
}

function SkinCard({ today, amDone, pmDone, streak, hasProducts }: { today: string; amDone: boolean; pmDone: boolean; streak: number; hasProducts: boolean }) {
  const checkin = useSkinCheckIn()
  const { navigate } = useUi()
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          Skincare {streak > 0 && <span className="ml-1 text-xs font-medium text-warn">🔥 {streak}-day</span>}
        </p>
        <button type="button" onClick={() => navigate('/growth/skin')} className="text-xs font-medium text-primary">
          {hasProducts ? 'Shelf' : 'Set up'}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          type="button"
          aria-label={amDone ? 'Undo morning skincare' : 'Complete morning skincare'}
          disabled={checkin.isPending}
          onClick={() => checkin.mutate({ date: today, slot: 'am', done: !amDone })}
          className={cn(
            'flex h-12 items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold transition-all active:scale-95',
            amDone ? 'border-transparent bg-income text-white' : 'border-muted-foreground/25',
          )}
        >
          ☀️ AM {amDone ? '✓' : ''}
        </button>
        <button
          type="button"
          aria-label={pmDone ? 'Undo night skincare' : 'Complete night skincare'}
          disabled={checkin.isPending}
          onClick={() => checkin.mutate({ date: today, slot: 'pm', done: !pmDone })}
          className={cn(
            'flex h-12 items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold transition-all active:scale-95',
            pmDone ? 'border-transparent bg-primary text-primary-foreground' : 'border-muted-foreground/25',
          )}
        >
          🌙 PM {pmDone ? '✓' : ''}
        </button>
      </div>
    </div>
  )
}

/* ---------- goal journals (Phase 11) ---------- */

type TodaySnapshotJournal = TodaySnapshot['goalJournalsToday'][number]

/** One goal journal with nothing logged today — inline minutes quick-log. */
function GoalJournalRow({ row, today }: { row: TodaySnapshotJournal; today: string }) {
  const log = useLogMilestoneProgress({ success: 'Progress logged' })
  const [value, setValue] = useState('')
  const { navigate } = useUi()

  function submit() {
    const cleaned = value.replace(/[\s,]/g, '')
    if (!/^\d{1,4}$/.test(cleaned)) return
    const minutes = parseInt(cleaned, 10)
    if (minutes < 1 || minutes > 1440) return
    log.mutate(
      { milestoneId: row.milestoneId, goalId: row.goalId, date: today, minutes },
      { onSuccess: () => setValue('') },
    )
  }

  return (
    <div className="flex items-center gap-2.5 rounded-2xl border bg-card px-3 py-2.5">
      <button
        type="button"
        aria-label={`Open ${row.goalTitle}`}
        onClick={() => navigate('/growth/goals')}
        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-lg"
        style={{ backgroundColor: `${row.goalColor}1f` }}
      >
        {row.goalEmoji}
      </button>
      <button type="button" onClick={() => navigate('/growth/goals')} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold">{row.goalTitle}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {row.milestoneTitle} · ⏱ {formatMinutes(row.milestoneTotalMinutes)} so far
          {row.targetMinutes != null ? ` / ${formatMinutes(row.targetMinutes)}` : ''}
        </p>
      </button>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && value.trim() && submit()}
        inputMode="numeric"
        placeholder="min"
        className="h-9 w-20 shrink-0 rounded-xl bg-muted/40 text-sm"
        aria-label={`Log minutes on ${row.milestoneTitle}`}
      />
      <Button
        size="icon"
        variant="outline"
        aria-label={`Save progress on ${row.milestoneTitle}`}
        className="size-9 shrink-0 rounded-xl"
        disabled={!value.trim() || log.isPending}
        onClick={submit}
      >
        <ArrowRightCircle className="size-4" />
      </Button>
    </div>
  )
}

/* ---------- goal contributions (Phase 9) ---------- */

type TodaySnapshotContribution = TodaySnapshot['goalContributionsToday'][number]

const COUNT_INPUT_RE = /^\d+(\.\d{1,3})?$/

/** One metric goal with an inline quick-log — type the amount, tap →. */
function GoalContributionRow({ row, today }: { row: TodaySnapshotContribution; today: string }) {
  const log = useLogContribution({ success: 'Contribution logged' })
  const [value, setValue] = useState('')
  const { navigate } = useUi()

  function submit() {
    let amountMilli: number | null = null
    if (row.metric === 'money') {
      const paise = parseAmountToPaise(value)
      amountMilli = paise != null ? paise * 10 : null
    } else {
      const cleaned = value.replace(/[\s,]/g, '')
      amountMilli = COUNT_INPUT_RE.test(cleaned) ? countToMilli(parseFloat(cleaned)) : null
    }
    if (amountMilli == null) return
    log.mutate({ goalId: row.id, date: today, amountMilli }, { onSuccess: () => setValue('') })
  }

  return (
    <div className="flex items-center gap-2.5 rounded-2xl border bg-card px-3 py-2.5">
      <button
        type="button"
        aria-label={`Open ${row.title}`}
        onClick={() => navigate('/growth/goals')}
        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-lg"
        style={{ backgroundColor: `${row.color}1f` }}
      >
        {row.emoji}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{row.title}</p>
        <p className="text-[11px] text-muted-foreground">
          {row.loggedToday ? (
            <span className="flex items-center gap-1 text-income">
              <CheckCircle2 className="size-3" /> Logged {formatMilliAmount(row.metric, row.unitLabel, row.todayMilli)} today
            </span>
          ) : row.neededPerDayMilli != null ? (
            <>Needed: {formatMilliAmount(row.metric, row.unitLabel, row.neededPerDayMilli)}/day</>
          ) : (
            <>Not logged today</>
          )}
        </p>
      </div>
      {row.loggedToday ? (
        <span className="shrink-0 rounded-full bg-income/15 px-2.5 py-1 text-[10px] font-bold text-income">✓ Done</span>
      ) : (
        <>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && value.trim() && submit()}
            inputMode="decimal"
            placeholder={row.metric === 'money' ? '₹' : row.unitLabel || 'units'}
            className="h-9 w-24 shrink-0 rounded-xl bg-muted/40 text-sm"
            aria-label={`Log contribution for ${row.title}`}
          />
          <Button
            size="icon"
            variant="outline"
            aria-label={`Save contribution for ${row.title}`}
            className="size-9 shrink-0 rounded-xl"
            disabled={!value.trim() || log.isPending}
            onClick={submit}
          >
            <ArrowRightCircle className="size-4" />
          </Button>
        </>
      )}
    </div>
  )
}

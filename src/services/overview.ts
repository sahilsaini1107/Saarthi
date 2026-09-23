// Read-model service: expense overview (1.7) and the Today snapshot.

import { db } from '@/lib/db'
import { monthRange, todayISO, toUTC, toUTC as toUTCDay } from '@/lib/date'
import { accountSummary } from '@/services/accounts'
import { upcomingBills } from '@/services/bills'
import { habitsForToday } from '@/services/habits'
import { principlesForToday } from '@/services/principles'
import { dailyQuoteForToday, readingForToday } from '@/services/reading'
import { skillsForToday } from '@/services/skills'
import { peopleForToday } from '@/services/people'
import { contentForToday } from '@/services/content'
import { ideasForToday } from '@/services/ideas'
import { listRoutines } from '@/services/routines'
import { journalStatsForDate } from '@/services/journal'
import { goalContributionsForToday, goalTasksForToday } from '@/services/goals'
import { milestoneLogsForToday } from '@/services/milestone-logs'
import { revisionsDueForToday } from '@/services/study'
import { listSkin } from '@/services/skin'
import { listBudgets } from '@/services/budgets'
import { listTrips } from '@/services/trips'
import { reminderStatus } from '@/lib/fd'
import { renewalLabel, renewalStatus } from '@/lib/insurance'
import { listPolicies } from '@/services/insurance'
import { deltaVsPreviousSnapshot, reduceNetWorthParts, storeSnapshot } from '@/services/networth'
import { getPlannerOverview } from '@/services/planner'
import { JOB_META } from '@/lib/planner'
import { isoDayUTC } from '@/lib/date'
import type { MoodKey } from '@/lib/types'

export interface CategorySlice {
  categoryId: string | null
  name: string
  emoji: string
  color: string
  outPaise: number
}

export interface ExpenseOverview {
  monthKey: string
  outPaise: number
  inPaise: number
  prevOutPaise: number
  momDeltaPct: number | null
  byCategory: CategorySlice[]
  txnCount: number
}

export async function expenseOverview(userId: string, monthKey: string): Promise<ExpenseOverview> {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('month must be YYYY-MM')
  const { start, endExclusive } = monthRange(monthKey)
  const prev = monthRange(previousMonthKey(monthKey))

  const txns = await db.transaction.findMany({
    where: { userId, date: { gte: start, lt: endExclusive } },
    select: { direction: true, amountPaise: true, categoryId: true, category: { select: { name: true, emoji: true, color: true } } },
  })

  let outPaise = 0
  let inPaise = 0
  const catTotals = new Map<string, CategorySlice>()
  for (const t of txns) {
    if (t.direction === 'out') outPaise += t.amountPaise
    else inPaise += t.amountPaise
    if (t.direction !== 'out') continue
    const key = t.categoryId ?? 'uncat'
    const existing = catTotals.get(key)
    if (existing) existing.outPaise += t.amountPaise
    else
      catTotals.set(key, {
        categoryId: t.categoryId,
        name: t.category?.name ?? 'Uncategorised',
        emoji: t.category?.emoji ?? '❓',
        color: t.category?.color ?? '#94A3B8',
        outPaise: t.amountPaise,
      })
  }

  const prevAgg = await db.transaction.aggregate({
    where: { userId, direction: 'out', date: { gte: prev.start, lt: prev.endExclusive } },
    _sum: { amountPaise: true },
  })
  const prevOutPaise = prevAgg._sum.amountPaise ?? 0

  return {
    monthKey,
    outPaise,
    inPaise,
    prevOutPaise,
    momDeltaPct: prevOutPaise > 0 ? Math.round(((outPaise - prevOutPaise) / prevOutPaise) * 100) : null,
    byCategory: [...catTotals.values()].sort((a, b) => b.outPaise - a.outPaise),
    txnCount: txns.length,
  }
}

function previousMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return d.toISOString().slice(0, 7)
}

export interface TodaySnapshot {
  today: string
  monthKey: string
  monthSpendPaise: number
  prevMonthSpendPaise: number
  liquidPaise: number
  cardOutstandingPaise: number
  /** FD principal + RD value-now (installments come due × installment) */
  depositsPaise: number
  fdsActivePaise: number
  rdsActivePaise: number
  investmentsValuePaise: number
  assetsValuePaise: number
  netWorthPaise: number
  /** net worth vs the previous stored snapshot (null before history exists) */
  netWorthDeltaPaise: number | null
  netWorthDeltaPct: number | null
  /** FD + RD maturities inside the reminder ladder, soonest last */
  maturityAlerts: { id: string; kind: 'fd' | 'rd'; title: string; maturityDate: string; daysLeft: number; level: string; maturityAmountPaise: number }[]
  billsDue: Awaited<ReturnType<typeof upcomingBills>>
  /* ---------- Phase 2 — Growth & Reflection on Today ---------- */
  /** habits scheduled today, undone first */
  habitsToday: { id: string; name: string; emoji: string; color: string; doneToday: boolean; streak: number; buildingDay: number; buildingTotal: number; built: boolean }[]
  routinesToday: { id: string; name: string; emoji: string; doneToday: boolean; streak: number; plannedMinutes: number; totalSteps: number }[]
  /** Phase 15 — active life principles with today's review status (review order: unreviewed first) */
  principlesToday: { id: string; title: string; category: string; status: 'kept' | 'broken' | 'na' | null; keptStreak: number }[]
  /** Phase 16 — the book to continue + reading stats (null when nothing is being read) */
  readingToday: {
    bookId: string
    title: string
    author: string | null
    format: 'physical' | 'epub' | 'pdf'
    statusLabel: string
    progressPct: number | null
    progressLabel: string
    minutesToday: number
    minutes7d: number
    streak: number
  } | null
  /** Phase 16 — deterministic daily quote from the vault (null when empty) */
  dailyQuoteToday: { id: string; text: string; author: string | null; source: string | null } | null
  /** Phase 17 — skill practice state (actives only; un-practiced first in UI) */
  skillsToday: {
    total: number
    practicedToday: number
    bestStreak: number
    minutesToday: number
    skills: { id: string; name: string; category: string; targetLevel: number; level: number; practicedToday: boolean; minutesToday: number; streak: number }[]
  }
  /** Phase 17 — people who need a tap: overdue/never/due (most-urgent first) */
  peopleToday: {
    tracked: number
    dueCount: number
    touchedToday: number
    people: { id: string; name: string; category: string; importance: number; cadenceDays: number; lastTouch: string | null; reconnect: { status: 'never' | 'ok' | 'due' | 'overdue'; dueInDays: number; daysSinceLast: number | null } }[]
  }
  /** Phase 18 — content library queue state */
  contentToday: {
    total: number
    queue: number
    active: number
    done: number
    addedThisWeek: number
    completionPct: number | null
    oldestUnconsumedDays: number | null
    nextUp: { id: string; title: string; kind: string; kindEmoji: string; ageDays: number } | null
    favorites: number
  }
  /** Phase 18 — ideas lab state + deterministic spark of the day */
  ideasToday: {
    total: number
    pipelineCount: number
    sparkCount: number
    launchedCount: number
    avgIce: number | null
    bestIce: number | null
    sparkToday: { id: string; title: string; category: string; categoryEmoji: string; nextStep: string | null; ice: number | null } | null
  }
  journalToday: { hasEntry: boolean; mood: MoodKey | null }
  /* ---------- Phase 3 — Goals · Study · Body · Skin on Today ---------- */
  goalTasksToday: { id: string; title: string; dueDate: string | null; overdue: boolean; goalId: string; goalTitle: string; goalEmoji: string; goalColor: string }[]
  /** Phase 9 — metric goals with today's contribution state (unlogged first) */
  goalContributionsToday: { id: string; title: string; emoji: string; color: string; metric: 'money' | 'count'; unitLabel: string | null; todayMilli: number; loggedToday: boolean; neededPerDayMilli: number | null; targetDate: string | null }[]
  /** Phase 11 — goal journals with nothing logged today (suggested milestone first) */
  goalJournalsToday: { milestoneId: string; milestoneTitle: string; goalId: string; goalTitle: string; goalEmoji: string; goalColor: string; milestoneTotalMinutes: number; targetMinutes: number | null }[]
  revisionsToday: { topicId: string; topicTitle: string; stage: number; dueDate: string | null; overdue: boolean; courseId: string; courseTitle: string; courseEmoji: string; courseColor: string }[]
  skinToday: { amDone: boolean; pmDone: boolean; streak: number; hasProducts: boolean }
  /* ---------- Phase 5 — Intelligence layer on Today ---------- */
  budgetsToday: { budgetPaise: number; spentPaise: number; band: string; overCount: number; watchCount: number; topRisk: string | null } | null
  /* ---------- Phase 7 — Insurance on Today ---------- */
  insuranceToday: { id: string; name: string; type: string; insurer: string; dueLabel: string; daysUntilDue: number; level: string; premiumPaise: number }[]
  insuranceSummary: { policyCount: number; totalSumAssuredPaise: number; annualPremiumPaise: number } | null
  /* ---------- Phase 8 — Portfolio planner on Today ---------- */
  plannerToday: {
    health: 'empty' | 'unset' | 'aligned' | 'drift'
    hasTargets: boolean
    driftAlerts: { job: string; label: string; emoji: string; driftPp: number; movePaise: number }[]
    dicgcOverLimitCount: number
    monthlyIncomePaise: number
  } | null
  tripToday: {
    id: string
    name: string
    emoji: string
    phase: 'planned' | 'ongoing' | 'past'
    destination: string | null
    spentPaise: number
    budgetPaise: number | null
    remainingPaise: number | null
    daysUntilStart: number | null
    daysLeft: number | null
  } | null
  recentTxns: { id: string; note: string | null; amountPaise: number; direction: string; date: string; emoji: string | null; categoryName: string | null; accountName: string }[]
  hasNoData: boolean
}

export async function todaySnapshot(userId: string, tz: string): Promise<TodaySnapshot> {
  const today = todayISO(tz)
  const monthKey = today.slice(0, 7)
  const { start, endExclusive } = monthRange(monthKey)
  const prev = monthRange(previousMonthKey(monthKey))
  const todayDate = toUTCDay(today)

  const [monthAgg, prevAgg, fds, rds, investments, assets, bills, accounts, recent, txnCount, habits, routines, principles, journal, goalTasks, goalContribs, goalJournals, revisions, skin, budgets, trips, insurance, planner, reading, dailyQuote, bookCount, quoteCount, skills, people, content, ideas] = await Promise.all([
    db.transaction.aggregate({
      where: { userId, direction: 'out', date: { gte: start, lt: endExclusive } },
      _sum: { amountPaise: true },
    }),
    db.transaction.aggregate({
      where: { userId, direction: 'out', date: { gte: prev.start, lt: prev.endExclusive } },
      _sum: { amountPaise: true },
    }),
    db.fixedDeposit.findMany({ where: { userId, status: 'active' }, orderBy: { maturityDate: 'asc' } }),
    db.recurringDeposit.findMany({ where: { userId, status: 'active' }, orderBy: { maturityDate: 'asc' } }),
    db.investment.findMany({
      where: { userId },
      include: { txns: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], select: { kind: true, quantity: true, amountPaise: true } } },
    }),
    db.asset.findMany({ where: { userId }, select: { currentValuePaise: true } }),
    upcomingBills(userId, tz, 7),
    accountSummary(userId),
    db.transaction.findMany({
      where: { userId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      include: { category: { select: { emoji: true, name: true } }, account: { select: { name: true } } },
    }),
    db.transaction.count({ where: { userId } }),
    habitsForToday(userId, tz),
    listRoutines(userId, tz),
    principlesForToday(userId, tz),
    journalStatsForDate(userId, today),
    goalTasksForToday(userId, tz),
    goalContributionsForToday(userId, tz),
    milestoneLogsForToday(userId, tz),
    revisionsDueForToday(userId, tz),
    listSkin(userId, tz),
    listBudgets(userId, tz),
    listTrips(userId, tz),
    listPolicies(userId, tz),
    getPlannerOverview(userId, tz),
    readingForToday(userId, tz),
    dailyQuoteForToday(userId, tz),
    db.book.count({ where: { userId } }),
    db.quote.count({ where: { userId } }),
    skillsForToday(userId, tz),
    peopleForToday(userId, tz),
    contentForToday(userId, tz),
    ideasForToday(userId, tz),
  ])

  const fdAlerts = fds
    .map((f) => {
      const { level, daysLeft } = reminderStatus(f.maturityDate, todayDate)
      return { id: f.id, kind: 'fd' as const, title: f.bank, maturityDate: isoDay(f.maturityDate), daysLeft, level, maturityAmountPaise: f.maturityAmountPaise }
    })
    .filter((f) => f.level !== 'none')

  const rdAlerts = rds
    .map((r) => {
      const { level, daysLeft } = reminderStatus(r.maturityDate, todayDate)
      return { id: r.id, kind: 'rd' as const, title: r.bank, maturityDate: isoDay(r.maturityDate), daysLeft, level, maturityAmountPaise: Number(r.maturityAmountPaise) }
    })
    .filter((r) => r.level !== 'none')

  // ONE net-worth formula (services/networth.ts) shared with stored snapshots
  const parts = reduceNetWorthParts({ accounts, fds, rds, investments, assets, todayDate })
  await storeSnapshot(userId, tz, parts) // lazy daily snapshot (Decision #24)
  const nwDelta = await deltaVsPreviousSnapshot(userId, tz, parts)

  const liquidPaise = parts.liquidPaise
  const cardOutstandingPaise = parts.cardOutstandingPaise
  const depositsPaise = parts.depositsPaise

  return {
    today,
    monthKey,
    monthSpendPaise: monthAgg._sum.amountPaise ?? 0,
    prevMonthSpendPaise: prevAgg._sum.amountPaise ?? 0,
    liquidPaise,
    cardOutstandingPaise,
    depositsPaise,
    fdsActivePaise: parts.fdsActivePaise,
    rdsActivePaise: parts.rdsActivePaise,
    investmentsValuePaise: parts.investmentsValuePaise,
    assetsValuePaise: parts.assetsValuePaise,
    netWorthPaise: parts.totalPaise,
    netWorthDeltaPaise: nwDelta.deltaPaise,
    netWorthDeltaPct: nwDelta.deltaPct,
    maturityAlerts: [...fdAlerts, ...rdAlerts].sort((a, b) => a.daysLeft - b.daysLeft),
    billsDue: bills,
    habitsToday: habits.map((h) => ({
      id: h.id,
      name: h.name,
      emoji: h.emoji,
      color: h.color,
      doneToday: h.doneToday,
      streak: h.streak,
      buildingDay: h.building.day,
      buildingTotal: h.building.total,
      built: h.building.built,
    })),
    routinesToday: routines
      .filter((r) => r.active)
      .map((r) => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        doneToday: r.todayRun != null,
        streak: r.streak,
        plannedMinutes: r.plannedMinutes,
        totalSteps: r.steps.length,
      })),
    journalToday: journal,
    principlesToday: principles
      .slice()
      .sort((a, b) => Number(a.status !== null) - Number(b.status !== null)),
    readingToday: reading,
    dailyQuoteToday: dailyQuote,
    skillsToday: skills,
    peopleToday: people,
    contentToday: content,
    ideasToday: ideas,
    goalTasksToday: goalTasks,
    goalContributionsToday: goalContribs,
    goalJournalsToday: goalJournals,
    revisionsToday: revisions,
    skinToday: {
      amDone: skin.today.amDone,
      pmDone: skin.today.pmDone,
      streak: skin.streak,
      hasProducts: skin.products.some((p) => p.status === 'active'),
    },
    budgetsToday: budgets.budgets.length
      ? {
          budgetPaise: budgets.totals.budgetPaise,
          spentPaise: budgets.totals.spentPaise,
          band: budgets.totals.band,
          overCount: budgets.totals.overCount,
          watchCount: budgets.totals.watchCount,
          topRisk: budgets.budgets.find((b) => b.band === 'over')?.categoryName ?? budgets.budgets.find((b) => b.band === 'watch')?.categoryName ?? null,
        }
      : null,
    insuranceToday: insurance.policies
      .filter((p) => p.status === 'active' && p.renewalLevel !== 'none')
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        insurer: p.insurer,
        dueLabel: p.dueLabel,
        daysUntilDue: p.daysUntilDue,
        level: p.renewalLevel,
        premiumPaise: p.premiumPaise,
      })),
    insuranceSummary: insurance.summary.policyCount > 0
      ? {
          policyCount: insurance.summary.policyCount,
          totalSumAssuredPaise: insurance.summary.totalSumAssuredPaise,
          annualPremiumPaise: insurance.summary.annualPremiumPaise,
        }
      : null,
    plannerToday:
      planner.totalPaise > 0
        ? {
            health: planner.health,
            hasTargets: planner.hasTargets,
            driftAlerts: planner.jobs
              .filter((j) => j.status === 'drift')
              .sort((a, b) => Math.abs(b.driftPp ?? 0) - Math.abs(a.driftPp ?? 0))
              .slice(0, 2)
              .map((j) => ({
                job: j.job,
                label: JOB_META[j.job].label,
                emoji: JOB_META[j.job].emoji,
                driftPp: j.driftPp ?? 0,
                movePaise: j.movePaise ?? 0,
              })),
            dicgcOverLimitCount: planner.dicgc.overLimitCount,
            monthlyIncomePaise: planner.income.monthlyAveragePaise,
          }
        : null,
    tripToday: trips.length
      ? (() => {
          const ongoing = trips.find((t) => t.phase === 'ongoing')
          const planned = trips.filter((t) => t.phase === 'planned').sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
          const t = ongoing ?? planned
          if (!t || t.phase === 'past') return null
          return {
            id: t.id,
            name: t.name,
            emoji: t.emoji,
            phase: t.phase,
            destination: t.destination,
            spentPaise: t.spentPaise,
            budgetPaise: t.budgetPaise,
            remainingPaise: t.remainingPaise,
            daysUntilStart: t.daysUntilStart,
            daysLeft: t.daysLeft,
          }
        })()
      : null,
    recentTxns: recent.map((t) => ({
      id: t.id,
      note: t.note,
      amountPaise: t.amountPaise,
      direction: t.direction,
      date: isoDay(t.date),
      emoji: t.category?.emoji ?? null,
      categoryName: t.category?.name ?? null,
      accountName: t.account.name,
    })),
    hasNoData:
      txnCount === 0 &&
      fds.length === 0 &&
      rds.length === 0 &&
      investments.length === 0 &&
      assets.length === 0 &&
      liquidPaise === 0 &&
      cardOutstandingPaise === 0 &&
      habits.length === 0 &&
      routines.length === 0 &&
      principles.length === 0 &&
      !journal.hasEntry &&
      goalTasks.length === 0 &&
      revisions.length === 0 &&
      skin.products.length === 0 &&
      budgets.budgets.length === 0 &&
      trips.length === 0 &&
      bookCount === 0 &&
      quoteCount === 0 &&
      skills.total === 0 &&
      people.tracked === 0 &&
      content.total === 0 &&
      ideas.total === 0,
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

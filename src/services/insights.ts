// Insights service (Phase 5.4) — gathers measured aggregates across pillars
// and feeds the pure builder (lib/insights.ts). Deterministic rules only
// (Decision #28): no LLM, no stored state.

import { db } from '@/lib/db'
import { currentMonthKey, isoDayUTC, monthRange, shiftISO, todayISO, toUTC } from '@/lib/date'
import { buildInsights } from '@/lib/insights'
import type { Insight } from '@/lib/insights'
import { reminderStatus } from '@/lib/fd'
import { listBudgets } from '@/services/budgets'
import { listTrips } from '@/services/trips'
import { listHabits } from '@/services/habits'
import { listCourses } from '@/services/study'
import { journalStreak } from '@/lib/journal'
import { computeNetWorthParts, deltaVsPreviousSnapshot } from '@/services/networth'

export type InsightsPayload = { today: string; insights: Insight[] }

export async function insights(userId: string, tz: string, cap = 6): Promise<InsightsPayload> {
  const today = todayISO(tz)
  const todayDate = toUTC(today)
  const monthKey = currentMonthKey(tz)
  const { start: monthStart, endExclusive: monthEnd } = monthRange(monthKey)
  const prev = monthRange(previousMonthKey(monthKey))

  const [budgets, trips, habits, courses, revisions, fds, rds, nwParts, monthTxns, prevCatTxns, biggest, journalDates, inAgg, outAgg] =
    await Promise.all([
      listBudgets(userId, tz),
      listTrips(userId, tz),
      listHabits(userId, tz),
      listCourses(userId, tz),
      db.courseTopic.count({ where: { course: { userId }, nextRevisionAt: { not: null, lte: todayDate } } }),
      db.fixedDeposit.findMany({ where: { userId, status: 'active' }, select: { bank: true, maturityDate: true } }),
      db.recurringDeposit.findMany({ where: { userId, status: 'active' }, select: { bank: true, maturityDate: true } }),
      computeNetWorthParts(userId, tz),
      db.transaction.findMany({
        where: { userId, direction: 'out', date: { gte: monthStart, lt: monthEnd } },
        select: { categoryId: true, amountPaise: true, category: { select: { name: true, emoji: true } } },
      }),
      db.transaction.findMany({
        where: { userId, direction: 'out', date: { gte: prev.start, lt: prev.endExclusive } },
        select: { categoryId: true, amountPaise: true },
      }),
      db.transaction.findFirst({
        where: { userId, direction: 'out', date: { gte: monthStart, lt: monthEnd } },
        orderBy: { amountPaise: 'desc' },
        select: { amountPaise: true, category: { select: { name: true } } },
      }),
      db.journalEntry.findMany({ where: { userId }, select: { date: true }, orderBy: { date: 'desc' }, take: 400 }),
      db.transaction.aggregate({ where: { userId, direction: 'in', date: { gte: monthStart, lt: monthEnd } }, _sum: { amountPaise: true } }),
      db.transaction.aggregate({ where: { userId, direction: 'out', date: { gte: monthStart, lt: monthEnd } }, _sum: { amountPaise: true } }),
    ])

  const nwDelta = await deltaVsPreviousSnapshot(userId, tz, nwParts)

  /* budgets → rule inputs */
  const budgetInputs = budgets.budgets.map((b) => ({
    categoryName: b.categoryName,
    band: b.band,
    overspendPaise: Math.max(0, b.spentPaise - b.amountPaise),
    overPacePaise: Math.max(0, b.spentPaise - Math.round((b.expectedPct / 100) * b.amountPaise)),
  }))

  /* trips → ongoing over-budget */
  const tripInputs = trips.map((t) => ({
    name: t.name,
    ongoing: t.phase === 'ongoing',
    overBudgetPaise: t.remainingPaise != null ? Math.max(0, -t.remainingPaise) : 0,
  }))

  /* category MoM (categories present in either month) */
  const prevByCat = new Map<string, number>()
  for (const t of prevCatTxns) {
    if (!t.categoryId) continue
    prevByCat.set(t.categoryId, (prevByCat.get(t.categoryId) ?? 0) + t.amountPaise)
  }
  const curByCat = new Map<string, { name: string; emoji: string; amount: number }>()
  for (const t of monthTxns) {
    if (!t.categoryId) continue
    const existing = curByCat.get(t.categoryId)
    if (existing) existing.amount += t.amountPaise
    else curByCat.set(t.categoryId, { name: t.category?.name ?? 'Uncategorised', emoji: t.category?.emoji ?? '❓', amount: t.amountPaise })
  }
  const categoriesMoM = [...curByCat.entries()].map(([id, c]) => ({
    name: c.name,
    emoji: c.emoji,
    currentPaise: c.amount,
    prevPaise: prevByCat.get(id) ?? 0,
  }))

  /* habits (active only) */
  const habitInputs = habits
    .filter((h) => !h.archived)
    .map((h) => ({ name: h.name, emoji: h.emoji, streak: h.streak, built: h.building.built }))

  /* study: at-risk courses + revisions due */
  const coursesAtRisk = courses.filter((c) => c.status === 'active' && c.pacing.health === 'at_risk').map((c) => ({ title: c.title }))
  const revisionsDue = await revisions

  /* maturities within 30 days */
  const maturitiesSoon = [
    ...fds.map((d) => ({ kind: 'fd' as const, title: d.bank, maturityDate: d.maturityDate })),
    ...rds.map((d) => ({ kind: 'rd' as const, title: d.bank, maturityDate: d.maturityDate })),
  ]
    .map((d) => {
      const { daysLeft, level } = reminderStatus(d.maturityDate, todayDate)
      return { kind: d.kind, title: d.title, daysLeft, level }
    })
    .filter((d) => d.level !== 'none' && d.daysLeft >= 0 && d.daysLeft <= 30)
    .map(({ kind, title, daysLeft }) => ({ kind, title, daysLeft }))

  /* journal streak + gap (same convention as the journal screen) */
  const dateSet = new Set(journalDates.map((e) => isoDayUTC(e.date)))
  const streak = journalStreak(dateSet, today)
  let daysSinceLast: number | null = null
  if (dateSet.size > 0) {
    const newest = [...dateSet].sort().at(-1) as string
    daysSinceLast = Math.round((todayDate.getTime() - toUTC(newest).getTime()) / 86_400_000)
  }

  const inPaise = inAgg._sum.amountPaise ?? 0
  const outPaise = outAgg._sum.amountPaise ?? 0

  const payload: Parameters<typeof buildInsights>[0] = {
    budgets: budgetInputs,
    trips: tripInputs,
    categoriesMoM,
    biggestExpense: biggest ? { amountPaise: biggest.amountPaise, categoryName: biggest.category?.name ?? null } : null,
    savingsRatePct: inPaise > 0 ? ((inPaise - outPaise) / inPaise) * 100 : null,
    netWorthDeltaPct: nwDelta.deltaPct,
    habits: habitInputs,
    coursesAtRisk,
    revisionsDue,
    journal: { streak, daysSinceLast },
    maturitiesSoon,
  }

  return { today, insights: buildInsights(payload, cap) }
}

function previousMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)
}

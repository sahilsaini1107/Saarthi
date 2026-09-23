// Gamification service (Phase 7). Gathers real activity counts from every
// pillar and hands them to the pure engine (lib/gamification.ts). XP is
// derived, never stored — idempotent, retroactive, and impossible to
// double-award (Decision #36).

import { db } from '@/lib/db'
import { shiftISO, todayISO, toUTC } from '@/lib/date'
import { longestStreak } from '@/lib/habits'
import { journalStreak } from '@/lib/journal'
import { computeProfile, type GamificationStats } from '@/lib/gamification'
import { lifeScore } from '@/services/lifescore'
import { isoDayUTC } from '@/lib/date'

export type GamificationProfile = ReturnType<typeof computeProfile> & { today: string }

export async function gamificationProfile(userId: string, tz: string): Promise<GamificationProfile> {
  const today = todayISO(tz)
  const todayDate = toUTC(today)
  const since30 = toUTC(shiftISO(today, -29))

  const [
    habitEntries,
    routineRuns,
    journalEntries,
    workouts,
    strengthSessions,
    workoutMinutesAgg,
    studySessions,
    studyMinutesAgg,
    skinCheckInDays,
    billPayments,
    transactions,
    goalTasksDone,
    revisionSum,
    goalsAchieved,
    insurancePolicies,
    habits,
    journalDates,
    latestSnapshot,
    in30,
    out30,
    score,
  ] = await Promise.all([
    db.habitEntry.count({ where: { userId } }),
    db.routineRun.count({ where: { userId } }),
    db.journalEntry.count({ where: { userId } }),
    db.workout.count({ where: { userId } }),
    // Phase 13 — structured strength sessions count as training too (Decision #50)
    db.workoutSession.count({ where: { userId } }),
    db.workout.aggregate({ where: { userId }, _sum: { minutes: true } }),
    db.studySession.count({ where: { userId } }),
    db.studySession.aggregate({ where: { userId }, _sum: { minutes: true } }),
    db.skinCheckIn.count({ where: { userId, OR: [{ amDone: true }, { pmDone: true }] } }),
    db.billPayment.count({ where: { userId } }),
    db.transaction.count({ where: { userId } }),
    db.goalTask.count({ where: { userId, doneAt: { not: null } } }),
    db.courseTopic.aggregate({ where: { course: { userId } }, _sum: { revisionStage: true } }),
    db.goal.count({ where: { userId, status: 'achieved' } }),
    db.insurancePolicy.count({ where: { userId } }),
    db.habit.findMany({ where: { userId }, select: { weekdays: true, entries: { select: { date: true } } } }),
    db.journalEntry.findMany({ where: { userId }, select: { date: true }, orderBy: { date: 'desc' } }),
    db.netWorthSnapshot.findFirst({ where: { userId }, orderBy: [{ date: 'desc' }], select: { totalPaise: true } }),
    db.transaction.aggregate({ where: { userId, direction: 'in', date: { gte: since30, lte: todayDate } }, _sum: { amountPaise: true } }),
    db.transaction.aggregate({ where: { userId, direction: 'out', date: { gte: since30, lte: todayDate } }, _sum: { amountPaise: true } }),
    // Life Score is already the pillar-blend the brief defines; reuse it
    lifeScore(userId, tz).catch(() => null),
  ])

  const longestHabitStreak = habits.reduce((max, h) => {
    const dates = h.entries.map((e) => isoDayUTC(e.date))
    return Math.max(max, longestStreak(dates, h.weekdays))
  }, 0)

  const jSet = new Set(journalDates.map((e) => isoDayUTC(e.date)))
  const savingsRatePct = in30._sum.amountPaise && (in30._sum.amountPaise ?? 0) > 0
    ? (((in30._sum.amountPaise ?? 0) - (out30._sum.amountPaise ?? 0)) / (in30._sum.amountPaise ?? 0)) * 100
    : null

  const stats: GamificationStats = {
    habitEntries,
    routineRuns,
    journalEntries,
    workouts: workouts + strengthSessions,
    studySessions,
    studyMinutes: studyMinutesAgg._sum.minutes ?? 0,
    skinCheckInDays,
    billPayments,
    transactions,
    goalTasksDone,
    revisionsDone: revisionSum._sum?.revisionStage ?? 0,
    longestHabitStreak,
    journalStreak: journalStreak(jSet, today),
    goalsAchieved,
    netWorthPaise: Number(latestSnapshot?.totalPaise ?? 0),
    lifeScore: score ? score.overall : null,
    savingsRatePct: savingsRatePct != null ? Math.round(savingsRatePct * 100) / 100 : null,
    insurancePolicies,
  }

  return { ...computeProfile(stats), today }
}

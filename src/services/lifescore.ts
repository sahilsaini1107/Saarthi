// Life Score service (Phase 5.3) — measures real inputs from every pillar
// and hands them to the pure scorer (lib/lifescore.ts). Computed on read;
// nothing stored (Decision #27).
//
// "Ever used it" guards: a feature the user never touched must not read as
// 0 effort — it is excluded (null) instead. Feature USED but idle this
// window legitimately scores low; that is the honest signal.

import { db } from '@/lib/db'
import { currentMonthKey, isoDayUTC, monthRange, shiftISO, todayISO, toUTC } from '@/lib/date'
import { computeLifeScore, moodToScore } from '@/lib/lifescore'
import type { LifeScore, LifeScoreComponents } from '@/lib/lifescore'
import { isMood } from '@/lib/journal'
import { cadenceFor, reconnectState } from '@/lib/people'
import { PIPELINE_STATUSES } from '@/lib/ideas'
import { listBudgets } from '@/services/budgets'
import { computeNetWorthParts, deltaVsPreviousSnapshot } from '@/services/networth'
import { listHabits } from '@/services/habits'
import { listSkin } from '@/services/skin'
import { adherence30Aggregate } from '@/services/principles'

export type LifeScorePayload = LifeScore & { today: string; monthKey: string }

export async function lifeScore(userId: string, tz: string): Promise<LifeScorePayload> {
  const today = todayISO(tz)
  const monthKey = currentMonthKey(tz)
  const todayDate = toUTC(today)
  const since7 = toUTC(shiftISO(today, -6)) // trailing 7 days incl. today
  const since30 = toUTC(shiftISO(today, -29)) // trailing 30 days incl. today
  const { start: monthStart, endExclusive: monthEnd } = monthRange(monthKey)

  const [inAgg, outAgg, habits, workouts7d, sessions7d, study7d, milestone7d, journal30d, skin, budgets, nwParts, principle30, ever, reading7d, skill7d, contentDone30, activePeople, lastTouches, meals7d, nutrition7d, profile, ideas] = await Promise.all([
    db.transaction.aggregate({
      where: { userId, direction: 'in', date: { gte: monthStart, lt: monthEnd } },
      _sum: { amountPaise: true },
    }),
    db.transaction.aggregate({
      where: { userId, direction: 'out', date: { gte: monthStart, lt: monthEnd } },
      _sum: { amountPaise: true },
    }),
    listHabits(userId, tz),
    db.workout.aggregate({ where: { userId, date: { gte: since7, lte: todayDate } }, _sum: { minutes: true } }),
    // Phase 13 — structured strength sessions share the movement component (Decision #50)
    db.workoutSession.aggregate({ where: { userId, date: { gte: since7, lte: todayDate } }, _sum: { durationMin: true } }),
    db.studySession.aggregate({ where: { userId, date: { gte: since7, lte: todayDate } }, _sum: { minutes: true } }),
    // Phase 12 — goal-effort component: milestone-journal minutes, trailing 7 days
    db.milestoneLog.aggregate({ where: { userId, date: { gte: since7, lte: todayDate } }, _sum: { minutes: true } }),
    db.journalEntry.findMany({
      where: { userId, date: { gte: since30, lte: todayDate } },
      select: { mood: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 30,
    }),
    listSkin(userId, tz),
    listBudgets(userId, tz),
    computeNetWorthParts(userId, tz),
    // Phase 15 — principles component: trailing-30-day adherence across active principles
    adherence30Aggregate(userId, tz),
    // "ever used" probes — 1-row counts on indexed userId columns
    Promise.all([
      db.workout.count({ where: { userId }, take: 1 }),
      db.workoutSession.count({ where: { userId }, take: 1 }),
      db.studySession.count({ where: { userId }, take: 1 }),
      db.journalEntry.count({ where: { userId }, take: 1 }),
      db.skinCheckIn.count({ where: { userId }, take: 1 }),
      db.habit.count({ where: { userId }, take: 1 }),
      db.milestoneLog.count({ where: { userId }, take: 1 }),
      db.principleCheck.count({ where: { userId }, take: 1 }),
      // Phase F (task 20) — reading, skills, content
      db.readingSession.count({ where: { userId }, take: 1 }),
      db.skillPractice.count({ where: { userId }, take: 1 }),
      db.contentItem.count({ where: { userId }, take: 1 }),
    ]),
    // Phase F (task 20) — craft & intentional consumption components
    db.readingSession.aggregate({ where: { userId, date: { gte: since7, lte: todayDate } }, _sum: { minutes: true } }),
    db.skillPractice.aggregate({ where: { userId, date: { gte: since7, lte: todayDate } }, _sum: { minutes: true } }),
    db.contentItem.count({ where: { userId, status: 'done', consumedAt: { gte: since30, lt: toUTC(shiftISO(today, 1)) } } }),
    // Phase F — care components: people within reconnect cadence
    db.person.findMany({ where: { userId, archived: false }, select: { id: true, importance: true, cadenceDays: true } }),
    db.touchpoint.groupBy({ by: ['personId'], where: { userId }, _max: { date: true } }),
    // Phase F — fuel: protein hits over logged days (meals + manual rows)
    db.mealEntry.groupBy({ by: ['date'], where: { userId, date: { gte: since7, lte: todayDate } }, _sum: { proteinG: true } }),
    db.nutritionDay.findMany({ where: { userId, date: { gte: since7, lte: todayDate } }, select: { date: true, proteinG: true } }),
    db.nutritionProfile.findUnique({ where: { userId }, select: { proteinTargetG: true } }),
    // Phase F — ideas: live ideas carrying a concrete next step
    db.idea.findMany({ where: { userId }, select: { status: true, nextStep: true } }),
  ])

  const nwDelta = await deltaVsPreviousSnapshot(userId, tz, nwParts)

  const inPaise = inAgg._sum.amountPaise ?? 0
  const outPaise = outAgg._sum.amountPaise ?? 0

  const activeHabits = habits.filter((h) => !h.archived)
  const habitRate30 =
    activeHabits.length > 0 ? activeHabits.reduce((s, h) => s + h.rate30, 0) / activeHabits.length : null

  const moodValues = journal30d
    .map((e) => (e.mood && isMood(e.mood) ? moodToScore(e.mood) : null))
    .filter((v): v is number => v !== null)
  const moodAvg = moodValues.length > 0 ? moodValues.reduce((a, b) => a + b, 0) / moodValues.length : null

  const [workoutEver, sessionEver, studyEver, journalEver, skinEver, habitEver, milestoneEver, principleEver, readingEver, skillPracticeEver, contentEver] = ever.map((n) => n > 0)

  // Phase F — people in rhythm: share of active people whose most recent
  // touchpoint is still inside their cadence (importance-derived or override)
  const lastTouchByPerson = new Map(lastTouches.map((t) => [t.personId, t._max.date ? isoDayUTC(t._max.date) : null]))
  let peopleOkRatio: number | null = null
  if (activePeople.length > 0) {
    const ok = activePeople.filter((p) => reconnectState(lastTouchByPerson.get(p.id) ?? null, cadenceFor(p.importance, p.cadenceDays), today).status === 'ok').length
    peopleOkRatio = ok / activePeople.length
  }

  // Phase F — protein hits: merge meal sums + manual NutritionDay rows per
  // calendar day; only days WITH data are judged, unlogged days are skipped
  // (Decision #27). A day with entries but no protein values reads as 0 —
  // same convention as the Fuel tab's totals.
  let mealProteinHit7: number | null = null
  if (profile && profile.proteinTargetG > 0) {
    const proteinByDay = new Map<string, number>()
    for (const row of meals7d) {
      const iso = isoDayUTC(row.date)
      proteinByDay.set(iso, (proteinByDay.get(iso) ?? 0) + (row._sum.proteinG ?? 0))
    }
    for (const row of nutrition7d) {
      const iso = isoDayUTC(row.date)
      proteinByDay.set(iso, (proteinByDay.get(iso) ?? 0) + (row.proteinG ?? 0))
    }
    if (proteinByDay.size > 0) {
      mealProteinHit7 = [...proteinByDay.values()].filter((v) => v >= profile.proteinTargetG).length / proteinByDay.size
    }
  }

  // Phase F — idea quality: share of live (spark/exploring/planned) ideas
  // with a concrete next physical action; no live ideas → skipped
  const liveIdeas = ideas.filter((i) => (PIPELINE_STATUSES as readonly string[]).includes(i.status))
  const ideaNextStepRatio =
    liveIdeas.length > 0 ? liveIdeas.filter((i) => (i.nextStep ?? '').trim().length > 0).length / liveIdeas.length : null

  const components: LifeScoreComponents = {
    savingsRatePct: inPaise > 0 ? ((inPaise - outPaise) / inPaise) * 100 : null,
    budgetOnTrackRatio: budgets.onTrackRatio,
    netWorthUp: nwDelta.deltaPct === null ? null : nwDelta.deltaPct >= 0,
    habitRate30: habitEver ? habitRate30 : null,
    workoutMinutes7d: workoutEver || sessionEver ? (workouts7d._sum.minutes ?? 0) + (sessions7d._sum.durationMin ?? 0) : null,
    studyMinutes7d: studyEver ? (study7d._sum.minutes ?? 0) : null,
    journalEntries30d: journalEver ? journal30d.length : null,
    moodScore: moodAvg,
    skinStreak: skinEver ? skin.streak : null,
    goalJournalMinutes7d: milestoneEver ? (milestone7d._sum.minutes ?? 0) : null,
    principleAdherence30: principleEver ? principle30 : null,
    readingMinutes7d: readingEver ? (reading7d._sum.minutes ?? 0) : null,
    skillMinutes7d: skillPracticeEver ? (skill7d._sum.minutes ?? 0) : null,
    contentDone30: contentEver ? contentDone30 : null,
    ideaNextStepRatio,
    peopleOkRatio,
    mealProteinHit7,
  }

  return { ...computeLifeScore(components), today, monthKey }
}

// Reports service (Phase F / task 20) — one builder per domain turns indexed
// aggregates into the shared report shape (stats / series / rows / notes) the
// Reports hub renders. READ-ONLY: nothing is stored, every number is computed
// on read from the same columns the modules themselves use (Decision #71).
//
// Conventions reused everywhere:
//  - calendar dates arrive as user-tz ISO days and are queried as UTC
//    midnights (`date` columns); timestamp columns (createdAt, consumedAt,
//    finishedAt, doneAt, launchedAt) use an exclusive end of to+1d.
//  - money stays in integer paise and is formatted at the edge.
//  - every comparison-window number is optional: no baseline → no delta.

import { db } from '@/lib/db'
import { isoDayUTC, shiftISO, todayISO, toUTC } from '@/lib/date'
import type { ISODate } from '@/lib/date'
import { formatMinutes } from '@/lib/effort-grid'
import { formatINRCompact } from '@/lib/money'
import {
  buildSeries,
  deltaPct,
  monthWindow as monthWindowLocal,
  pctPart,
  reportDomainMeta,
  round2,
  shiftWindowBack,
  windowLabel,
} from '@/lib/reports'
import type { ReportDomain } from '@/lib/reports'
import { completionRate } from '@/lib/habits'
import { reconnectState, cadenceFor } from '@/lib/people'
import { MOOD_META, isMood, journalStreak } from '@/lib/journal'
import { moodToScore } from '@/lib/lifescore'
import { iceScore, PIPELINE_STATUSES } from '@/lib/ideas'
import { MEAL_TYPES } from '@/lib/meals'
import { lifeScore } from '@/services/lifescore'
import type { LifeScorePayload } from '@/services/lifescore'
import { formatMonthLabel } from '@/lib/date'

/* ---------------- shared shapes ---------------- */

export interface ReportStat {
  label: string
  /** pre-formatted display value ("₹42.3K", "9h 20m", "83%", "—") */
  value: string
  /** small secondary line ("was 12% last window") */
  sub?: string
  /** percent change vs the previous window; null = no fair baseline */
  deltaPct?: number | null
  /** which direction reads as good, for coloring; omitted = neutral */
  goodDirection?: 'up' | 'down' | null
}

export interface ReportSeries {
  label: string
  bucket: 'day' | 'week'
  /** 'minutes' | 'rupees' | 'count' | 'percent' | 'pages' | 'kcal' | 'kg' */
  unit: string
  /** day buckets: UTC-midnight ISO labels; week buckets: week-start ISO.
   *  rupee values are integer paise; everything else is in its unit. */
  points: { label: ISODate; value: number }[]
}

export interface ReportRow {
  label: string
  emoji?: string
  value: string
  sub?: string
}

export interface DomainReportPayload {
  domain: ReportDomain
  title: string
  emoji: string
  from: ISODate
  to: ISODate
  windowLabel: string
  prevLabel: string
  stats: ReportStat[]
  series: ReportSeries[]
  rows: ReportRow[]
  notes: string[]
}

type ReportBody = Pick<DomainReportPayload, 'stats' | 'series' | 'rows' | 'notes'>

export interface LifeReportSection {
  pillar: 'wealth' | 'growth' | 'reflection'
  title: string
  emoji: string
  stats: ReportStat[]
  highlights: string[]
}

export interface LifeReportPayload {
  month: string
  monthLabel: string
  headline: string
  score: LifeScorePayload
  sections: LifeReportSection[]
}

/* ---------------- window plumbing ---------------- */

interface Win {
  from: ISODate
  to: ISODate
  fromD: Date
  toD: Date
  /** exclusive upper bound for timestamp columns (createdAt & friends) */
  toExD: Date
}

function makeWin(from: ISODate, to: ISODate): Win {
  return { from, to, fromD: toUTC(from), toD: toUTC(to), toExD: toUTC(shiftISO(to, 1)) }
}

interface Ctx {
  userId: string
  tz: string
  today: ISODate
  cur: Win
  prev: Win
}

function stat(label: string, value: string, opts: Omit<ReportStat, 'label' | 'value'> = {}): ReportStat {
  return { label, value, ...opts }
}

/** daily map from (date, value) rows */
function toDayMap(rows: readonly { date: Date; v: number }[]): Map<ISODate, number> {
  const m = new Map<ISODate, number>()
  for (const r of rows) {
    const iso = isoDayUTC(r.date)
    m.set(iso, (m.get(iso) ?? 0) + r.v)
  }
  return m
}

function fmtPct(n: number | null): string {
  return n === null ? '—' : `${round2(n)}%`
}

/* ---------------- money ---------------- */

async function moneyReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId } = c
  const [inAgg, outAgg, pInAgg, pOutAgg, outRows, budgetRows, endSnap, startSnap] = await Promise.all([
    db.transaction.aggregate({ where: { userId, direction: 'in', date: { gte: cur.fromD, lte: cur.toD } }, _sum: { amountPaise: true } }),
    db.transaction.aggregate({ where: { userId, direction: 'out', date: { gte: cur.fromD, lte: cur.toD } }, _sum: { amountPaise: true } }),
    db.transaction.aggregate({ where: { userId, direction: 'in', date: { gte: prev.fromD, lte: prev.toD } }, _sum: { amountPaise: true } }),
    db.transaction.aggregate({ where: { userId, direction: 'out', date: { gte: prev.fromD, lte: prev.toD } }, _sum: { amountPaise: true } }),
    db.transaction.findMany({
      where: { userId, direction: 'out', date: { gte: cur.fromD, lte: cur.toD } },
      select: { amountPaise: true, categoryId: true, date: true, category: { select: { name: true, emoji: true } } },
    }),
    db.budget.findMany({ where: { userId }, select: { amountPaise: true, categoryId: true } }),
    db.netWorthSnapshot.findFirst({ where: { userId, date: { lte: cur.toD } }, orderBy: { date: 'desc' }, select: { totalPaise: true } }),
    db.netWorthSnapshot.findFirst({ where: { userId, date: { lt: cur.fromD } }, orderBy: { date: 'desc' }, select: { totalPaise: true } }),
  ])

  const inPaise = inAgg._sum.amountPaise ?? 0
  const outPaise = outAgg._sum.amountPaise ?? 0
  const pInPaise = pInAgg._sum.amountPaise ?? 0
  const pOutPaise = pOutAgg._sum.amountPaise ?? 0

  const rate = inPaise > 0 ? round2(((inPaise - outPaise) / inPaise) * 100) : null
  const pRate = pInPaise > 0 ? round2(((pInPaise - pOutPaise) / pInPaise) * 100) : null

  const spendByCat = new Map<string, number>()
  for (const t of outRows) if (t.categoryId) spendByCat.set(t.categoryId, (spendByCat.get(t.categoryId) ?? 0) + t.amountPaise)
  const onTrack = budgetRows.filter((b) => (spendByCat.get(b.categoryId) ?? 0) <= b.amountPaise).length

  const endTotal = endSnap ? Number(endSnap.totalPaise) : null
  const startTotal = startSnap ? Number(startSnap.totalPaise) : null
  const movement = endTotal !== null && startTotal !== null ? endTotal - startTotal : null

  const dailyOut = toDayMap(outRows.map((t) => ({ date: t.date, v: t.amountPaise })))
  const series = buildSeries(dailyOut, cur.from, cur.to, 'Expenses', 'rupees', c.today)

  const top = [...spendByCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const catMeta = new Map(outRows.map((t) => [t.categoryId, t.category]))
  const rows: ReportRow[] = top.map(([id, paise]) => ({
    label: catMeta.get(id)?.name ?? 'Uncategorised',
    emoji: catMeta.get(id)?.emoji ?? '❓',
    value: formatINRCompact(paise),
    sub: pctPart(paise, outPaise) === null ? undefined : `${pctPart(paise, outPaise)}% of spend`,
  }))

  const biggest = [...outRows].sort((a, b) => b.amountPaise - a.amountPaise)[0]
  const notes: string[] = []
  if (biggest) notes.push(`Biggest expense: ${biggest.category?.name ?? 'Uncategorised'} at ${formatINRCompact(biggest.amountPaise)}.`)
  const overspent = budgetRows.filter((b) => (spendByCat.get(b.categoryId) ?? 0) > b.amountPaise).length
  if (budgetRows.length > 0) {
    notes.push(overspent > 0 ? `${overspent} of ${budgetRows.length} budgets overspent in this window.` : `All ${budgetRows.length} budgets stayed on track.`)
  }
  if (movement !== null && endTotal !== null) {
    notes.push(`Net worth ${movement >= 0 ? 'rose' : 'fell'} ${formatINRCompact(Math.abs(movement))} across the window (snapshots compared).`)
  }

  const stats: ReportStat[] = [
    stat('Income', formatINRCompact(inPaise), { deltaPct: deltaPct(inPaise, pInPaise), goodDirection: 'up' }),
    stat('Expenses', formatINRCompact(outPaise), { deltaPct: deltaPct(outPaise, pOutPaise), goodDirection: 'down' }),
    stat('Savings rate', fmtPct(rate), pRate === null ? {} : { sub: `was ${fmtPct(pRate)}` }),
    stat('Net worth', endTotal === null ? '—' : formatINRCompact(endTotal), movement === null ? {} : { sub: `${movement >= 0 ? '+' : '-'}${formatINRCompact(Math.abs(movement))} this window` }),
    stat('Budgets', budgetRows.length ? `${onTrack}/${budgetRows.length} on track` : '—'),
  ]

  return { stats, series: [series], rows, notes }
}

/* ---------------- fitness ---------------- */

async function fitnessReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId } = c
  const [woCur, woPrev, seCur, sePrev, sets, weights, mealSums, manualRows, profile, recentSessions, woRows, seRows] = await Promise.all([
    db.workout.aggregate({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, _count: true, _sum: { minutes: true } }),
    db.workout.aggregate({ where: { userId, date: { gte: prev.fromD, lte: prev.toD } }, _count: true, _sum: { minutes: true } }),
    db.workoutSession.aggregate({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, _count: true, _sum: { durationMin: true } }),
    db.workoutSession.aggregate({ where: { userId, date: { gte: prev.fromD, lte: prev.toD } }, _count: true, _sum: { durationMin: true } }),
    db.setLog.findMany({
      where: { userId, session: { date: { gte: cur.fromD, lte: cur.toD } } },
      select: { weightGrams: true, reps: true, isWarmup: true },
    }),
    db.bodyMetric.findMany({
      where: { userId, kind: 'weight', date: { gte: cur.fromD, lte: cur.toD } },
      orderBy: { date: 'asc' },
      select: { valueMilli: true, date: true },
    }),
    db.mealEntry.groupBy({ by: ['date'], where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, _sum: { proteinG: true, caloriesKcal: true } }),
    db.nutritionDay.findMany({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, select: { date: true, proteinG: true, caloriesKcal: true } }),
    db.nutritionProfile.findUnique({ where: { userId }, select: { proteinTargetG: true } }),
    db.workoutSession.findMany({
      where: { userId, date: { gte: cur.fromD, lte: cur.toD } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 6,
      select: { label: true, durationMin: true, date: true },
    }),
    db.workout.findMany({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, select: { date: true, minutes: true } }),
    db.workoutSession.findMany({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, select: { date: true, durationMin: true } }),
  ])

  const sessions = woCur._count + seCur._count
  const pSessions = woPrev._count + sePrev._count
  const minutes = (woCur._sum.minutes ?? 0) + (seCur._sum.durationMin ?? 0)
  const pMinutes = (woPrev._sum.minutes ?? 0) + (sePrev._sum.durationMin ?? 0)

  let volumeKg = 0
  let workingSets = 0
  for (const s of sets) {
    if (s.isWarmup) continue
    workingSets++
    if (s.weightGrams != null && s.reps != null) volumeKg += (s.weightGrams * s.reps) / 1000
  }
  volumeKg = round2(volumeKg)

  const firstW = weights[0]
  const lastW = weights.at(-1)
  const weightNow = lastW ? round2(lastW.valueMilli / 1000) : null
  const weightDelta = firstW && lastW && firstW.date !== lastW.date ? round2((lastW.valueMilli - firstW.valueMilli) / 1000) : null

  // protein/kcal over logged days (meals + manual rows, Decision #70 combine)
  const proteinByDay = new Map<ISODate, number>()
  const kcalByDay = new Map<ISODate, number>()
  for (const r of mealSums) {
    const iso = isoDayUTC(r.date)
    proteinByDay.set(iso, (proteinByDay.get(iso) ?? 0) + (r._sum.proteinG ?? 0))
    kcalByDay.set(iso, (kcalByDay.get(iso) ?? 0) + (r._sum.caloriesKcal ?? 0))
  }
  for (const r of manualRows) {
    const iso = isoDayUTC(r.date)
    proteinByDay.set(iso, (proteinByDay.get(iso) ?? 0) + (r.proteinG ?? 0))
    kcalByDay.set(iso, (kcalByDay.get(iso) ?? 0) + (r.caloriesKcal ?? 0))
  }
  const loggedDays = new Set([...proteinByDay.keys(), ...kcalByDay.keys()])
  const avgProtein = loggedDays.size ? round2([...proteinByDay.values()].reduce((a, b) => a + b, 0) / loggedDays.size) : null
  const avgKcal = loggedDays.size ? Math.round([...kcalByDay.values()].reduce((a, b) => a + b, 0) / loggedDays.size) : null

  const dailyMinutes = new Map<ISODate, number>()
  for (const w of woRows) {
    dailyMinutes.set(isoDayUTC(w.date), (dailyMinutes.get(isoDayUTC(w.date)) ?? 0) + w.minutes)
  }
  for (const s of seRows) {
    dailyMinutes.set(isoDayUTC(s.date), (dailyMinutes.get(isoDayUTC(s.date)) ?? 0) + s.durationMin)
  }
  const series = buildSeries(dailyMinutes, cur.from, cur.to, 'Training minutes', 'minutes', c.today)

  const rows: ReportRow[] = recentSessions.map((s) => ({
    label: s.label,
    emoji: '🏋️',
    value: formatMinutes(s.durationMin),
    sub: isoDayUTC(s.date),
  }))

  const notes: string[] = []
  if (workingSets > 0) notes.push(`${workingSets} working sets moved ${volumeKg.toLocaleString('en-IN')} kg of total volume.`)
  if (weightDelta !== null) notes.push(`Body weight ${weightDelta >= 0 ? 'up' : 'down'} ${Math.abs(weightDelta)} kg across the window (${round2(firstW.valueMilli / 1000)} → ${weightNow} kg).`)
  if (avgProtein !== null) {
    notes.push(profile && profile.proteinTargetG > 0 ? `Averaging ${avgProtein} g protein/day against your ${profile.proteinTargetG} g target.` : `Averaging ${avgProtein} g protein/day — set a protein target in Fuel for a verdict.`)
  }

  const stats: ReportStat[] = [
    stat('Sessions', String(sessions), { deltaPct: deltaPct(sessions, pSessions), goodDirection: 'up' }),
    stat('Minutes', formatMinutes(minutes), { deltaPct: deltaPct(minutes, pMinutes), goodDirection: 'up' }),
    stat('Volume', workingSets ? `${volumeKg.toLocaleString('en-IN')} kg` : '—', { sub: workingSets ? `${workingSets} working sets` : undefined }),
    stat('Body weight', weightNow === null ? '—' : `${weightNow} kg`, weightDelta === null ? {} : { sub: `${weightDelta >= 0 ? '+' : ''}${weightDelta} kg in window` }),
    stat('Avg protein', avgProtein === null ? '—' : `${avgProtein} g/day`, avgKcal === null ? {} : { sub: `${avgKcal.toLocaleString('en-IN')} kcal/day over ${loggedDays.size} logged day${loggedDays.size === 1 ? '' : 's'}` }),
  ]

  return { stats, series: [series], rows, notes }
}

/* ---------------- fuel (meals) ---------------- */

async function fuelReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId } = c
  const [entriesCur, entriesPrev, mealSums, manualRows, byType, profile] = await Promise.all([
    db.mealEntry.count({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } } }),
    db.mealEntry.count({ where: { userId, date: { gte: prev.fromD, lte: prev.toD } } }),
    db.mealEntry.groupBy({ by: ['date'], where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, _sum: { proteinG: true, caloriesKcal: true } }),
    db.nutritionDay.findMany({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, select: { date: true, proteinG: true, caloriesKcal: true } }),
    db.mealEntry.groupBy({ by: ['mealType'], where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, _count: true, _sum: { caloriesKcal: true } }),
    db.nutritionProfile.findUnique({ where: { userId }, select: { proteinTargetG: true, calorieTarget: true } }),
  ])

  const proteinByDay = new Map<ISODate, number>()
  const kcalByDay = new Map<ISODate, number>()
  for (const r of mealSums) {
    const iso = isoDayUTC(r.date)
    proteinByDay.set(iso, (proteinByDay.get(iso) ?? 0) + (r._sum.proteinG ?? 0))
    kcalByDay.set(iso, (kcalByDay.get(iso) ?? 0) + (r._sum.caloriesKcal ?? 0))
  }
  for (const r of manualRows) {
    const iso = isoDayUTC(r.date)
    proteinByDay.set(iso, (proteinByDay.get(iso) ?? 0) + (r.proteinG ?? 0))
    kcalByDay.set(iso, (kcalByDay.get(iso) ?? 0) + (r.caloriesKcal ?? 0))
  }
  const loggedDays = new Set([...proteinByDay.keys(), ...kcalByDay.keys()])
  const avgKcal = loggedDays.size ? Math.round([...kcalByDay.values()].reduce((a, b) => a + b, 0) / loggedDays.size) : null
  const avgProtein = loggedDays.size ? round2([...proteinByDay.values()].reduce((a, b) => a + b, 0) / loggedDays.size) : null
  const hits = profile && profile.proteinTargetG > 0 ? [...proteinByDay.values()].filter((v) => v >= profile.proteinTargetG).length : null

  const dailyKcalMap = new Map<ISODate, number>()
  for (const r of mealSums) dailyKcalMap.set(isoDayUTC(r.date), (dailyKcalMap.get(isoDayUTC(r.date)) ?? 0) + (r._sum.caloriesKcal ?? 0))
  for (const r of manualRows) dailyKcalMap.set(isoDayUTC(r.date), (dailyKcalMap.get(isoDayUTC(r.date)) ?? 0) + (r.caloriesKcal ?? 0))

  const series = buildSeries(dailyKcalMap, cur.from, cur.to, 'Calories', 'kcal', c.today)

  const typeMeta = new Map(MEAL_TYPES.map((m) => [m.key, m]))
  const rows: ReportRow[] = byType
    .sort((a, b) => (b._sum.caloriesKcal ?? 0) - (a._sum.caloriesKcal ?? 0))
    .map((t) => ({
      label: typeMeta.get(t.mealType as (typeof MEAL_TYPES)[number]['key'])?.label ?? t.mealType,
      emoji: typeMeta.get(t.mealType as (typeof MEAL_TYPES)[number]['key'])?.emoji ?? '🍽️',
      value: `${(t._sum.caloriesKcal ?? 0).toLocaleString('en-IN')} kcal`,
      sub: `${t._count} entr${t._count === 1 ? 'y' : 'ies'}`,
    }))

  const notes: string[] = []
  if (loggedDays.size === 0) notes.push('Nothing logged in this window — a day counts once any meal or quick-add is recorded.')
  if (hits !== null && loggedDays.size > 0) {
    notes.push(`Protein target hit on ${hits} of ${loggedDays.size} logged day${loggedDays.size === 1 ? '' : 's'}${profile ? ` (${profile.proteinTargetG} g target)` : ''}.`)
  }
  if (profile && avgKcal !== null) {
    notes.push(avgKcal >= profile.calorieTarget ? `Average intake ${avgKcal.toLocaleString('en-IN')} kcal is at or above your ${profile.calorieTarget.toLocaleString('en-IN')} kcal target.` : `Average intake ${avgKcal.toLocaleString('en-IN')} kcal is below your ${profile.calorieTarget.toLocaleString('en-IN')} kcal target.`)
  }

  const stats: ReportStat[] = [
    stat('Days logged', String(loggedDays.size)),
    stat('Entries', String(entriesCur), { deltaPct: deltaPct(entriesCur, entriesPrev), goodDirection: 'up' }),
    stat('Avg calories', avgKcal === null ? '—' : `${avgKcal.toLocaleString('en-IN')} kcal`, profile ? { sub: `target ${profile.calorieTarget.toLocaleString('en-IN')} kcal` } : {}),
    stat('Avg protein', avgProtein === null ? '—' : `${avgProtein} g`, profile && profile.proteinTargetG > 0 ? { sub: `target ${profile.proteinTargetG} g` } : {}),
    stat('Protein hits', hits === null ? '—' : `${hits}/${loggedDays.size} days`),
  ]

  return { stats, series: [series], rows, notes }
}

/* ---------------- study ---------------- */

async function studyReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId, today } = c
  const [seCur, sePrev, sessionRows, activeCourses, revisionsDue] = await Promise.all([
    db.studySession.aggregate({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, _count: true, _sum: { minutes: true } }),
    db.studySession.aggregate({ where: { userId, date: { gte: prev.fromD, lte: prev.toD } }, _count: true, _sum: { minutes: true } }),
    db.studySession.findMany({
      where: { userId, date: { gte: cur.fromD, lte: cur.toD } },
      select: { minutes: true, date: true, course: { select: { id: true, title: true } } },
    }),
    db.course.count({ where: { userId, status: 'active' } }),
    db.courseTopic.count({ where: { course: { userId }, nextRevisionAt: { not: null, lte: toUTC(today) } } }),
  ])

  const minutes = seCur._sum.minutes ?? 0
  const pMinutes = sePrev._sum.minutes ?? 0
  const byCourse = new Map<string, { title: string; minutes: number }>()
  const daily = new Map<ISODate, number>()
  for (const s of sessionRows) {
    const iso = isoDayUTC(s.date)
    daily.set(iso, (daily.get(iso) ?? 0) + s.minutes)
    const entry = byCourse.get(s.course.id) ?? { title: s.course.title, minutes: 0 }
    entry.minutes += s.minutes
    byCourse.set(s.course.id, entry)
  }

  const rows: ReportRow[] = [...byCourse.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 6).map((e) => ({
    label: e.title,
    emoji: '📚',
    value: formatMinutes(e.minutes),
  }))

  const notes: string[] = []
  if (minutes === 0) notes.push('No study sessions in this window.')
  else notes.push(`Averaging ${Math.round(minutes / Math.max(1, daysFrom(c)))} min per day across the window.`)
  if (revisionsDue > 0) notes.push(`${revisionsDue} revision${revisionsDue === 1 ? '' : 's'} are due right now.`)

  const stats: ReportStat[] = [
    stat('Sessions', String(seCur._count), { deltaPct: deltaPct(seCur._count, sePrev._count), goodDirection: 'up' }),
    stat('Minutes', formatMinutes(minutes), { deltaPct: deltaPct(minutes, pMinutes), goodDirection: 'up' }),
    stat('Active courses', String(activeCourses)),
    stat('Revisions due', String(revisionsDue)),
  ]

  return { stats, series: [buildSeries(daily, cur.from, cur.to, 'Study minutes', 'minutes', c.today)], rows, notes }
}

function daysFrom(c: Ctx): number {
  const n = Math.round((c.cur.toD.getTime() - c.cur.fromD.getTime()) / 86_400_000) + 1
  return n > 0 ? n : 1
}

/* ---------------- habits ---------------- */

async function habitsReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId, today } = c
  const [habits, entriesCur, entriesPrev] = await Promise.all([
    db.habit.findMany({ where: { userId }, select: { id: true, name: true, emoji: true, weekdays: true, archived: true, startDate: true } }),
    db.habitEntry.findMany({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, select: { habitId: true, date: true } }),
    db.habitEntry.count({ where: { userId, date: { gte: prev.fromD, lte: prev.toD } } }),
  ])

  const doneByHabit = new Map<string, Set<ISODate>>()
  const daily = new Map<ISODate, number>()
  for (const e of entriesCur) {
    const iso = isoDayUTC(e.date)
    const set = doneByHabit.get(e.habitId) ?? new Set<ISODate>()
    set.add(iso)
    doneByHabit.set(e.habitId, set)
    daily.set(iso, (daily.get(iso) ?? 0) + 1)
  }

  const tracked = habits.filter((h) => !h.archived)
  const perHabit = tracked.map((h) => {
    const done = doneByHabit.get(h.id) ?? new Set<ISODate>()
    const startISO = isoDayUTC(h.startDate) > cur.from ? isoDayUTC(h.startDate) : cur.from
    return {
      name: h.name,
      emoji: h.emoji,
      completions: done.size,
      rate: completionRate(done, h.weekdays, startISO, cur.to, today),
    }
  })
  const avgRate = perHabit.length ? perHabit.reduce((s, h) => s + h.rate, 0) / perHabit.length : null
  const best = [...perHabit].sort((a, b) => b.rate - a.rate)[0]

  const rows: ReportRow[] = [...perHabit]
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)
    .map((h) => ({
      label: h.name,
      emoji: h.emoji,
      value: `${Math.round(h.rate * 100)}%`,
      sub: `${h.completions} check-in${h.completions === 1 ? '' : 's'}`,
    }))

  const notes: string[] = []
  if (tracked.length === 0) notes.push('No active habits in this window.')
  else if (best) notes.push(`${best.emoji} ${best.name} leads at ${Math.round(best.rate * 100)}% adherence.`)
  if (tracked.length > 0 && avgRate !== null) {
    notes.push(avgRate >= 0.8 ? 'Above 80% average — this is what a built habit looks like.' : 'Rates count only scheduled days, so rest days never drag you down.')
  }

  const stats: ReportStat[] = [
    stat('Habits tracked', String(tracked.length)),
    stat('Check-ins', String(entriesCur.length), { deltaPct: deltaPct(entriesCur.length, entriesPrev), goodDirection: 'up' }),
    stat('Avg completion', avgRate === null ? '—' : `${Math.round(avgRate * 100)}%`),
    stat('Best habit', best ? `${Math.round(best.rate * 100)}%` : '—', best ? { sub: `${best.emoji} ${best.name}` } : {}),
  ]

  return { stats, series: [buildSeries(daily, cur.from, cur.to, 'Check-ins', 'count', c.today)], rows, notes }
}

/* ---------------- goals ---------------- */

async function goalsReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId } = c
  const [goals, milestonesDone, logsCur, logsPrev, contribs] = await Promise.all([
    db.goal.findMany({ where: { userId }, select: { id: true, title: true, emoji: true, status: true } }),
    db.milestone.findMany({
      where: { goal: { userId }, doneAt: { gte: cur.fromD, lt: cur.toExD } },
      select: { id: true, title: true, goalId: true },
    }),
    db.milestoneLog.findMany({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, select: { minutes: true, date: true, milestone: { select: { goalId: true } } } }),
    db.milestoneLog.aggregate({ where: { userId, date: { gte: prev.fromD, lte: prev.toD } }, _sum: { minutes: true } }),
    db.goalContribution.findMany({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, select: { goalId: true, amountMilli: true } }),
  ])

  const minutes = logsCur.reduce((s, l) => s + l.minutes, 0)
  const daily = new Map<ISODate, number>()
  const minutesByGoal = new Map<string, number>()
  for (const l of logsCur) {
    const iso = isoDayUTC(l.date)
    daily.set(iso, (daily.get(iso) ?? 0) + l.minutes)
    if (l.milestone.goalId) minutesByGoal.set(l.milestone.goalId, (minutesByGoal.get(l.milestone.goalId) ?? 0) + l.minutes)
  }
  const contribCount = contribs.length
  const contribByGoal = new Map<string, number>()
  for (const g of contribs) contribByGoal.set(g.goalId, (contribByGoal.get(g.goalId) ?? 0) + Number(g.amountMilli))

  const active = goals.filter((g) => g.status === 'active')
  const rows: ReportRow[] = active
    .map((g) => ({
      goal: g,
      minutes: minutesByGoal.get(g.id) ?? 0,
      milli: contribByGoal.get(g.id) ?? 0,
    }))
    .sort((a, b) => b.minutes + b.milli / 1000 - (a.minutes + a.milli / 1000))
    .slice(0, 6)
    .map((r) => ({
      label: r.goal.title,
      emoji: r.goal.emoji,
      value: r.minutes > 0 ? formatMinutes(r.minutes) : r.milli > 0 ? `${(r.milli / 1000).toLocaleString('en-IN')} units` : '—',
      sub: milestonesDone.filter((m) => m.goalId === r.goal.id).length > 0 ? `${milestonesDone.filter((m) => m.goalId === r.goal.id).length} milestone(s) done` : undefined,
    }))

  const notes: string[] = []
  if (milestonesDone.length > 0) {
    notes.push(`${milestonesDone.length} milestone${milestonesDone.length === 1 ? '' : 's'} checked off: ${milestonesDone.slice(0, 3).map((m) => m.title).join(', ')}${milestonesDone.length > 3 ? '…' : ''}`)
  }
  if (contribCount > 0) notes.push(`${contribCount} daily contribution${contribCount === 1 ? '' : 's'} logged toward your goals.`)
  if (active.length === 0) notes.push('No active goals — the effort you log will show here once you set one.')

  const totalMilli = contribs.reduce((s, g) => s + Number(g.amountMilli), 0)
  const stats: ReportStat[] = [
    stat('Active goals', String(active.length)),
    stat('Milestones done', String(milestonesDone.length)),
    stat('Goal effort', formatMinutes(minutes), { deltaPct: deltaPct(minutes, logsPrev._sum.minutes ?? 0), goodDirection: 'up' }),
    stat('Contributions', String(contribCount), contribCount ? { sub: `${(totalMilli / 1000).toLocaleString('en-IN')} units total` } : {}),
  ]

  return { stats, series: [buildSeries(daily, cur.from, cur.to, 'Goal effort', 'minutes', c.today)], rows, notes }
}

/* ---------------- journal ---------------- */

async function journalReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId } = c
  const [entriesCur, countPrev] = await Promise.all([
    db.journalEntry.findMany({
      where: { userId, date: { gte: cur.fromD, lte: cur.toD } },
      select: { date: true, mood: true, title: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
    db.journalEntry.count({ where: { userId, date: { gte: prev.fromD, lte: prev.toD } } }),
  ])

  const daily = new Map<ISODate, number>()
  const daySet = new Set<ISODate>()
  const moodCounts = new Map<string, number>()
  const moodScores: number[] = []
  for (const e of entriesCur) {
    const iso = isoDayUTC(e.date)
    daily.set(iso, (daily.get(iso) ?? 0) + 1)
    daySet.add(iso)
    if (e.mood && isMood(e.mood)) {
      moodCounts.set(e.mood, (moodCounts.get(e.mood) ?? 0) + 1)
      moodScores.push(moodToScore(e.mood))
    }
  }
  const avgMood = moodScores.length ? Math.round(moodScores.reduce((a, b) => a + b, 0) / moodScores.length) : null
  const streak = journalStreak(daySet, cur.to)

  const moodOrder = ['great', 'good', 'okay', 'low', 'bad'] as const
  const rows: ReportRow[] = moodOrder
    .filter((m) => moodCounts.has(m))
    .map((m) => ({
      label: MOOD_META[m].label,
      emoji: MOOD_META[m].emoji,
      value: `${moodCounts.get(m)} entr${moodCounts.get(m) === 1 ? 'y' : 'ies'}`,
    }))

  const notes: string[] = []
  if (entriesCur.length === 0) notes.push('No entries in this window — even one line a day keeps the streak alive.')
  else if (avgMood !== null) notes.push(`Average mood ${avgMood >= 75 ? 'leans bright' : avgMood >= 50 ? 'sits steady' : 'has been heavy'} across ${moodScores.length} mood-tagged entries.`)
  if (daySet.size > 0) notes.push(`${daySet.size} distinct day${daySet.size === 1 ? '' : 's'} journaled out of ${entriesCur.length} total entries.`)

  const stats: ReportStat[] = [
    stat('Entries', String(entriesCur.length), { deltaPct: deltaPct(entriesCur.length, countPrev), goodDirection: 'up' }),
    stat('Days journaled', String(daySet.size)),
    stat('Avg mood', avgMood === null ? '—' : `${avgMood}/100`),
    stat('Streak at window end', streak > 0 ? `${streak} day${streak === 1 ? '' : 's'}` : '—'),
  ]

  return { stats, series: [buildSeries(daily, cur.from, cur.to, 'Entries', 'count', c.today)], rows, notes }
}

/* ---------------- skin ---------------- */

async function skinReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId } = c
  const [checkins, prevCount] = await Promise.all([
    db.skinCheckIn.findMany({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, select: { date: true, amDone: true, pmDone: true }, orderBy: { date: 'asc' } }),
    db.skinCheckIn.count({ where: { userId, date: { gte: prev.fromD, lte: prev.toD } } }),
  ])

  const daily = new Map<ISODate, number>()
  let am = 0
  let pm = 0
  let perfect = 0
  for (const ch of checkins) {
    const iso = isoDayUTC(ch.date)
    const v = (ch.amDone ? 1 : 0) + (ch.pmDone ? 1 : 0)
    daily.set(iso, v)
    if (ch.amDone) am++
    if (ch.pmDone) pm++
    if (v === 2) perfect++
  }

  const notes: string[] = []
  if (checkins.length === 0) notes.push('No check-ins in this window.')
  else notes.push(`${perfect} perfect day${perfect === 1 ? '' : 's'} (AM + PM both done) out of ${checkins.length} checked day${checkins.length === 1 ? '' : 's'}.`)

  const stats: ReportStat[] = [
    stat('Days checked', String(checkins.length), { deltaPct: deltaPct(checkins.length, prevCount), goodDirection: 'up' }),
    stat('AM done', String(am)),
    stat('PM done', String(pm)),
    stat('Perfect days', String(perfect)),
  ]

  return { stats, series: [buildSeries(daily, cur.from, cur.to, 'AM + PM check-ins', 'count', c.today)], rows: [], notes }
}

/* ---------------- reading ---------------- */

async function readingReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId } = c
  const [seCur, sePrev, sessionRows, finished, sessionsForStreak] = await Promise.all([
    db.readingSession.aggregate({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, _count: true, _sum: { minutes: true, pages: true } }),
    db.readingSession.aggregate({ where: { userId, date: { gte: prev.fromD, lte: prev.toD } }, _count: true, _sum: { minutes: true } }),
    db.readingSession.findMany({
      where: { userId, date: { gte: cur.fromD, lte: cur.toD } },
      select: { minutes: true, date: true, book: { select: { id: true, title: true } } },
    }),
    db.book.count({ where: { userId, status: 'finished', finishedAt: { gte: cur.fromD, lt: cur.toExD } } }),
    db.readingSession.findMany({ where: { userId, date: { lte: cur.toD } }, select: { date: true, minutes: true }, orderBy: { date: 'desc' }, take: 500 }),
  ])

  const minutes = seCur._sum.minutes ?? 0
  const pMinutes = sePrev._sum.minutes ?? 0
  const daily = new Map<ISODate, number>()
  const byBook = new Map<string, { title: string; minutes: number }>()
  for (const s of sessionRows) {
    const iso = isoDayUTC(s.date)
    daily.set(iso, (daily.get(iso) ?? 0) + s.minutes)
    const e = byBook.get(s.book.id) ?? { title: s.book.title, minutes: 0 }
    e.minutes += s.minutes
    byBook.set(s.book.id, e)
  }
  const streak = readingStreakOf(sessionsForStreak, cur.to)

  const rows: ReportRow[] = [...byBook.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 6).map((e) => ({
    label: e.title,
    emoji: '📖',
    value: formatMinutes(e.minutes),
  }))

  const notes: string[] = []
  if (minutes > 0) notes.push(`Averaging ${Math.round(minutes / daysFrom(c))} min per day across the window.`)
  if (finished > 0) notes.push(`${finished} book${finished === 1 ? '' : 's'} finished — every one of them a full stop you earned.`)
  if (streak > 1) notes.push(`Reading streak at window end: ${streak} day${streak === 1 ? '' : 's'}.`)

  const stats: ReportStat[] = [
    stat('Minutes', formatMinutes(minutes), { deltaPct: deltaPct(minutes, pMinutes), goodDirection: 'up' }),
    stat('Pages', String(seCur._sum.pages ?? 0)),
    stat('Sessions', String(seCur._count), { deltaPct: deltaPct(seCur._count, sePrev._count), goodDirection: 'up' }),
    stat('Books finished', String(finished)),
  ]

  return { stats, series: [buildSeries(daily, cur.from, cur.to, 'Reading minutes', 'minutes', c.today)], rows, notes }
}

function readingStreakOf(rows: readonly { date: Date }[], endISO: ISODate): number {
  const days = new Set(rows.map((r) => isoDayUTC(r.date)))
  let streak = 0
  let cursor = endISO
  // walk backwards from the window end; a gap ends the streak
  for (let i = 0; i < 400; i++) {
    if (days.has(cursor)) {
      streak++
      cursor = shiftISO(cursor, -1)
    } else if (i === 0) {
      cursor = shiftISO(cursor, -1) // allow the last day itself to be empty
    } else break
  }
  return streak
}

/* ---------------- skills ---------------- */

async function skillsReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId } = c
  const [prCur, prPrev, practiceRows, activeSkills] = await Promise.all([
    db.skillPractice.aggregate({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, _count: true, _sum: { minutes: true } }),
    db.skillPractice.aggregate({ where: { userId, date: { gte: prev.fromD, lte: prev.toD } }, _count: true, _sum: { minutes: true } }),
    db.skillPractice.findMany({
      where: { userId, date: { gte: cur.fromD, lte: cur.toD } },
      select: { minutes: true, date: true, skill: { select: { id: true, name: true } } },
    }),
    db.skill.count({ where: { userId, status: 'active' } }),
  ])

  const minutes = prCur._sum.minutes ?? 0
  const pMinutes = prPrev._sum.minutes ?? 0
  const daily = new Map<ISODate, number>()
  const bySkill = new Map<string, { name: string; minutes: number }>()
  for (const p of practiceRows) {
    const iso = isoDayUTC(p.date)
    daily.set(iso, (daily.get(iso) ?? 0) + p.minutes)
    const e = bySkill.get(p.skill.id) ?? { name: p.skill.name, minutes: 0 }
    e.minutes += p.minutes
    bySkill.set(p.skill.id, e)
  }

  const rows: ReportRow[] = [...bySkill.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 6).map((e) => ({
    label: e.name,
    emoji: '⚡',
    value: formatMinutes(e.minutes),
    sub: `${e.minutes} XP earned`,
  }))

  const notes: string[] = []
  if (minutes > 0) notes.push(`${minutes} XP added this window (1 practice minute = 1 XP).`)
  else notes.push('No practice logged in this window.')
  if (bySkill.size > 1) notes.push(`Spread across ${bySkill.size} skills — depth beats breadth, but consistency beats both.`)

  const stats: ReportStat[] = [
    stat('Sessions', String(prCur._count), { deltaPct: deltaPct(prCur._count, prPrev._count), goodDirection: 'up' }),
    stat('Minutes', formatMinutes(minutes), { deltaPct: deltaPct(minutes, pMinutes), goodDirection: 'up' }),
    stat('XP added', String(minutes)),
    stat('Active skills', String(activeSkills)),
  ]

  return { stats, series: [buildSeries(daily, cur.from, cur.to, 'Practice minutes', 'minutes', c.today)], rows, notes }
}

/* ---------------- people ---------------- */

async function peopleReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId, today } = c
  const [tCur, tPrev, touchRows, byType, newPeople, activePeople, lastTouches] = await Promise.all([
    db.touchpoint.aggregate({ where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, _count: true }),
    db.touchpoint.aggregate({ where: { userId, date: { gte: prev.fromD, lte: prev.toD } }, _count: true }),
    db.touchpoint.findMany({
      where: { userId, date: { gte: cur.fromD, lte: cur.toD } },
      select: { date: true, person: { select: { id: true, name: true } } },
    }),
    db.touchpoint.groupBy({ by: ['type'], where: { userId, date: { gte: cur.fromD, lte: cur.toD } }, _count: true }),
    db.person.count({ where: { userId, createdAt: { gte: cur.fromD, lt: cur.toExD } } }),
    db.person.findMany({ where: { userId, archived: false }, select: { id: true, name: true, importance: true, cadenceDays: true } }),
    db.touchpoint.groupBy({ by: ['personId'], where: { userId }, _max: { date: true } }),
  ])

  const daily = new Map<ISODate, number>()
  const metPeople = new Set<string>()
  for (const t of touchRows) {
    const iso = isoDayUTC(t.date)
    daily.set(iso, (daily.get(iso) ?? 0) + 1)
    metPeople.add(t.person.id)
  }

  const lastByPerson = new Map(lastTouches.map((t) => [t.personId, t._max.date ? isoDayUTC(t._max.date) : null]))
  let inRhythm = 0
  for (const p of activePeople) {
    if (reconnectState(lastByPerson.get(p.id) ?? null, cadenceFor(p.importance, p.cadenceDays), today).status === 'ok') inRhythm++
  }

  const typeMeta: Record<string, { label: string; emoji: string }> = {
    meet: { label: 'Met', emoji: '🤝' },
    call: { label: 'Calls', emoji: '📞' },
    text: { label: 'Texts', emoji: '💬' },
    event: { label: 'Events', emoji: '🎪' },
    other: { label: 'Other', emoji: '✨' },
  }
  const rows: ReportRow[] = byType
    .sort((a, b) => b._count - a._count)
    .map((t) => ({
      label: typeMeta[t.type]?.label ?? t.type,
      emoji: typeMeta[t.type]?.emoji ?? '✨',
      value: String(t._count),
    }))
  rows.push({ label: 'In rhythm', emoji: '💚', value: `${inRhythm}/${activePeople.length}`, sub: 'within their reconnect cadence right now' })

  const notes: string[] = []
  if (tCur._count === 0) notes.push('No touchpoints in this window — one message counts.')
  else notes.push(`${metPeople.size} distinct people touched across ${tCur._count} touchpoint${tCur._count === 1 ? '' : 's'}.`)
  if (activePeople.length > 0 && inRhythm < activePeople.length) {
    notes.push(`${activePeople.length - inRhythm} of ${activePeople.length} people have drifted past their cadence.`)
  }

  const stats: ReportStat[] = [
    stat('Touchpoints', String(tCur._count), { deltaPct: deltaPct(tCur._count, tPrev._count), goodDirection: 'up' }),
    stat('People met', String(metPeople.size)),
    stat('New people', String(newPeople)),
    stat('In rhythm', activePeople.length ? `${inRhythm}/${activePeople.length}` : '—'),
  ]

  return { stats, series: [buildSeries(daily, cur.from, cur.to, 'Touchpoints', 'count', c.today)], rows, notes }
}

/* ---------------- content ---------------- */

async function contentReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId } = c
  const [added, addedPrev, done, donePrev, queue, byKind, doneRows, favorites] = await Promise.all([
    db.contentItem.count({ where: { userId, createdAt: { gte: cur.fromD, lt: cur.toExD } } }),
    db.contentItem.count({ where: { userId, createdAt: { gte: prev.fromD, lt: prev.toExD } } }),
    db.contentItem.count({ where: { userId, status: 'done', consumedAt: { gte: cur.fromD, lt: cur.toExD } } }),
    db.contentItem.count({ where: { userId, status: 'done', consumedAt: { gte: prev.fromD, lt: prev.toExD } } }),
    db.contentItem.count({ where: { userId, status: { in: ['inbox', 'active'] } } }),
    db.contentItem.groupBy({ by: ['kind'], where: { userId }, _count: true }),
    db.contentItem.findMany({ where: { userId, status: 'done', consumedAt: { gte: cur.fromD, lt: cur.toExD } }, select: { consumedAt: true, title: true } }),
    db.contentItem.count({ where: { userId, favorite: true } }),
  ])

  const daily = new Map<ISODate, number>()
  for (const item of doneRows) {
    if (!item.consumedAt) continue
    const iso = isoDayUTC(item.consumedAt)
    daily.set(iso, (daily.get(iso) ?? 0) + 1)
  }

  const kindMeta: Record<string, { label: string; emoji: string }> = {
    video: { label: 'Videos', emoji: '▶️' },
    article: { label: 'Articles', emoji: '📰' },
    link: { label: 'Links', emoji: '🔗' },
    file: { label: 'Files', emoji: '📎' },
  }
  const rows: ReportRow[] = byKind
    .sort((a, b) => b._count - a._count)
    .map((k) => ({
      label: kindMeta[k.kind]?.label ?? k.kind,
      emoji: kindMeta[k.kind]?.emoji ?? '🔗',
      value: String(k._count),
      sub: 'in library',
    }))

  const notes: string[] = []
  if (added === 0 && done === 0) notes.push('Nothing saved or completed in this window.')
  else if (added > done && done >= 0) notes.push(`Saved ${added}, completed ${done} — the queue ${queue > 0 ? `now holds ${queue} item${queue === 1 ? '' : 's'}` : 'is clear'}.`)
  if (queue > 10) notes.push('A 10+ queue is a to-read graveyard — finish or archive ruthlessly.')

  const stats: ReportStat[] = [
    stat('Added', String(added), { deltaPct: deltaPct(added, addedPrev) }),
    stat('Completed', String(done), { deltaPct: deltaPct(done, donePrev), goodDirection: 'up' }),
    stat('In queue', String(queue)),
    stat('Favorites', String(favorites)),
  ]

  return { stats, series: [buildSeries(daily, cur.from, cur.to, 'Completions', 'count', c.today)], rows, notes }
}

/* ---------------- ideas ---------------- */

async function ideasReport(c: Ctx): Promise<ReportBody> {
  const { cur, prev, userId } = c
  const [created, createdPrev, launched, launchedPrev, allIdeas, createdRows] = await Promise.all([
    db.idea.count({ where: { userId, createdAt: { gte: cur.fromD, lt: cur.toExD } } }),
    db.idea.count({ where: { userId, createdAt: { gte: prev.fromD, lt: prev.toExD } } }),
    db.idea.count({ where: { userId, status: 'launched', launchedAt: { gte: cur.fromD, lt: cur.toExD } } }),
    db.idea.count({ where: { userId, status: 'launched', launchedAt: { gte: prev.fromD, lt: prev.toExD } } }),
    db.idea.findMany({ where: { userId }, select: { status: true, impact: true, confidence: true, effort: true } }),
    db.idea.findMany({ where: { userId, createdAt: { gte: cur.fromD, lt: cur.toExD } }, select: { createdAt: true } }),
  ])

  const dailyCreated = new Map<ISODate, number>()
  for (const r of createdRows) dailyCreated.set(isoDayUTC(r.createdAt), (dailyCreated.get(isoDayUTC(r.createdAt)) ?? 0) + 1)

  const pipeline = allIdeas.filter((i) => (PIPELINE_STATUSES as readonly string[]).includes(i.status))
  const pipelineIce = pipeline
    .map((i) => iceScore(i.impact, i.confidence, i.effort))
    .filter((v): v is number => v !== null)
  const avgIce = pipelineIce.length ? round2(pipelineIce.reduce((a, b) => a + b, 0) / pipelineIce.length) : null

  const statusCounts = new Map<string, number>()
  for (const i of allIdeas) statusCounts.set(i.status, (statusCounts.get(i.status) ?? 0) + 1)
  const statusMeta: Record<string, { label: string; emoji: string }> = {
    spark: { label: 'Sparks', emoji: '✨' },
    exploring: { label: 'Exploring', emoji: '🔍' },
    planned: { label: 'Planned', emoji: '🗺️' },
    launched: { label: 'Launched', emoji: '🚀' },
    parked: { label: 'Parked', emoji: '🅿️' },
    dropped: { label: 'Dropped', emoji: '🗑️' },
  }
  const rows: ReportRow[] = ['spark', 'exploring', 'planned', 'launched', 'parked', 'dropped']
    .filter((s) => statusCounts.has(s))
    .map((s) => ({ label: statusMeta[s].label, emoji: statusMeta[s].emoji, value: String(statusCounts.get(s)) }))

  const notes: string[] = []
  if (allIdeas.length === 0) notes.push('No ideas captured yet — sparks are free, capture them the moment they land.')
  else if (launched > 0) notes.push(`${launched} idea${launched === 1 ? '' : 's'} launched this window 🚀`)
  if (pipeline.length > 0 && avgIce !== null) {
    notes.push(`Pipeline averages an ICE score of ${avgIce} across ${pipeline.length} live idea${pipeline.length === 1 ? '' : 's'}.`)
  }

  const stats: ReportStat[] = [
    stat('Created', String(created), { deltaPct: deltaPct(created, createdPrev) }),
    stat('Launched', String(launched), { deltaPct: deltaPct(launched, launchedPrev), goodDirection: 'up' }),
    stat('In pipeline', String(pipeline.length)),
    stat('Avg ICE', avgIce === null ? '—' : String(avgIce), { sub: 'impact × confidence ÷ effort' }),
  ]

  return { stats, series: [buildSeries(dailyCreated, cur.from, cur.to, 'Ideas created', 'count', c.today)], rows, notes }
}

/* ---------------- dispatcher ---------------- */

export async function domainReport(userId: string, tz: string, domain: ReportDomain, from: ISODate, to: ISODate): Promise<DomainReportPayload> {
  const today = todayISO(tz)
  const prevWin = shiftWindowBack(from, to)
  const ctx: Ctx = { userId, tz, today, cur: makeWin(from, to), prev: makeWin(prevWin.from, prevWin.to) }
  const meta = reportDomainMeta(domain)

  let body: ReportBody
  switch (domain) {
    case 'money': body = await moneyReport(ctx); break
    case 'fitness': body = await fitnessReport(ctx); break
    case 'fuel': body = await fuelReport(ctx); break
    case 'study': body = await studyReport(ctx); break
    case 'habits': body = await habitsReport(ctx); break
    case 'goals': body = await goalsReport(ctx); break
    case 'journal': body = await journalReport(ctx); break
    case 'skin': body = await skinReport(ctx); break
    case 'reading': body = await readingReport(ctx); break
    case 'skills': body = await skillsReport(ctx); break
    case 'people': body = await peopleReport(ctx); break
    case 'content': body = await contentReport(ctx); break
    case 'ideas': body = await ideasReport(ctx); break
  }

  return {
    domain,
    title: meta.label,
    emoji: meta.emoji,
    from,
    to,
    windowLabel: windowLabel(from, to),
    prevLabel: `${prevWin.from} – ${prevWin.to}`,
    ...body,
  }
}

/* ---------------- monthly Life Report ---------------- */

export async function lifeReport(userId: string, tz: string, monthKey: string): Promise<LifeReportPayload> {
  const { from, to } = monthWindowLocal(monthKey)
  const prevWin = shiftWindowBack(from, to)
  const ctx: Ctx = { userId, tz, today: todayISO(tz), cur: makeWin(from, to), prev: makeWin(prevWin.from, prevWin.to) }

  const [score, wealth, fitness, fuel, study, habits, goals, journal, skin, reading, skills, people, content, ideas] = await Promise.all([
    lifeScore(userId, tz),
    moneyReport(ctx),
    fitnessReport(ctx),
    fuelReport(ctx),
    studyReport(ctx),
    habitsReport(ctx),
    goalsReport(ctx),
    journalReport(ctx),
    skinReport(ctx),
    readingReport(ctx),
    skillsReport(ctx),
    peopleReport(ctx),
    contentReport(ctx),
    ideasReport(ctx),
  ])

  const pick = (body: ReportBody, label: string): ReportStat | undefined => body.stats.find((s) => s.label === label)
  // several domains share the generic label "Minutes" — prefix them so the
  // Life Report rows are self-describing (and React keys stay unique)
  const relabel = (s: ReportStat | undefined, label: string): ReportStat | undefined => (s ? { ...s, label } : undefined)

  const wealthHighlights = wealth.notes.slice(0, 2)
  const growthHighlights = [...fitness.notes.slice(0, 1), ...habits.notes.slice(0, 1), ...goals.notes.slice(0, 1)].filter(Boolean)
  const reflectionHighlights = [...journal.notes.slice(0, 1), ...reading.notes.filter((n) => n.includes('finished')).slice(0, 1), ...people.notes.slice(0, 1)].filter(Boolean)

  const sections: LifeReportSection[] = [
    {
      pillar: 'wealth',
      title: 'Wealth',
      emoji: '💰',
      stats: wealth.stats.slice(0, 4),
      highlights: wealthHighlights,
    },
    {
      pillar: 'growth',
      title: 'Growth',
      emoji: '🌱',
      stats: [
        relabel(pick(fitness, 'Sessions'), 'Workouts'),
        relabel(pick(fitness, 'Minutes'), 'Training'),
        relabel(pick(study, 'Minutes'), 'Study'),
        relabel(pick(reading, 'Minutes'), 'Reading'),
        relabel(pick(skills, 'Minutes'), 'Skills'),
        pick(habits, 'Check-ins'),
        pick(goals, 'Milestones done'),
      ].filter((s): s is ReportStat => s !== undefined),
      highlights: growthHighlights,
    },
    {
      pillar: 'reflection',
      title: 'Reflection',
      emoji: '🪞',
      stats: [
        pick(journal, 'Entries') ?? stat('Entries', '—'),
        pick(journal, 'Avg mood') ?? stat('Avg mood', '—'),
        pick(skin, 'Perfect days') ?? stat('Perfect days', '—'),
        pick(people, 'Touchpoints') ?? stat('Touchpoints', '—'),
        pick(reading, 'Books finished') ?? stat('Books finished', '—'),
        pick(content, 'Completed') ?? stat('Content completed', '—'),
        pick(fuel, 'Protein hits') ?? stat('Protein hits', '—'),
      ],
      highlights: reflectionHighlights,
    },
  ]

  const headlineBits = [
    `${score.overall === null ? 'Life Score —' : `Life Score ${score.overall}`}`,
    `${(fitness.stats[0]?.value ?? '0')} workouts`,
    pick(reading, 'Books finished')?.value !== undefined ? `${pick(reading, 'Books finished')?.value} books finished` : null,
    wealth.stats.find((s) => s.label === 'Savings rate')?.value !== '—' ? `${wealth.stats.find((s) => s.label === 'Savings rate')?.value} savings rate` : null,
  ].filter((b): b is string => b !== null && b !== undefined && !b.startsWith('0 '))

  return {
    month: monthKey,
    monthLabel: formatMonthLabel(monthKey),
    headline: headlineBits.join(' · '),
    score,
    sections,
  }
}

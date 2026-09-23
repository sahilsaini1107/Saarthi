// Milestone journal service (Phase 11): daily progress logs on goal
// milestones — minutes worked + what was done / what I'm learning / key
// takeaway. Every query is user-scoped (RLS-equivalent). Grid windows and
// streaks reuse lib/goals-grid, levels + roll-ups reuse lib/effort-grid,
// aggregation lives in lib/milestone.ts (pure, unit-tested).

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { isoDayUTC, monthRange, todayISO, toUTC, type ISODate } from '@/lib/date'
import { buildGrid, contributionWindow } from '@/lib/goals-grid'
import { levelsForValues, rollupMonths, rollupWeeks } from '@/lib/effort-grid'
import { journalStreaks, sumMinutesByDay, timeProgress } from '@/lib/milestone'
import type { JournalLearningsDTO, LearningItemDTO, MilestoneLogDTO } from '@/lib/types'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
/** Per-day journal ceiling: minutes in a day (24h). */
const MAX_DAY_MINUTES = 1440
/** Reflection-field ceiling (chars). */
const MAX_TEXT = 500

export interface MilestoneLogInput {
  date: string
  minutes: number
  did?: string | null
  learned?: string | null
  keyLearning?: string | null
}

function cleanText(v: string | null | undefined): string | null {
  const t = v?.trim() ?? ''
  return t ? t.slice(0, MAX_TEXT) : null
}

function shapeLog(l: {
  id: string
  milestoneId: string
  date: Date
  minutes: number
  did: string | null
  learned: string | null
  keyLearning: string | null
}): MilestoneLogDTO {
  return {
    id: l.id,
    milestoneId: l.milestoneId,
    date: isoDayUTC(l.date),
    minutes: l.minutes,
    did: l.did,
    learned: l.learned,
    keyLearning: l.keyLearning,
  }
}

async function ownedMilestone(userId: string, milestoneId: string) {
  const m = await db.milestone.findFirst({ where: { id: milestoneId, goal: { userId } } })
  if (!m) throw new HttpError('Milestone not found', 404)
  return m
}

function validateLogInput(input: MilestoneLogInput, today: ISODate) {
  if (!ISO_RE.test(input.date)) throw new HttpError('Date must be YYYY-MM-DD', 422)
  if (!Number.isSafeInteger(input.minutes) || input.minutes < 1 || input.minutes > MAX_DAY_MINUTES) {
    throw new HttpError('Minutes must be between 1 and 1440', 422)
  }
  if (input.date > today) throw new HttpError('Journal entries cannot be logged for future dates', 422)
}

/**
 * Upsert one day's journal entry (exactly-once per milestone+day —
 * re-sending a date replaces it, Decision #21 convention).
 */
export async function logMilestoneProgress(userId: string, milestoneId: string, input: MilestoneLogInput, tz: string) {
  const today = todayISO(tz)
  await ownedMilestone(userId, milestoneId)
  validateLogInput(input, today)
  const row = await db.milestoneLog.upsert({
    where: { milestoneId_date: { milestoneId, date: toUTC(input.date) } },
    create: {
      userId,
      milestoneId,
      date: toUTC(input.date),
      minutes: input.minutes,
      did: cleanText(input.did),
      learned: cleanText(input.learned),
      keyLearning: cleanText(input.keyLearning),
    },
    update: {
      minutes: input.minutes,
      did: input.did !== undefined ? cleanText(input.did) : undefined,
      learned: input.learned !== undefined ? cleanText(input.learned) : undefined,
      keyLearning: input.keyLearning !== undefined ? cleanText(input.keyLearning) : undefined,
    },
  })
  return shapeLog(row)
}

/** Remove one day's journal entry (no-op when the day has none). */
export async function removeMilestoneLog(userId: string, milestoneId: string, date: string): Promise<void> {
  await ownedMilestone(userId, milestoneId)
  if (!ISO_RE.test(date)) throw new HttpError('Date must be YYYY-MM-DD', 422)
  await db.milestoneLog.deleteMany({ where: { milestoneId, userId, date: toUTC(date) } })
}

/** A milestone's full journal, newest first. */
export async function listMilestoneLogs(userId: string, milestoneId: string) {
  await ownedMilestone(userId, milestoneId)
  const rows = await db.milestoneLog.findMany({
    where: { milestoneId, userId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  })
  return rows.map(shapeLog)
}

/**
 * One day's entries across ALL of the goal's milestones (grid tap → edit
 * day). Milestones without an entry that day come back with nulls so the
 * editor can create them in place.
 */
export async function goalDayLogs(userId: string, goalId: string, date: string) {
  const goal = await db.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } })
  if (!goal) throw new HttpError('Goal not found', 404)
  if (!ISO_RE.test(date)) throw new HttpError('Date must be YYYY-MM-DD', 422)
  const milestones = await db.milestone.findMany({
    where: { goalId },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      title: true,
      logs: { where: { date: toUTC(date) }, orderBy: { createdAt: 'desc' } },
    },
  })
  return {
    date,
    entries: milestones.map((m) => {
      const log = m.logs[0] ?? null
      return {
        milestoneId: m.id,
        milestoneTitle: m.title,
        logId: log?.id ?? null,
        minutes: log?.minutes ?? null,
        did: log?.did ?? null,
        learned: log?.learned ?? null,
        keyLearning: log?.keyLearning ?? null,
      }
    }),
  }
}

/** Recent-entries cap per milestone in the journal payload (history stays in the DB). */
const RECENT_CAP = 20

/**
 * The goal journal payload: per-milestone summaries + recent entries, plus a
 * goal-level effort grid aggregating minutes across milestones, with
 * streaks and full-history weekly/monthly roll-ups (Decision #43).
 */
export async function goalJournal(userId: string, goalId: string, tz: string) {
  const goal = await db.goal.findFirst({
    where: { id: goalId, userId },
    include: {
      milestones: {
        orderBy: { order: 'asc' },
        include: { logs: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] } },
      },
    },
  })
  if (!goal) throw new HttpError('Goal not found', 404)
  const today = todayISO(tz)
  const targetDate = goal.targetDate ? isoDayUTC(goal.targetDate) : null

  const milestones = goal.milestones.map((m) => {
    const totalMinutes = m.logs.reduce((s, l) => s + l.minutes, 0)
    const todayMinutes = m.logs.filter((l) => isoDayUTC(l.date) === today).reduce((s, l) => s + l.minutes, 0)
    const last = m.logs[0] ?? null
    return {
      id: m.id,
      title: m.title,
      order: m.order,
      done: m.doneAt != null,
      targetMinutes: m.targetMinutes,
      totalMinutes,
      todayMinutes,
      loggedToday: todayMinutes > 0,
      lastLoggedDate: last ? isoDayUTC(last.date) : null,
      logCount: m.logs.length,
      timeProgress: timeProgress(totalMinutes, m.targetMinutes),
      recentLogs: m.logs.slice(0, RECENT_CAP).map(shapeLog),
    }
  })

  // goal-level grid: minutes aggregated across ALL milestones
  const allLogs = goal.milestones.flatMap((m) =>
    m.logs.map((l) => ({ iso: isoDayUTC(l.date) as ISODate, minutes: l.minutes })),
  )
  const byDay = sumMinutesByDay(allLogs)
  const firstDate = allLogs.length > 0 ? allLogs.reduce((min, l) => (l.iso < min ? l.iso : min), allLogs[0].iso) : null
  const renderWin = contributionWindow(firstDate, targetDate, today)
  const grid = renderWin ? buildGrid(renderWin, today) : { pad: 0, cells: [], labels: [] }
  const dayValues = grid.cells.map((c) => ({ iso: c.iso as ISODate, minutes: byDay.get(c.iso as ISODate) ?? 0, future: c.future }))
  const levels = levelsForValues(dayValues.map((d) => ({ iso: d.iso, value: d.minutes })))
  const streaks = journalStreaks(byDay, today)

  return {
    goal: {
      id: goal.id,
      title: goal.title,
      emoji: goal.emoji,
      color: goal.color,
      status: goal.status,
      targetDate,
    },
    today,
    hasLogs: allLogs.length > 0,
    milestones,
    window: renderWin,
    pad: grid.pad,
    labels: grid.labels,
    days: dayValues.map((d, i) => ({ iso: d.iso, minutes: d.minutes, level: levels[i], future: d.future })),
    stats: {
      totalMinutes: Array.from(byDay.values()).reduce((s, v) => s + v, 0),
      daysLogged: Array.from(byDay.values()).filter((v) => v > 0).length,
      todayMinutes: byDay.get(today) ?? 0,
      currentStreak: streaks.current,
      bestStreak: streaks.best,
    },
    rollups: { weeks: rollupWeeks(byDay, today), months: rollupMonths(byDay, today) },
  }
}

/**
 * Phase 12 — "💡 Key learnings this month" digest for the Journal tab:
 * every milestone log in the month that carries a key takeaway, newest first,
 * with goal context and per-month totals. `monthKey` is "YYYY-MM".
 */
export async function monthlyLearnings(userId: string, tz: string, monthKey: string): Promise<JournalLearningsDTO> {
  // strict month 01-12: JS Date normalizes month 13 into the next year, which
  // would silently turn a bad query into an empty-but-200 digest
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) throw new HttpError('Month must be YYYY-MM (01-12)', 422)
  const { start, endExclusive } = monthRange(monthKey)
  const rows = await db.milestoneLog.findMany({
    where: { userId, date: { gte: start, lt: endExclusive }, keyLearning: { not: null } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      date: true,
      minutes: true,
      did: true,
      learned: true,
      keyLearning: true,
      milestoneId: true,
      milestone: {
        select: {
          title: true,
          goal: { select: { id: true, title: true, emoji: true, color: true } },
        },
      },
    },
  })
  const items: LearningItemDTO[] = rows.map((r) => ({
    id: r.id,
    date: isoDayUTC(r.date),
    minutes: r.minutes,
    keyLearning: r.keyLearning as string, // filtered non-null above
    did: r.did,
    learned: r.learned,
    milestoneId: r.milestoneId,
    milestoneTitle: r.milestone.title,
    goalId: r.milestone.goal.id,
    goalTitle: r.milestone.goal.title,
    goalEmoji: r.milestone.goal.emoji,
    goalColor: r.milestone.goal.color,
  }))
  return {
    monthKey,
    items,
    stats: {
      count: items.length,
      totalMinutes: items.reduce((s, i) => s + i.minutes, 0),
      goalCount: new Set(items.map((i) => i.goalId)).size,
    },
  }
}

/** Today widget rows: active goals with journal milestones, none logged today. */
export async function milestoneLogsForToday(userId: string, tz: string, limit = 6) {
  const today = todayISO(tz)
  const goals = await db.goal.findMany({
    where: { userId, status: 'active' },
    include: {
      milestones: {
        orderBy: { order: 'asc' },
        include: { logs: { where: { date: toUTC(today) }, select: { minutes: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  const picks: { milestoneId: string; milestoneTitle: string; goalId: string; goalTitle: string; goalEmoji: string; goalColor: string; targetMinutes: number | null }[] = []
  for (const g of goals) {
    const candidates = g.milestones.filter((m) => m.doneAt == null && m.logs.length === 0)
    // nudge per GOAL, not per milestone: one entry today covers the goal —
    // the widget is a nudge, not a trophy case (goalContributionsForToday)
    if (candidates.length === 0 || g.milestones.some((m) => m.logs.length > 0)) continue
    const m = candidates[0]
    if (!m) continue
    picks.push({
      milestoneId: m.id,
      milestoneTitle: m.title,
      goalId: g.id,
      goalTitle: g.title,
      goalEmoji: g.emoji,
      goalColor: g.color,
      targetMinutes: m.targetMinutes,
    })
  }
  const chosen = picks.slice(0, limit)
  if (chosen.length === 0) return []
  // one aggregate for every suggested milestone's all-time total (no N+1)
  const totals = await db.milestoneLog.groupBy({
    by: ['milestoneId'],
    where: { userId, milestoneId: { in: chosen.map((p) => p.milestoneId) } },
    _sum: { minutes: true },
  })
  const totalByMilestone = new Map(totals.map((t) => [t.milestoneId, t._sum.minutes ?? 0]))
  return chosen.map((p) => ({ ...p, milestoneTotalMinutes: totalByMilestone.get(p.milestoneId) ?? 0 }))
}

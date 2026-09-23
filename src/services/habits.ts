// Habit service: CRUD + the daily check-in toggle. Every query is
// user-scoped (RLS-equivalent). Streak/stat math lives in lib/habits.ts
// (pure, unit-tested) — this layer only fetches and shapes.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import {
  buildingProgress,
  completionRate,
  currentStreak,
  heatmapDays,
  isScheduledOn,
  longestStreak,
  normalizeWeekdays,
} from '@/lib/habits'
import { rollupMonths, rollupWeeks, trailingWindow, levelForCheckIn } from '@/lib/effort-grid'
import { buildGrid } from '@/lib/goals-grid'
import { shiftISO, todayISO, toUTC } from '@/lib/date'
import type { HabitGridPayloadDTO, HabitWithStats } from '@/lib/types'

export interface HabitInput {
  name: string
  emoji?: string
  color?: string
  weekdays: string
  buildingDays?: number
  startDate: string
  reminderTime?: string | null
}

export interface HabitUpdateInput {
  name?: string
  emoji?: string
  color?: string
  weekdays?: string
  buildingDays?: number
  startDate?: string
  reminderTime?: string | null
  archived?: boolean
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
/** Trailing window for heatmaps — enough for the month calendar view. */
export const HEATMAP_DAYS = 35

function validateCore(input: { name: string; weekdays: string; buildingDays?: number; startDate: string; reminderTime?: string | null }) {
  if (!input.name.trim()) throw new HttpError('Habit name is required', 422)
  if (input.name.trim().length > 60) throw new HttpError('Habit name must be 60 characters or fewer', 422)
  try {
    normalizeWeekdays(input.weekdays)
  } catch {
    throw new HttpError('Weekdays must be a 7-char 0/1 schedule (Mon..Sun)', 422)
  }
  if (input.buildingDays != null && (!Number.isInteger(input.buildingDays) || input.buildingDays < 1 || input.buildingDays > 365)) {
    throw new HttpError('Building window must be 1–365 days', 422)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new HttpError('Start date must be YYYY-MM-DD', 422)
  if (input.reminderTime != null && input.reminderTime !== '' && !TIME_RE.test(input.reminderTime)) {
    throw new HttpError('Reminder time must be HH:MM', 422)
  }
}

function shapeStats(
  habit: {
    id: string
    name: string
    emoji: string
    color: string
    weekdays: string
    buildingDays: number
    startDate: Date
    reminderTime: string | null
    archived: boolean
    createdAt: Date
  },
  doneDates: string[],
  today: string,
): HabitWithStats {
  const done = new Set(doneDates)
  const startISO = habit.startDate.toISOString().slice(0, 10)
  const rateStart = shiftISO(today, -29)
  return {
    id: habit.id,
    name: habit.name,
    emoji: habit.emoji,
    color: habit.color,
    weekdays: habit.weekdays,
    buildingDays: habit.buildingDays,
    startDate: startISO,
    reminderTime: habit.reminderTime,
    archived: habit.archived,
    createdAt: habit.createdAt.toISOString(),
    scheduledToday: isScheduledOn(habit.weekdays, today),
    doneToday: done.has(today),
    streak: currentStreak(done, habit.weekdays, today),
    longest: longestStreak(doneDates, habit.weekdays),
    rate30: completionRate(done, habit.weekdays, rateStart > startISO ? rateStart : startISO, today, today),
    building: buildingProgress(startISO, habit.buildingDays, today),
    recent: heatmapDays(done, habit.weekdays, today, HEATMAP_DAYS),
  }
}

export async function createHabit(userId: string, input: HabitInput, tz: string): Promise<HabitWithStats> {
  validateCore(input)
  const row = await db.habit.create({
    data: {
      userId,
      name: input.name.trim(),
      emoji: input.emoji?.trim() || '✅',
      color: input.color || '#0D9488',
      weekdays: input.weekdays,
      buildingDays: input.buildingDays ?? 66,
      startDate: toUTC(input.startDate),
      reminderTime: input.reminderTime || null,
    },
  })
  return shapeStats(row, [], todayISO(tz))
}

export async function updateHabit(userId: string, id: string, input: HabitUpdateInput, tz: string): Promise<HabitWithStats> {
  const existing = await db.habit.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Habit not found', 404)
  const merged = {
    name: input.name ?? existing.name,
    weekdays: input.weekdays ?? existing.weekdays,
    buildingDays: input.buildingDays ?? existing.buildingDays,
    startDate: input.startDate ?? existing.startDate.toISOString().slice(0, 10),
    reminderTime: input.reminderTime !== undefined ? input.reminderTime : existing.reminderTime,
  }
  validateCore(merged)
  const row = await db.habit.update({
    where: { id },
    data: {
      name: merged.name.trim(),
      emoji: input.emoji?.trim() || existing.emoji,
      color: input.color || existing.color,
      weekdays: merged.weekdays,
      buildingDays: merged.buildingDays,
      startDate: input.startDate ? toUTC(input.startDate) : existing.startDate,
      reminderTime: merged.reminderTime || null,
      archived: input.archived ?? existing.archived,
    },
  })
  const doneDates = await db.habitEntry.findMany({
    where: { userId, habitId: id },
    select: { date: true },
  })
  return shapeStats(row, doneDates.map((e) => e.date.toISOString().slice(0, 10)), todayISO(tz))
}

export async function deleteHabit(userId: string, id: string): Promise<void> {
  const existing = await db.habit.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Habit not found', 404)
  await db.habit.delete({ where: { id } })
}

/**
 * Daily check-in toggle. The unique (habitId, date) constraint makes this
 * exactly-once per day: toggling on creates, toggling off deletes, and a
 * race between the two resolves to a DB-level conflict rather than a dup.
 */
export async function checkIn(
  userId: string,
  habitId: string,
  dateISO: string,
  tz: string,
): Promise<{ done: boolean; streak: number; longest: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new HttpError('date must be YYYY-MM-DD', 422)
  const habit = await db.habit.findFirst({ where: { id: habitId, userId } })
  if (!habit) throw new HttpError('Habit not found', 404)

  const date = toUTC(dateISO)
  const existing = await db.habitEntry.findUnique({
    where: { habitId_date: { habitId, date } },
  })

  if (existing) {
    await db.habitEntry.delete({ where: { id: existing.id } })
  } else {
    await db.habitEntry.create({ data: { userId, habitId, date } })
  }

  const doneDates = await db.habitEntry.findMany({
    where: { userId, habitId },
    select: { date: true },
  })
  const isoDates = doneDates.map((e) => e.date.toISOString().slice(0, 10))
  return {
    done: !existing,
    streak: currentStreak(new Set(isoDates), habit.weekdays, todayISO(tz)),
    longest: longestStreak(isoDates, habit.weekdays),
  }
}

export async function listHabits(userId: string, tz: string, opts?: { includeArchived?: boolean }): Promise<HabitWithStats[]> {
  const today = todayISO(tz)
  const [habits, allEntries] = await Promise.all([
    db.habit.findMany({
      where: { userId, ...(opts?.includeArchived ? {} : { archived: false }) },
      orderBy: { createdAt: 'asc' },
    }),
    db.habitEntry.findMany({
      where: { userId },
      select: { habitId: true, date: true },
      orderBy: { date: 'asc' },
    }),
  ])

  const byHabit = new Map<string, string[]>()
  for (const e of allEntries) {
    const list = byHabit.get(e.habitId) ?? []
    list.push(e.date.toISOString().slice(0, 10))
    byHabit.set(e.habitId, list)
  }

  return habits.map((h) => shapeStats(h, byHabit.get(h.id) ?? [], today))
}

/** Habits scheduled today, undone first — the Today checklist. */
export async function habitsForToday(userId: string, tz: string) {
  const all = await listHabits(userId, tz)
  return all.filter((h) => h.scheduledToday).sort((a, b) => Number(a.doneToday) - Number(b.doneToday))
}

/**
 * The full habit effort grid (Phase 10): GitHub-style check-in calendar over
 * the habit's own window (start → today, capped at the last 400 days),
 * plus full-history weekly/monthly roll-ups. Check-ins are binary, so a
 * done day renders L4 and everything else L0 — missed scheduled days read
 * as empty (honest), rest days never count as misses (grace rules).
 */
export async function habitGrid(userId: string, habitId: string, tz: string): Promise<HabitGridPayloadDTO> {
  const habit = await db.habit.findFirst({ where: { id: habitId, userId } })
  if (!habit) throw new HttpError('Habit not found', 404)
  const today = todayISO(tz)

  const entries = await db.habitEntry.findMany({
    where: { userId, habitId },
    select: { date: true },
    orderBy: { date: 'asc' },
  })
  // full-history day map for roll-ups (never window-capped, Decision #43)
  const byDay = new Map<string, number>()
  for (const e of entries) byDay.set(e.date.toISOString().slice(0, 10), 1)
  const doneSet = new Set(byDay.keys())

  const startISO = habit.startDate.toISOString().slice(0, 10)
  const window = trailingWindow(startISO, today)
  const grid = window ? buildGrid(window, today) : { pad: 0, cells: [], labels: [] }

  return {
    habit: {
      id: habit.id,
      name: habit.name,
      emoji: habit.emoji,
      color: habit.color,
      weekdays: habit.weekdays,
      buildingDays: habit.buildingDays,
      startDate: startISO,
      archived: habit.archived,
    },
    today,
    window,
    pad: grid.pad,
    labels: grid.labels,
    days: grid.cells.map((c) => {
      const done = byDay.has(c.iso)
      return {
        iso: c.iso,
        value: done ? 1 : 0,
        level: levelForCheckIn(done),
        future: c.future,
        scheduled: isScheduledOn(habit.weekdays, c.iso),
      }
    }),
    rollups: {
      weeks: rollupWeeks(byDay, today),
      months: rollupMonths(byDay, today),
    },
    stats: {
      scheduledToday: isScheduledOn(habit.weekdays, today),
      doneToday: doneSet.has(today),
      streak: currentStreak(doneSet, habit.weekdays, today),
      longest: longestStreak([...doneSet], habit.weekdays),
      rate30: completionRate(doneSet, habit.weekdays, shiftISO(today, -29) > startISO ? shiftISO(today, -29) : startISO, today, today),
      building: buildingProgress(startISO, habit.buildingDays, today),
    },
  }
}

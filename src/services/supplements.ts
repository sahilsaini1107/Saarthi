import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { todayISO, toUTC } from '@/lib/date'
import type { SupplementDTO, SupplementsPayload, SupplementTime } from '@/lib/types'

const TIMES: readonly SupplementTime[] = ['morning', 'afternoon', 'evening', 'bedtime', 'anytime']
const TIME_RANK = Object.fromEntries(TIMES.map((value, index) => [value, index])) as Record<SupplementTime, number>
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export interface SupplementInput {
  name?: string
  dose?: string | null
  timeOfDay?: SupplementTime
  weekdays?: number[]
  reminderTime?: string | null
  active?: boolean
  notes?: string | null
}

function normalizeWeekdays(days: number[] | undefined): number[] {
  const value = days ?? [0, 1, 2, 3, 4, 5, 6]
  const unique = [...new Set(value)].sort((a, b) => a - b)
  if (unique.length === 0 || unique.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new HttpError('Choose at least one valid weekday', 422)
  }
  return unique
}

function validate(input: SupplementInput, partial = false) {
  if (!partial || input.name !== undefined) {
    if (!input.name?.trim()) throw new HttpError('Supplement name is required', 422)
    if (input.name.trim().length > 100) throw new HttpError('Supplement name must be 100 characters or fewer', 422)
  }
  if (input.dose != null && input.dose.trim().length > 80) throw new HttpError('Dose must be 80 characters or fewer', 422)
  if (input.timeOfDay != null && !TIMES.includes(input.timeOfDay)) throw new HttpError('Unknown time of day', 422)
  if (input.weekdays !== undefined) normalizeWeekdays(input.weekdays)
  if (input.reminderTime && !TIME_RE.test(input.reminderTime)) throw new HttpError('Reminder must be HH:mm', 422)
  if (input.notes != null && input.notes.trim().length > 500) throw new HttpError('Notes must be 500 characters or fewer', 422)
}

function parseWeekdays(value: string): number[] {
  return value.split(',').map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
}

async function ownedSupplement(userId: string, id: string) {
  const supplement = await db.supplement.findFirst({ where: { id, userId } })
  if (!supplement) throw new HttpError('Supplement not found', 404)
  return supplement
}

export async function listSupplements(userId: string, timezone: string): Promise<SupplementsPayload> {
  const today = todayISO(timezone)
  const date = toUTC(today)
  const weekday = date.getUTCDay()
  const [supplements, logs] = await Promise.all([
    db.supplement.findMany({ where: { userId }, orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] }),
    db.supplementLog.findMany({ where: { userId, date }, select: { supplementId: true } }),
  ])
  const taken = new Set(logs.map((log) => log.supplementId))
  const shaped: SupplementDTO[] = supplements.map((item) => {
    const weekdays = parseWeekdays(item.weekdays)
    return {
      id: item.id,
      name: item.name,
      dose: item.dose,
      timeOfDay: item.timeOfDay as SupplementTime,
      weekdays,
      reminderTime: item.reminderTime,
      active: item.active,
      notes: item.notes,
      scheduledToday: item.active && weekdays.includes(weekday),
      takenToday: taken.has(item.id),
      createdAt: item.createdAt.toISOString(),
    }
  })
  shaped.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const slot = TIME_RANK[a.timeOfDay] - TIME_RANK[b.timeOfDay]
    return slot || a.name.localeCompare(b.name)
  })
  const scheduled = shaped.filter((item) => item.scheduledToday)
  return {
    today,
    supplements: shaped,
    scheduledCount: scheduled.length,
    takenCount: scheduled.filter((item) => item.takenToday).length,
  }
}

export async function createSupplement(userId: string, input: SupplementInput, timezone: string) {
  validate(input)
  await db.supplement.create({
    data: {
      userId,
      name: input.name!.trim(),
      dose: input.dose?.trim() || null,
      timeOfDay: input.timeOfDay ?? 'morning',
      weekdays: normalizeWeekdays(input.weekdays).join(','),
      reminderTime: input.reminderTime || null,
      active: input.active ?? true,
      notes: input.notes?.trim() || null,
    },
  })
  return listSupplements(userId, timezone)
}

export async function updateSupplement(userId: string, id: string, input: SupplementInput, timezone: string) {
  validate(input, true)
  const existing = await ownedSupplement(userId, id)
  await db.supplement.update({
    where: { id },
    data: {
      name: input.name !== undefined ? input.name.trim() : existing.name,
      dose: input.dose !== undefined ? input.dose?.trim() || null : existing.dose,
      timeOfDay: input.timeOfDay ?? existing.timeOfDay,
      weekdays: input.weekdays !== undefined ? normalizeWeekdays(input.weekdays).join(',') : existing.weekdays,
      reminderTime: input.reminderTime !== undefined ? input.reminderTime || null : existing.reminderTime,
      active: input.active ?? existing.active,
      notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
    },
  })
  return listSupplements(userId, timezone)
}

export async function checkInSupplement(userId: string, id: string, dateISO: string, isTaken: boolean, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new HttpError('date must be YYYY-MM-DD', 422)
  await ownedSupplement(userId, id)
  const date = toUTC(dateISO)
  if (isTaken) {
    await db.supplementLog.upsert({
      where: { supplementId_date: { supplementId: id, date } },
      create: { userId, supplementId: id, date },
      update: { takenAt: new Date() },
    })
  } else {
    await db.supplementLog.deleteMany({ where: { userId, supplementId: id, date } })
  }
  return listSupplements(userId, timezone)
}

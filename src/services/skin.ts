// Skin service: product shelf with PAO warnings + daily AM/PM check-ins.
// Every query is user-scoped. PAO + streak math lives in lib/skin.ts.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { shiftISO, todayISO, toUTC } from '@/lib/date'
import { paoStatus, skinStreak } from '@/lib/skin'
import { SKIN_PRODUCT_KINDS } from '@/lib/constants'
import type { SkinCheckInDTO, SkinPayload, SkinProductDTO } from '@/lib/types'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const PRODUCT_KINDS = SKIN_PRODUCT_KINDS as readonly string[]
const PRODUCT_STATUSES = ['active', 'finished', 'discarded']

export interface ProductInput {
  name?: string
  brand?: string | null
  kind?: string
  openedDate?: string | null
  paoMonths?: number | null
  status?: string
  notes?: string | null
}

function validateProduct(input: ProductInput) {
  if (!input.name?.trim()) throw new HttpError('Product name is required', 422)
  if (input.name.trim().length > 120) throw new HttpError('Product name must be 120 characters or fewer', 422)
  if (!PRODUCT_KINDS.includes(input.kind ?? '')) throw new HttpError('Unknown product type', 422)
  if (input.openedDate != null && input.openedDate !== '' && !ISO_RE.test(input.openedDate)) {
    throw new HttpError('Opened date must be YYYY-MM-DD', 422)
  }
  if (
    input.paoMonths != null &&
    input.paoMonths !== 0 &&
    (!Number.isInteger(input.paoMonths) || input.paoMonths < 1 || input.paoMonths > 120)
  ) {
    throw new HttpError('PAO must be 1–120 months', 422)
  }
  if (input.status != null && !PRODUCT_STATUSES.includes(input.status)) {
    throw new HttpError('Product status must be active, finished or discarded', 422)
  }
}

function shapeProduct(
  p: {
    id: string
    name: string
    brand: string | null
    kind: string
    openedDate: Date | null
    paoMonths: number | null
    status: string
    notes: string | null
    createdAt: Date
  },
  today: string,
): SkinProductDTO {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    kind: p.kind,
    openedDate: p.openedDate ? p.openedDate.toISOString().slice(0, 10) : null,
    paoMonths: p.paoMonths,
    status: p.status,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
    pao: paoStatus(
      p.openedDate ? p.openedDate.toISOString().slice(0, 10) : null,
      p.paoMonths,
      today,
    ),
  }
}

/**
 * Shelf + today's check-ins + streak. Expiring/expired actives surface first,
 * then the rest alphabetically; finished/discarded stay out of the way.
 */
export async function listSkin(userId: string, tz: string): Promise<SkinPayload> {
  const today = todayISO(tz)
  const since = shiftISO(today, -34)

  const [products, checkIns] = await Promise.all([
    db.skinProduct.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    db.skinCheckIn.findMany({
      where: { userId, date: { gte: toUTC(since), lte: toUTC(today) } },
      orderBy: { date: 'asc' },
    }),
  ])

  const shaped = products.map((p) => shapeProduct(p, today))
  shaped.sort((a, b) => {
    if (a.status !== b.status) {
      const rank = (s: string) => (s === 'active' ? 0 : 1)
      return rank(a.status) - rank(b.status)
    }
    if (a.status === 'active') {
      // expiring products first (expired first), no-PAO last
      const urgency = (l: string) => (l === 'expired' ? 0 : l === 'soon' ? 1 : l === 'expiring' ? 2 : 3)
      if (urgency(a.pao.level) !== urgency(b.pao.level)) return urgency(a.pao.level) - urgency(b.pao.level)
    }
    return a.createdAt.localeCompare(b.createdAt)
  })

  const byDate = new Map<string, SkinCheckInDTO>()
  for (const c of checkIns) {
    byDate.set(c.date.toISOString().slice(0, 10), { date: c.date.toISOString().slice(0, 10), amDone: c.amDone, pmDone: c.pmDone })
  }
  const todayRow = byDate.get(today) ?? { date: today, amDone: false, pmDone: false }

  // streak over the full history of days where AM or PM was done
  const anyDone = await db.skinCheckIn.findMany({
    where: { userId, OR: [{ amDone: true }, { pmDone: true }] },
    select: { date: true },
  })
  const doneSet = new Set(anyDone.map((c) => c.date.toISOString().slice(0, 10)))

  const recent: { iso: string; done: boolean | null }[] = []
  for (let i = 34; i >= 0; i--) {
    const iso = shiftISO(today, -i)
    const row = byDate.get(iso)
    recent.push({ iso, done: row ? row.amDone || row.pmDone : null })
  }

  return { products: shaped, today: todayRow, streak: skinStreak(doneSet, today), recent }
}

export async function addProduct(userId: string, input: ProductInput, tz: string): Promise<SkinPayload> {
  validateProduct(input)
  await db.skinProduct.create({
    data: {
      userId,
      name: (input.name ?? '').trim(),
      brand: input.brand?.trim() || null,
      kind: input.kind ?? 'other',
      openedDate: input.openedDate ? toUTC(input.openedDate) : null,
      paoMonths: input.paoMonths ?? null,
      status: input.status ?? 'active',
      notes: input.notes?.trim() || null,
    },
  })
  return listSkin(userId, tz)
}

async function ownedProduct(userId: string, productId: string) {
  const p = await db.skinProduct.findFirst({ where: { id: productId, userId } })
  if (!p) throw new HttpError('Product not found', 404)
  return p
}

export async function updateProduct(userId: string, productId: string, input: ProductInput, tz: string): Promise<SkinPayload> {
  const existing = await ownedProduct(userId, productId)
  validateProduct({
    name: input.name ?? existing.name,
    kind: input.kind ?? existing.kind,
    openedDate: input.openedDate !== undefined ? input.openedDate : existing.openedDate?.toISOString().slice(0, 10) ?? null,
    paoMonths: input.paoMonths !== undefined ? input.paoMonths : existing.paoMonths,
    status: input.status ?? existing.status,
  })
  await db.skinProduct.update({
    where: { id: productId },
    data: {
      name: input.name !== undefined ? input.name.trim() : existing.name,
      brand: input.brand !== undefined ? input.brand?.trim() || null : existing.brand,
      kind: input.kind ?? existing.kind,
      openedDate:
        input.openedDate !== undefined ? (input.openedDate ? toUTC(input.openedDate) : null) : existing.openedDate,
      paoMonths: input.paoMonths !== undefined ? input.paoMonths : existing.paoMonths,
      status: input.status ?? existing.status,
      notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
    },
  })
  return listSkin(userId, tz)
}

export async function deleteProduct(userId: string, productId: string, tz: string): Promise<SkinPayload> {
  await ownedProduct(userId, productId)
  await db.skinProduct.delete({ where: { id: productId } })
  return listSkin(userId, tz)
}

export interface CheckInInput {
  date: string
  slot: 'am' | 'pm'
  done: boolean
}

/**
 * AM/PM toggle — one row per day (DB-unique), upserted on each toggle.
 * Toggling AM on then off leaves the row with both flags false, which is
 * indistinguishable from "no check-in yet" for streak purposes.
 */
export async function skinCheckIn(userId: string, input: CheckInInput, tz: string): Promise<SkinPayload> {
  if (!ISO_RE.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  const existing = await db.skinCheckIn.findUnique({
    where: { userId_date: { userId, date: toUTC(input.date) } },
  })
  const data =
    input.slot === 'am'
      ? { amDone: input.done }
      : { pmDone: input.done }
  if (existing) {
    await db.skinCheckIn.update({ where: { id: existing.id }, data })
  } else {
    await db.skinCheckIn.create({ data: { userId, date: toUTC(input.date), ...data } })
  }
  return listSkin(userId, tz)
}

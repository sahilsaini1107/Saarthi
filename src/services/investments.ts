// Investments service (Phase 1.5): any market instrument — stocks, bonds,
// crypto, mutual funds, ETFs, gold, REITs, PPF/NPS, other. Holdings are
// derived from the txn ledger with weighted-average cost (Decision #12).
// Quantities are floats; all cash amounts are integer paise (BigInt rows).

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import {
  INVESTMENT_TXN_KINDS,
  INVESTMENT_TYPES,
  InvestmentTxnKind,
  InvestmentType,
  computeHolding,
  marketValuePaise,
  roundQuantity,
} from '@/lib/investments'
import { buildPriceSeries, PricePoint, priceChange } from '@/lib/portfolio'
import { isoDayUTC, toUTC, todayISO } from '@/lib/date'
import { InvestmentDTO, InvestmentTxnDTO, JobKey } from '@/lib/types'
import { parseCreditRating, parseCouponFrequency, parseJob } from '@/services/planner'

export interface InvestmentWithMeta extends InvestmentDTO {
  quantity: number
  avgCostPaise: number
  investedPaise: number
  marketValuePaise: number
  unrealizedPaise: number
  unrealizedPct: number | null
  realizedPnlPaise: number
  incomePaise: number
  recentTxns: InvestmentTxnDTO[]
  /** ascending dated unit-price points (≤30 days) — auto-captured on every price change */
  priceHistory: PricePoint[]
  /** latest vs previous recorded price (null until a second point exists) */
  priceDeltaPaise: number | null
  priceDeltaPct: number | null
}

function txnToDTO(t: {
  id: string
  investmentId: string
  kind: string
  quantity: number
  amountPaise: bigint
  date: Date
  note: string | null
  createdAt: Date
}): InvestmentTxnDTO {
  return {
    id: t.id,
    investmentId: t.investmentId,
    kind: t.kind as InvestmentTxnKind,
    quantity: t.quantity,
    amountPaise: Number(t.amountPaise),
    date: isoDayUTC(t.date),
    note: t.note,
    createdAt: t.createdAt.toISOString(),
  }
}

function rowToDTO(row: {
  id: string
  name: string
  type: string
  symbol: string | null
  platform: string | null
  job: string | null
  ratePct: number | null
  creditRating: string | null
  maturityDate: Date | null
  couponFrequency: string | null
  currentPricePaise: bigint
  priceUpdatedAt: Date
  notes: string | null
  createdAt: Date
}): InvestmentDTO {
  return {
    id: row.id,
    name: row.name,
    type: row.type as InvestmentType,
    symbol: row.symbol,
    platform: row.platform,
    job: (row.job as JobKey | null) ?? null,
    ratePct: row.ratePct,
    creditRating: (row.creditRating as InvestmentDTO['creditRating']) ?? null,
    maturityDate: row.maturityDate ? isoDayUTC(row.maturityDate) : null,
    couponFrequency: (row.couponFrequency as InvestmentDTO['couponFrequency']) ?? null,
    currentPricePaise: Number(row.currentPricePaise),
    priceUpdatedAt: row.priceUpdatedAt.toISOString(),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function createInvestment(
  userId: string,
  input: {
    name: string
    type: InvestmentType
    symbol?: string | null
    platform?: string | null
    job?: JobKey | null
    ratePct?: number | null
    creditRating?: string | null
    maturityDate?: string | null
    couponFrequency?: string | null
    currentPricePaise: number
    notes?: string | null
    openingBuy?: { quantity: number; amountPaise: number; date: string }
  },
  tz: string,
): Promise<InvestmentDTO> {
  const name = input.name.trim()
  if (!name) throw new HttpError('Name is required', 422)
  if (!INVESTMENT_TYPES.includes(input.type)) throw new HttpError('Unknown investment type', 422)
  if (!Number.isInteger(input.currentPricePaise) || input.currentPricePaise <= 0) {
    throw new HttpError('Current price must be positive', 422)
  }
  if (input.ratePct != null && (!(input.ratePct > 0) || input.ratePct > 100)) {
    throw new HttpError('Rate must be between 0 and 100', 422)
  }
  if (input.maturityDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(input.maturityDate)) {
    throw new HttpError('Maturity date must be YYYY-MM-DD', 422)
  }

  const row = await db.investment.create({
    data: {
      userId,
      name,
      type: input.type,
      symbol: input.symbol?.trim() || null,
      platform: input.platform?.trim() || null,
      job: parseJob(input.job),
      ratePct: input.ratePct ?? null,
      creditRating: parseCreditRating(input.creditRating),
      maturityDate: input.maturityDate ? toUTC(input.maturityDate) : null,
      couponFrequency: parseCouponFrequency(input.couponFrequency),
      currentPricePaise: BigInt(input.currentPricePaise),
      notes: input.notes?.trim() || null,
    },
  })

  await recordPricePoint(userId, row.id, input.currentPricePaise, tz)

  if (input.openingBuy) {
    await recordTxn(userId, row.id, {
      kind: 'buy',
      quantity: input.openingBuy.quantity,
      amountPaise: input.openingBuy.amountPaise,
      date: input.openingBuy.date,
    })
  }

  return rowToDTO(row)
}

export async function listInvestments(userId: string): Promise<InvestmentWithMeta[]> {
  const rows = await db.investment.findMany({
    where: { userId },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
    include: {
      txns: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
      pricePoints: { orderBy: { date: 'asc' }, select: { date: true, pricePaise: true } },
    },
  })
  return rows.map((row) => {
    const txns = row.txns.map(txnToDTO)
    const holding = computeHolding(txns.map((t) => ({ kind: t.kind, quantity: t.quantity, amountPaise: t.amountPaise })))
    const price = Number(row.currentPricePaise)
    const value = marketValuePaise(holding.quantity, price)
    const unreal = value - holding.investedPaise
    const priceHistory = buildPriceSeries(
      row.pricePoints.map((p) => ({ iso: isoDayUTC(p.date), pricePaise: Number(p.pricePaise) })),
      30,
    )
    const { deltaPaise: priceDeltaPaise, deltaPct: priceDeltaPct } = priceChange(priceHistory)
    return {
      ...rowToDTO(row),
      quantity: roundQuantity(holding.quantity),
      avgCostPaise: holding.avgCostPaise,
      investedPaise: Math.round(holding.investedPaise),
      marketValuePaise: value,
      unrealizedPaise: unreal,
      unrealizedPct: holding.investedPaise > 0 ? Math.round((unreal / holding.investedPaise) * 100) : null,
      realizedPnlPaise: Math.round(holding.realizedPnlPaise),
      incomePaise: holding.incomePaise,
      recentTxns: txns.slice(-5).reverse(),
      priceHistory,
      priceDeltaPaise,
      priceDeltaPct,
    }
  })
}

export async function updateInvestment(
  userId: string,
  id: string,
  input: Partial<{
    name: string
    type: InvestmentType
    symbol: string | null
    platform: string | null
    job: JobKey | null
    ratePct: number | null
    creditRating: string | null
    maturityDate: string | null
    couponFrequency: string | null
    currentPricePaise: number
    notes: string | null
  }>,
  tz: string,
): Promise<InvestmentDTO> {
  const existing = await db.investment.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Investment not found', 404)
  if (input.type !== undefined && !INVESTMENT_TYPES.includes(input.type)) throw new HttpError('Unknown investment type', 422)
  if (
    input.currentPricePaise !== undefined &&
    (!Number.isInteger(input.currentPricePaise) || input.currentPricePaise <= 0)
  ) {
    throw new HttpError('Current price must be positive', 422)
  }
  if (input.ratePct !== undefined && input.ratePct !== null && (!(input.ratePct > 0) || input.ratePct > 100)) {
    throw new HttpError('Rate must be between 0 and 100', 422)
  }
  if (input.maturityDate !== undefined && input.maturityDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.maturityDate)) {
    throw new HttpError('Maturity date must be YYYY-MM-DD', 422)
  }

  const priceChanged = input.currentPricePaise !== undefined && input.currentPricePaise !== Number(existing.currentPricePaise)
  const row = await db.investment.update({
    where: { id },
    data: {
      name: input.name?.trim() || existing.name,
      type: input.type ?? existing.type,
      symbol: input.symbol === undefined ? existing.symbol : input.symbol?.trim() || null,
      platform: input.platform === undefined ? existing.platform : input.platform?.trim() || null,
      job: input.job === undefined ? existing.job : parseJob(input.job),
      ratePct: input.ratePct === undefined ? existing.ratePct : input.ratePct,
      creditRating: input.creditRating === undefined ? existing.creditRating : parseCreditRating(input.creditRating),
      maturityDate:
        input.maturityDate === undefined
          ? existing.maturityDate
          : input.maturityDate === null
            ? null
            : toUTC(input.maturityDate),
      couponFrequency:
        input.couponFrequency === undefined ? existing.couponFrequency : parseCouponFrequency(input.couponFrequency),
      currentPricePaise: input.currentPricePaise !== undefined ? BigInt(input.currentPricePaise) : existing.currentPricePaise,
      priceUpdatedAt: priceChanged ? new Date() : existing.priceUpdatedAt,
      notes: input.notes === undefined ? existing.notes : input.notes?.trim() || null,
    },
  })

  // every price change becomes a dated point → sparkline history is free
  if (priceChanged) await recordPricePoint(userId, id, input.currentPricePaise!, tz)

  return rowToDTO(row)
}

export async function deleteInvestment(userId: string, id: string): Promise<void> {
  const existing = await db.investment.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Investment not found', 404)
  await db.investment.delete({ where: { id } }) // txns + price points cascade
}

/** Upsert today's dated price point (one per day — same-day re-entry wins). */
async function recordPricePoint(userId: string, investmentId: string, pricePaise: number, tz: string): Promise<void> {
  const date = toUTC(todayISO(tz))
  await db.investmentPricePoint.upsert({
    where: { investmentId_date: { investmentId, date } },
    create: { userId, investmentId, date, pricePaise: BigInt(pricePaise) },
    update: { pricePaise: BigInt(pricePaise) },
  })
}

/** Record a buy/sell/dividend/interest. Sells validate against held quantity. */
export async function recordTxn(
  userId: string,
  investmentId: string,
  input: { kind: InvestmentTxnKind; quantity: number; amountPaise: number; date: string; note?: string },
): Promise<InvestmentTxnDTO> {
  const investment = await db.investment.findFirst({ where: { id: investmentId, userId } })
  if (!investment) throw new HttpError('Investment not found', 404)
  if (!INVESTMENT_TXN_KINDS.includes(input.kind)) throw new HttpError('Unknown transaction kind', 422)
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) throw new HttpError('Amount must be positive', 422)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new HttpError('Date must be YYYY-MM-DD', 422)

  const isQtyKind = input.kind === 'buy' || input.kind === 'sell'
  const quantity = isQtyKind ? input.quantity : 0
  if (isQtyKind && !(quantity > 0)) throw new HttpError('Quantity must be positive', 422)
  if ((input.kind === 'dividend' || input.kind === 'interest') && quantity !== 0) {
    throw new HttpError('Dividend/interest records take no quantity', 422)
  }

  if (input.kind === 'sell') {
    const prior = await db.investmentTxn.findMany({
      where: { investmentId, userId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    })
    const held = computeHolding(prior.map((t) => ({ kind: t.kind as InvestmentTxnKind, quantity: t.quantity, amountPaise: Number(t.amountPaise) })))
    if (input.quantity > held.quantity + 1e-8) {
      throw new HttpError(`Cannot sell ${roundQuantity(input.quantity)} — you hold ${roundQuantity(held.quantity)}`, 422)
    }
  }

  const row = await db.investmentTxn.create({
    data: {
      userId,
      investmentId,
      kind: input.kind,
      quantity,
      amountPaise: BigInt(input.amountPaise),
      date: toUTC(input.date),
      note: input.note?.trim() || null,
    },
  })
  return txnToDTO(row)
}

export async function deleteTxn(userId: string, txnId: string): Promise<void> {
  const existing = await db.investmentTxn.findFirst({ where: { id: txnId, userId } })
  if (!existing) throw new HttpError('Transaction not found', 404)
  await db.investmentTxn.delete({ where: { id: txnId } })
}

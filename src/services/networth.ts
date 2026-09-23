// Net-worth snapshots & trend (Phase 4).
// Strategy: LAZY DAILY SNAPSHOTS. Every time the app computes the Today
// snapshot or asks for the trend, today's row is upserted — history
// accumulates with zero user effort. Reconstructing point-in-time net worth
// from ledgers (balances, holdings, asset revaluations) was rejected as
// error-prone and unverifiable (Decision #24, PROGRESS.md).
// Days before the first snapshot are never invented (lib/portfolio.ts).

import { db } from '@/lib/db'
import { isoDayUTC, shiftISO, toUTC, todayISO } from '@/lib/date'
import { accountSummary } from '@/services/accounts'
import { rdInstallmentsPaid, rdValueNowPaise } from '@/lib/rd'
import { computeHolding, marketValuePaise } from '@/lib/investments'
import { netWorthTrendSeries, TrendPoint, trendDelta } from '@/lib/portfolio'

/** The ONE definition of net worth — Today's live numbers and the stored
 *  snapshots both flow through this, so they can never drift apart. */
export interface NetWorthParts {
  liquidPaise: number
  cardOutstandingPaise: number
  /** FD principal + RD value-now */
  depositsPaise: number
  fdsActivePaise: number
  rdsActivePaise: number
  investmentsValuePaise: number
  assetsValuePaise: number
  /** what is owed — credit-card outstanding */
  liabilitiesPaise: number
  totalPaise: number
}

/** Minimal row shapes the reducer reads (works for full rows and selects). */
export interface NetWorthInputs {
  accounts: { liquidPaise: number; cardOutstandingPaise: number }
  fds: { principalPaise: number }[]
  rds: { installmentPaise: bigint | number; tenureMonths: number; startDate: Date }[]
  investments: { currentPricePaise: bigint | number; txns: { kind: string; quantity: number; amountPaise: bigint | number }[] }[]
  assets: { currentValuePaise: bigint | number }[]
  /** today as a UTC-midnight date (user's calendar day) */
  todayDate: Date
}

export function reduceNetWorthParts(inputs: NetWorthInputs): NetWorthParts {
  const { accounts, fds, rds, investments, assets, todayDate } = inputs
  const liquidPaise = accounts.liquidPaise
  const cardOutstandingPaise = accounts.cardOutstandingPaise
  const fdsActivePaise = fds.reduce((s, f) => s + f.principalPaise, 0)
  const rdsActivePaise = rds.reduce(
    (s, r) => s + rdValueNowPaise(Number(r.installmentPaise), rdInstallmentsPaid(isoDayUTC(r.startDate), r.tenureMonths, todayDate)),
    0,
  )
  const investmentsValuePaise = investments.reduce((sum, inv) => {
    const holding = computeHolding(inv.txns.map((t) => ({ kind: t.kind as 'buy', quantity: t.quantity, amountPaise: Number(t.amountPaise) })))
    return sum + marketValuePaise(holding.quantity, Number(inv.currentPricePaise))
  }, 0)
  const assetsValuePaise = assets.reduce((s, a) => s + Number(a.currentValuePaise), 0)
  const depositsPaise = fdsActivePaise + rdsActivePaise

  return {
    liquidPaise,
    cardOutstandingPaise,
    depositsPaise,
    fdsActivePaise,
    rdsActivePaise,
    investmentsValuePaise,
    assetsValuePaise,
    liabilitiesPaise: cardOutstandingPaise,
    totalPaise: liquidPaise + depositsPaise + investmentsValuePaise + assetsValuePaise - cardOutstandingPaise,
  }
}

export async function computeNetWorthParts(userId: string, tz: string): Promise<NetWorthParts> {
  const todayDate = toUTC(todayISO(tz))
  const [accounts, fds, rds, investments, assets] = await Promise.all([
    accountSummary(userId),
    db.fixedDeposit.findMany({ where: { userId, status: 'active' }, select: { principalPaise: true } }),
    db.recurringDeposit.findMany({
      where: { userId, status: 'active' },
      select: { installmentPaise: true, tenureMonths: true, startDate: true },
    }),
    db.investment.findMany({
      where: { userId },
      select: { currentPricePaise: true, txns: { select: { kind: true, quantity: true, amountPaise: true } } },
    }),
    db.asset.findMany({ where: { userId }, select: { currentValuePaise: true } }),
  ])
  return reduceNetWorthParts({ accounts, fds, rds, investments, assets, todayDate })
}

/** Upsert today's snapshot row (unique per user+day — same-day recompute wins). */
export async function storeSnapshot(userId: string, tz: string, parts: NetWorthParts): Promise<void> {
  const date = toUTC(todayISO(tz))
  const data = {
    liquidPaise: BigInt(Math.max(0, parts.liquidPaise)),
    depositsPaise: BigInt(Math.max(0, parts.depositsPaise)),
    investmentsPaise: BigInt(Math.max(0, parts.investmentsValuePaise)),
    assetsPaise: BigInt(Math.max(0, parts.assetsValuePaise)),
    liabilitiesPaise: BigInt(Math.max(0, parts.liabilitiesPaise)),
    totalPaise: BigInt(parts.totalPaise),
  }
  await db.netWorthSnapshot.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...data },
    update: data,
  })
}

/** Absolute + pct change of today's parts vs the most recent snapshot BEFORE today. */
export async function deltaVsPreviousSnapshot(
  userId: string,
  tz: string,
  parts: NetWorthParts,
): Promise<{ deltaPaise: number | null; deltaPct: number | null }> {
  const today = toUTC(todayISO(tz))
  const prev = await db.netWorthSnapshot.findFirst({
    where: { userId, date: { lt: today } },
    orderBy: { date: 'desc' },
  })
  if (!prev) return { deltaPaise: null, deltaPct: null }
  const prevTotal = Number(prev.totalPaise)
  const deltaPaise = parts.totalPaise - prevTotal
  return { deltaPaise, deltaPct: prevTotal > 0 ? Math.round((deltaPaise / prevTotal) * 10000) / 100 : null }
}

export interface NetWorthTrendPayload {
  today: string
  /** continuous per-day series, ascending; carried days are flagged */
  series: TrendPoint[]
  /** latest snapshot vs the previous stored snapshot (any gap) */
  deltaPaise: number | null
  deltaPct: number | null
  /** latest value vs ~N days ago in the filled series (null when history is shorter) */
  delta7dPaise: number | null
  delta30dPaise: number | null
}

export async function netWorthTrend(userId: string, tz: string, days = 90): Promise<NetWorthTrendPayload> {
  const today = todayISO(tz)
  const parts = await computeNetWorthParts(userId, tz)
  await storeSnapshot(userId, tz, parts)

  const windowStart = toUTC(shiftISO(today, -(Math.max(7, days) - 1)))
  const rows = await db.netWorthSnapshot.findMany({
    where: { userId, date: { gte: windowStart } },
    orderBy: { date: 'asc' },
    select: { date: true, totalPaise: true, liquidPaise: true, depositsPaise: true, investmentsPaise: true, assetsPaise: true, liabilitiesPaise: true },
  })
  const snapshots = rows.map((r) => ({
    iso: isoDayUTC(r.date),
    totalPaise: Number(r.totalPaise),
    liquidPaise: Number(r.liquidPaise),
    depositsPaise: Number(r.depositsPaise),
    investmentsPaise: Number(r.investmentsPaise),
    assetsPaise: Number(r.assetsPaise),
    liabilitiesPaise: Number(r.liabilitiesPaise),
  }))

  const series = netWorthTrendSeries(snapshots, today, days)
  const { deltaPaise, deltaPct } = trendDelta(snapshots)

  return {
    today,
    series,
    deltaPaise,
    deltaPct,
    delta7dPaise: backDelta(series, 7),
    delta30dPaise: backDelta(series, 30),
  }
}

/** latest value minus the value `back` days earlier in a contiguous daily series. */
function backDelta(series: TrendPoint[], back: number): number | null {
  if (series.length < back + 1) return null
  return series[series.length - 1].totalPaise - series[series.length - 1 - back].totalPaise
}

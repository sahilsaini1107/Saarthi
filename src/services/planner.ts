// Portfolio planner service (Phase 8): the user-scoped read model behind
// #/money/planner plus the target-plan CRUD. Every rupee is assigned a job —
// stored `job` when the user tagged it, framework suggestion otherwise
// (Decision #39, PROGRESS.md). Income machine + DICGC exposure roll up here.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import {
  CREDIT_RATINGS,
  COUPON_FREQUENCIES,
  JOB_KEYS,
  buildJobPlan,
  dicgcExposure,
  incomeMachine,
  planHealth,
  suggestJobForAccount,
  suggestJobForAsset,
  suggestJobForDeposit,
  suggestJobForInvestment,
  type CouponFrequency,
  type JobKey,
  type PlannerHolding,
  type PlanHealth,
  type IncomeMachine,
  type JobPlanRow,
  type DepositExposureRow,
  type BondIncomeInput,
} from '@/lib/planner'
import { computeHolding, marketValuePaise } from '@/lib/investments'
import { isoDayUTC, todayISO } from '@/lib/date'
import { rdInstallmentsPaid, rdValueNowPaise } from '@/lib/rd'
import { rollupGoalsByJob, type GoalLinkInput } from '@/lib/planner-goals'
import { ASSET_CATEGORY_LABELS, type AssetCategoryKey } from '@/lib/constants'
import { INVESTMENT_TYPE_LABELS, type InvestmentType } from '@/lib/investments'
import type { CreditRating, GoalsFundingDTO, PlannerGoalLinkDTO } from '@/lib/types'

/* ---------------- validation helpers (shared by wealth services) ------- */

export function parseJob(job: unknown): JobKey | null {
  if (job === undefined || job === null) return null
  if (!(JOB_KEYS as readonly string[]).includes(job as string)) throw new HttpError('Unknown portfolio job', 422)
  return job as JobKey
}

export function parseCreditRating(rating: unknown): CreditRating | null {
  if (rating === undefined || rating === null) return null
  if (!(CREDIT_RATINGS as readonly string[]).includes(rating as string)) throw new HttpError('Unknown credit rating', 422)
  return rating as CreditRating
}

export function parseCouponFrequency(freq: unknown): CouponFrequency | null {
  if (freq === undefined || freq === null) return null
  if (!(COUPON_FREQUENCIES as readonly string[]).includes(freq as string)) throw new HttpError('Unknown coupon frequency', 422)
  return freq as CouponFrequency
}

/* ---------------- overview ------------------------------------------- */

export interface PlannerOverview {
  today: string
  monthKey: string
  health: PlanHealth
  hasTargets: boolean
  totalPaise: number
  unassignedCount: number
  unassignedValuePaise: number
  /** job rows enriched with the money goals each sleeve funds (Phase 10) */
  jobs: (JobPlanRow & { goals: PlannerGoalLinkDTO[] })[]
  /** planner ↔ goals link: per-job goal rollups + linking backlog */
  goalsFunding: GoalsFundingDTO
  income: IncomeMachine
  dicgc: { rows: DepositExposureRow[]; overLimitCount: number }
}

export async function getPlannerOverview(userId: string, tz: string): Promise<PlannerOverview> {
  const today = todayISO(tz)
  const todayDate = new Date(`${today}T00:00:00.000Z`)
  const twelveMonthsAgoISO = new Date(`${today}T00:00:00.000Z`).getTime() - 365 * 86_400_000
  const twelveMonthsAgo = new Date(twelveMonthsAgoISO)

  const [accounts, fds, rds, investments, assets, targets, incomeTxns, moneyGoals, contributionSums] = await Promise.all([
    db.account.findMany({
      where: { userId, archived: false, type: { not: 'credit_card' } },
      orderBy: { createdAt: 'asc' },
    }),
    db.fixedDeposit.findMany({ where: { userId, status: 'active' }, orderBy: { maturityDate: 'asc' } }),
    db.recurringDeposit.findMany({ where: { userId, status: 'active' }, orderBy: { maturityDate: 'asc' } }),
    db.investment.findMany({
      where: { userId },
      include: { txns: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    }),
    db.asset.findMany({ where: { userId }, orderBy: { currentValuePaise: 'desc' } }),
    db.portfolioTarget.findMany({ where: { userId } }),
    db.investmentTxn.findMany({
      where: { userId, kind: { in: ['dividend', 'interest'] }, date: { gte: twelveMonthsAgo } },
      select: { amountPaise: true },
    }),
    // planner ↔ goals link (Phase 10): every money goal + its all-time
    // contribution total (rollup filters to active + job-tagged)
    db.goal.findMany({ where: { userId, metric: 'money' }, orderBy: [{ targetDate: 'asc' }, { createdAt: 'asc' }] }),
    db.goalContribution.groupBy({
      by: ['goalId'],
      where: { userId },
      _sum: { amountMilli: true },
    }),
  ])
  const contributedByGoal = new Map(contributionSums.map((s) => [s.goalId, Number(s._sum.amountMilli ?? 0)]))
  const goalLinks: GoalLinkInput[] = moneyGoals.map((g) => ({
    id: g.id,
    title: g.title,
    emoji: g.emoji,
    color: g.color,
    job: (g.job ?? null) as GoalLinkInput['job'],
    status: g.status,
    targetValueMilli: g.targetValueMilli != null ? Number(g.targetValueMilli) : null,
    contributedMilli: contributedByGoal.get(g.id) ?? 0,
    targetDate: g.targetDate ? isoDayUTC(g.targetDate) : null,
  }))
  const goalsFunding = rollupGoalsByJob(goalLinks)

  const holdings: PlannerHolding[] = []

  for (const a of accounts) {
    holdings.push({
      kind: 'account',
      id: a.id,
      name: a.name,
      valuePaise: a.balancePaise,
      job: (a.job as JobKey | null) ?? null,
      suggestedJob: suggestJobForAccount(a.type),
      detail: a.type === 'savings' ? 'Savings' : 'Cash',
    })
  }

  const rdValues: { bank: string; paise: number }[] = []
  for (const f of fds) {
    holdings.push({
      kind: 'fd',
      id: f.id,
      name: f.bank,
      valuePaise: f.principalPaise,
      job: (f.job as JobKey | null) ?? null,
      suggestedJob: suggestJobForDeposit(),
      detail: `FD · ${f.ratePct}%`,
    })
  }
  for (const r of rds) {
    const paid = rdInstallmentsPaid(isoDayUTC(r.startDate), r.tenureMonths, todayDate)
    const valueNow = rdValueNowPaise(Number(r.installmentPaise), paid)
    rdValues.push({ bank: r.bank, paise: valueNow })
    holdings.push({
      kind: 'rd',
      id: r.id,
      name: r.bank,
      valuePaise: valueNow,
      job: (r.job as JobKey | null) ?? null,
      suggestedJob: suggestJobForDeposit(),
      detail: `RD · ${r.ratePct}%`,
    })
  }

  let investmentsValuePaise = 0
  const bonds: BondIncomeInput[] = []
  for (const inv of investments) {
    const holding = computeHolding(
      inv.txns.map((t) => ({ kind: t.kind as 'buy' | 'sell' | 'dividend' | 'interest', quantity: t.quantity, amountPaise: Number(t.amountPaise) })),
    )
    const value = marketValuePaise(holding.quantity, Number(inv.currentPricePaise))
    investmentsValuePaise += value
    if (inv.type === 'bond' && (inv.ratePct ?? 0) > 0 && value > 0) {
      bonds.push({
        name: inv.name,
        marketValuePaise: value,
        ratePct: inv.ratePct!,
        couponFrequency: (inv.couponFrequency as CouponFrequency | null) ?? null,
        maturityISO: inv.maturityDate ? isoDayUTC(inv.maturityDate) : null,
      })
    }
    const typeLabel = INVESTMENT_TYPE_LABELS[inv.type as InvestmentType] ?? 'Investment'
    const ratingLabel = inv.creditRating ? ` · ${inv.creditRating}` : ''
    holdings.push({
      kind: 'investment',
      id: inv.id,
      name: inv.name,
      valuePaise: value,
      job: (inv.job as JobKey | null) ?? null,
      suggestedJob: suggestJobForInvestment(inv.type, inv.creditRating),
      detail: `${typeLabel}${ratingLabel}`,
    })
  }

  for (const a of assets) {
    holdings.push({
      kind: 'asset',
      id: a.id,
      name: a.name,
      valuePaise: Number(a.currentValuePaise),
      job: (a.job as JobKey | null) ?? null,
      suggestedJob: suggestJobForAsset(a.category),
      detail: ASSET_CATEGORY_LABELS[a.category as AssetCategoryKey]?.label ?? 'Asset',
    })
  }

  const targetMap: Partial<Record<JobKey, number>> = {}
  for (const t of targets) targetMap[t.job as JobKey] = t.targetPct
  const plan = buildJobPlan(holdings, targetMap)

  // income machine inputs
  const fdMonthlyAccrualPaise = Math.round(
    fds.reduce((s, f) => s + (f.maturityAmountPaise - f.principalPaise) / Math.max(1, f.tenureMonths), 0),
  )
  const trailing12mIncomePaise = incomeTxns.reduce((s, t) => s + Number(t.amountPaise), 0)
  const depositsBasePaise =
    fds.reduce((s, f) => s + f.principalPaise, 0) + rdValues.reduce((s, r) => s + r.paise, 0)
  const income = incomeMachine({
    bonds,
    fdMonthlyAccrualPaise,
    trailing12mIncomePaise,
    incomeBasePaise: depositsBasePaise + investmentsValuePaise,
    monthKey: today.slice(0, 7),
  })

  // DICGC exposure: savings balances + FD principal + RD value-now per bank
  const dicgc = dicgcExposure([
    ...accounts.filter((a) => a.type === 'savings').map((a) => ({ institution: a.name, paise: a.balancePaise })),
    ...fds.map((f) => ({ institution: f.bank, paise: f.principalPaise })),
    ...rdValues.map((r) => ({ institution: r.bank, paise: r.paise })),
  ])

  return {
    today,
    monthKey: today.slice(0, 7),
    health: planHealth(plan),
    hasTargets: targets.length > 0,
    totalPaise: plan.totalPaise,
    unassignedCount: plan.unassignedCount,
    unassignedValuePaise: plan.unassignedValuePaise,
    jobs: plan.jobs.map((j) => ({ ...j, goals: goalsFunding.byJob[j.job]?.goals ?? [] })),
    goalsFunding: {
      ...goalsFunding,
      byJob: Object.fromEntries(
        Object.entries(goalsFunding.byJob).filter(([, r]) => r.goalCount > 0),
      ) as GoalsFundingDTO['byJob'],
    },
    income,
    dicgc,
  }
}

/* ---------------- targets (the plan) ---------------------------------- */

export interface TargetInput {
  job: JobKey
  targetPct: number
}

/** Replace the whole plan (the six rows together ARE the plan). */
export async function replaceTargets(userId: string, targets: TargetInput[]): Promise<TargetInput[]> {
  if (targets.length > JOB_KEYS.length) throw new HttpError('At most six job targets', 422)
  const seen = new Set<string>()
  for (const t of targets) {
    if (!(JOB_KEYS as readonly string[]).includes(t.job)) throw new HttpError('Unknown portfolio job', 422)
    if (typeof t.targetPct !== 'number' || !Number.isFinite(t.targetPct) || t.targetPct < 0 || t.targetPct > 100) {
      throw new HttpError('Target % must be between 0 and 100', 422)
    }
    if (seen.has(t.job)) throw new HttpError('Duplicate job in plan', 422)
    seen.add(t.job)
  }
  await db.$transaction([
    db.portfolioTarget.deleteMany({ where: { userId } }),
    db.portfolioTarget.createMany({
      data: targets.map((t) => ({ userId, job: t.job, targetPct: Math.round(t.targetPct * 100) / 100 })),
    }),
  ])
  return targets
}

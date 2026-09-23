// Portfolio planner (Phase 8) — "every rupee has a job".
// The planning framework, translated into pure, unit-tested math:
//   • 6 JOBS every holding can perform: liquidity, safety, income, growth,
//     protection, speculation (the user's "5 portfolios" fold into these —
//     liquidity+safety = Safety portfolio, protection = diversifiers).
//   • Each job carries a guideline range distilled from the framework
//     (Safety 20–30%, Income 10–20%, Growth 35–50%, Protection 10–15%,
//     High-risk 0–5%, Liquidity ≈ emergency + opportunity cash 5–10%).
//   • Targets per job = the user's plan; drift = actual − target in
//     percentage points; rebalance "moves" are informational, not orders.
//   • DICGC awareness: eligible deposits are insured up to ₹5 lakh per
//     depositor per bank (savings + FD + RD aggregated at the same bank,
//     separate limits across banks).
//   • Income machine: scheduled bond coupons (maturity-anchored calendar),
//     average FD interest accrual, trailing-12-month dividend/interest flow.
// All pure functions; amounts in integer paise; rounding half-up 2dp.

import { addMonthsUTC, monthRange } from './date'
import { toPaise } from './money'
import type { JobKey, CreditRating } from './types'

export type { JobKey, CreditRating }

/** zod-consumable tuples. */
export const JOB_KEYS = ['liquidity', 'safety', 'income', 'growth', 'protection', 'speculation'] as const
export const JOBS: JobKey[] = [...JOB_KEYS]

export interface JobMeta {
  label: string
  emoji: string
  tagline: string
  purpose: string
  /** guideline range in % of invested wealth (display + off-plan flagging) */
  guideline: readonly [number, number]
}

export const JOB_META: Record<JobKey, JobMeta> = {
  liquidity: {
    label: 'Liquidity',
    emoji: '💧',
    tagline: 'Money you can reach immediately',
    purpose: '6–12 months of expenses, upcoming large payments, opportunities',
    guideline: [5, 10],
  },
  safety: {
    label: 'Safety',
    emoji: '🛡️',
    tagline: 'Money that must not disappear',
    purpose: 'FD ladder, RDs, insured bank deposits',
    guideline: [15, 30],
  },
  income: {
    label: 'Income',
    emoji: '💵',
    tagline: 'Predictable cash flow',
    purpose: 'T-bills, government securities, high-quality bonds',
    guideline: [10, 25],
  },
  growth: {
    label: 'Growth',
    emoji: '📈',
    tagline: 'Wealth that compounds over 10–20+ years',
    purpose: 'Index funds, equity funds, selected stocks, retirement',
    guideline: [35, 50],
  },
  protection: {
    label: 'Protection',
    emoji: '🥇',
    tagline: 'Hedge when other assets behave badly',
    purpose: 'Gold and silver — insurance, not a get-rich engine',
    guideline: [10, 15],
  },
  speculation: {
    label: 'Speculation',
    emoji: '🚀',
    tagline: 'You can afford to lose this without damage',
    purpose: 'Crypto and high-risk bets — capped, rebalanced on schedule',
    guideline: [0, 5],
  },
}

/** Drift beyond this many percentage points from target ⇒ 'drift'. */
export const DRIFT_TOLERANCE_PP = 5

/* ------------------------------------------------------------------ */
/* Suggested job per entity kind (display-level fallback; the stored   */
/* `job` column always wins when the user has tagged it).              */
/* ------------------------------------------------------------------ */

export function suggestJobForAccount(type: string): JobKey | null {
  if (type === 'savings' || type === 'cash') return 'liquidity'
  return null // credit cards are liabilities, not part of the plan
}

export function suggestJobForDeposit(): JobKey {
  return 'safety' // FD and RD
}

export function suggestJobForInvestment(type: string, creditRating?: string | null): JobKey | null {
  switch (type) {
    case 'stock':
    case 'mutual_fund':
    case 'etf':
    case 'nps':
      return 'growth'
    case 'crypto':
      return 'speculation'
    case 'gold':
      return 'protection'
    case 'reit':
      return 'income'
    case 'ppf':
      return 'safety'
    case 'bond':
      return creditRating === 'govt' ? 'safety' : 'income'
    default:
      return null // 'other' stays unassigned until the user decides
  }
}

export function suggestJobForAsset(category: string): JobKey | null {
  switch (category) {
    case 'real_estate':
      return 'growth'
    case 'machinery':
      return 'income'
    case 'gold_jewellery':
      return 'protection'
    default:
      return null // vehicles, electronics, furniture, art = consumption, not plan assets
  }
}

/* ------------------------------------------------------------------ */
/* Holdings & allocation                                               */
/* ------------------------------------------------------------------ */

export type HoldingKind = 'account' | 'fd' | 'rd' | 'investment' | 'asset'

export interface PlannerHolding {
  kind: HoldingKind
  id: string
  name: string
  valuePaise: number
  /** the user's stored tag (null = not tagged) */
  job: JobKey | null
  /** framework fallback when untagged */
  suggestedJob: JobKey | null
  /** short sub-label, e.g. "Savings", "AAA bond", "Real estate" */
  detail?: string
}

export function effectiveJob(h: PlannerHolding): JobKey | null {
  return h.job ?? h.suggestedJob
}

export interface AllocationSlice {
  job: JobKey | null
  valuePaise: number
  /** % of total, 2dp (0 when total is 0) */
  pct: number
}

/** Group holdings by effective job; `null` slice = untagged money. */
export function allocateByJob(holdings: PlannerHolding[]): AllocationSlice[] {
  const totals = new Map<JobKey | null, number>()
  let total = 0
  for (const h of holdings) {
    if (h.valuePaise === 0) continue
    const job = effectiveJob(h)
    totals.set(job, (totals.get(job) ?? 0) + h.valuePaise)
    total += h.valuePaise
  }
  return [...totals.entries()]
    .map(([job, valuePaise]) => ({
      job,
      valuePaise,
      pct: total > 0 ? Math.round((valuePaise / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.valuePaise - a.valuePaise)
}

/* ------------------------------------------------------------------ */
/* The plan: targets, drift, moves                                     */
/* ------------------------------------------------------------------ */

export type JobPlanStatus = 'no_target' | 'on_plan' | 'drift'

export interface JobPlanRow {
  job: JobKey
  valuePaise: number
  pct: number
  targetPct: number | null
  /** actual − target, percentage points, 2dp (null without a target) */
  driftPp: number | null
  /** signed ₹ move to hit target: positive = add, negative = trim (null without target) */
  movePaise: number | null
  status: JobPlanStatus
  /** actual % outside the framework's guideline range (±0.5pp grace) */
  outsideGuideline: boolean
  holdings: PlannerHolding[]
}

export interface JobPlan {
  jobs: JobPlanRow[]
  totalPaise: number
  unassignedCount: number
  unassignedValuePaise: number
}

export function buildJobPlan(holdings: PlannerHolding[], targets: Partial<Record<JobKey, number>>): JobPlan {
  const totalPaise = holdings.reduce((s, h) => s + h.valuePaise, 0)
  const byJob = new Map<JobKey, PlannerHolding[]>()
  let unassignedCount = 0
  let unassignedValuePaise = 0

  for (const h of holdings) {
    if (h.valuePaise === 0) continue
    const job = effectiveJob(h)
    if (!job) {
      unassignedCount++
      unassignedValuePaise += h.valuePaise
      continue
    }
    const list = byJob.get(job)
    if (list) list.push(h)
    else byJob.set(job, [h])
  }

  const jobs = JOBS.map<JobPlanRow>((job) => {
    const list = (byJob.get(job) ?? []).sort((a, b) => b.valuePaise - a.valuePaise)
    const valuePaise = list.reduce((s, h) => s + h.valuePaise, 0)
    const pct = totalPaise > 0 ? Math.round((valuePaise / totalPaise) * 10000) / 100 : 0
    const targetPct = targets[job] ?? null
    const driftPp = targetPct != null ? Math.round((pct - targetPct) * 100) / 100 : null
    const rawMove = targetPct != null ? Math.round(((targetPct - pct) / 100) * totalPaise) : null
    const movePaise = rawMove != null && Math.abs(rawMove) < 100 ? 0 : rawMove
    const [gMin, gMax] = JOB_META[job].guideline
    return {
      job,
      valuePaise,
      pct,
      targetPct,
      driftPp,
      movePaise,
      status: targetPct == null ? 'no_target' : Math.abs(driftPp!) > DRIFT_TOLERANCE_PP ? 'drift' : 'on_plan',
      outsideGuideline: totalPaise > 0 && (pct < gMin - 0.5 || pct > gMax + 0.5),
      holdings: list,
    }
  })

  return { jobs, totalPaise, unassignedCount, unassignedValuePaise }
}

export type PlanHealth = 'empty' | 'unset' | 'aligned' | 'drift'

/** Roll the six job rows into one plan verdict. */
export function planHealth(plan: JobPlan): PlanHealth {
  if (plan.totalPaise <= 0) return 'empty'
  if (!plan.jobs.some((j) => j.targetPct != null)) return 'unset'
  return plan.jobs.some((j) => j.status === 'drift') ? 'drift' : 'aligned'
}

/* ------------------------------------------------------------------ */
/* Presets — sensible starting plans, each summing to exactly 100      */
/* ------------------------------------------------------------------ */

export interface PlanPreset {
  key: string
  name: string
  description: string
  targets: Record<JobKey, number>
}

/** The framework's ₹1 Cr starter table mapped onto the six jobs. */
export const PLAN_PRESETS: PlanPreset[] = [
  {
    key: 'starter_balanced',
    name: 'Starter balanced',
    description: 'The framework’s ₹1 Cr table: 5% emergency + 5% opportunity cash, 15% bank deposits, 25% quality fixed income, 35% equity, 13% gold/silver, 2% crypto.',
    targets: { liquidity: 10, safety: 15, income: 25, growth: 35, protection: 13, speculation: 2 },
  },
  {
    key: 'growth_tilt',
    name: 'Growth tilt',
    description: 'Compounding first — index-heavy core with a solid safety floor and a small speculative sleeve.',
    targets: { liquidity: 8, safety: 22, income: 15, growth: 42, protection: 10, speculation: 3 },
  },
  {
    key: 'capital_protection',
    name: 'Capital protection',
    description: 'Sleep-well-first: big insured-deposit and government-bond share, equity still present for the long run.',
    targets: { liquidity: 15, safety: 30, income: 20, growth: 20, protection: 12, speculation: 3 },
  },
]

/* ------------------------------------------------------------------ */
/* DICGC deposit insurance awareness                                   */
/* ------------------------------------------------------------------ */

/** ₹5,00,000 in paise — DICGC limit per depositor per bank. */
export const DICGC_LIMIT_PAISE = 50_000_000

export interface DepositExposureRow {
  institution: string
  totalPaise: number
  insuredPaise: number
  uninsuredPaise: number
  overLimit: boolean
}

/** Best-effort institution normalisation ("HDFC Bank" ≈ "hdfc savings"). */
export function normalizeInstitution(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/ (bank|savings|savings account|a\/c|account)$/, '')
}

/**
 * Aggregate deposit exposures per institution (savings balances + FD
 * principal + RD value-now) and split each against the ₹5L DICGC limit.
 * Aggregation across account types at the SAME bank matches DICGC rules.
 */
export function dicgcExposure(rows: { institution: string; paise: number }[]): {
  rows: DepositExposureRow[]
  overLimitCount: number
} {
  const totals = new Map<string, { label: string; paise: number }>()
  for (const r of rows) {
    if (r.paise <= 0) continue
    const key = normalizeInstitution(r.institution)
    const existing = totals.get(key)
    if (existing) existing.paise += r.paise
    else totals.set(key, { label: r.institution.trim(), paise: r.paise })
  }
  const out = [...totals.values()]
    .sort((a, b) => b.paise - a.paise)
    .map<DepositExposureRow>(({ label, paise }) => ({
      institution: label,
      totalPaise: paise,
      insuredPaise: Math.min(paise, DICGC_LIMIT_PAISE),
      uninsuredPaise: Math.max(0, paise - DICGC_LIMIT_PAISE),
      overLimit: paise > DICGC_LIMIT_PAISE,
    }))
  return { rows: out, overLimitCount: out.filter((r) => r.overLimit).length }
}

/* ------------------------------------------------------------------ */
/* Income machine — the portfolio's pseudo-salary                      */
/* ------------------------------------------------------------------ */

export const COUPON_FREQ_PER_YEAR = { monthly: 12, quarterly: 4, half_yearly: 2, annual: 1 } as const
export type CouponFrequency = keyof typeof COUPON_FREQ_PER_YEAR
export const COUPON_FREQUENCIES = ['monthly', 'quarterly', 'half_yearly', 'annual'] as const

/**
 * How many coupon dates of a bond fall inside [monthStart, monthEndExclusive)?
 * The coupon calendar is anchored at the bond's maturity (the final coupon):
 * walk backwards in 12/perYear-month steps until before the window starts.
 * A matured bond (maturity before the window) pays nothing.
 */
export function couponsInMonth(maturityISO: string, perYear: number, monthStart: Date, monthEndExclusive: Date): number {
  if (!Number.isInteger(perYear) || perYear < 1 || perYear > 12) return 0
  const stepMonths = 12 / perYear
  const maturity = new Date(`${maturityISO}T00:00:00.000Z`)
  if (maturity.getTime() < monthStart.getTime()) return 0
  let count = 0
  for (let k = 0; k <= 1200; k++) {
    const d = addMonthsUTC(maturity, -k * stepMonths, maturity.getUTCDate())
    if (d.getTime() < monthStart.getTime()) break
    if (d.getTime() < monthEndExclusive.getTime()) count++
  }
  return count
}

export interface BondIncomeInput {
  name: string
  marketValuePaise: number
  ratePct: number
  couponFrequency: CouponFrequency | null
  maturityISO: string | null
}

export interface IncomeMachineInput {
  bonds: BondIncomeInput[]
  /** Σ (FD maturity − principal) ÷ tenure for active FDs — accrual, not payout */
  fdMonthlyAccrualPaise: number
  /** dividends + interest txns over the trailing 365 days */
  trailing12mIncomePaise: number
  /** deposits + investments market value — the yield denominator */
  incomeBasePaise: number
  monthKey: string // "YYYY-MM"
}

export interface IncomeMachine {
  /** bond coupons actually scheduled inside the month */
  scheduledThisMonthPaise: number
  /** scheduled + FD accrual + trailing-12m dividends/12 */
  monthlyAveragePaise: number
  projectedAnnualPaise: number
  /** annual ÷ (deposits + investments), 2dp; null without an income base */
  yieldPct: number | null
  bondCouponsMonthlyPaise: number
  fdAccrualMonthlyPaise: number
  distributionMonthlyPaise: number
}

export function incomeMachine(input: IncomeMachineInput): IncomeMachine {
  const { start, endExclusive } = monthRange(input.monthKey)

  let scheduledThisMonthPaise = 0
  let bondCouponsMonthlyPaise = 0
  for (const b of input.bonds) {
    if (b.marketValuePaise <= 0 || b.ratePct <= 0) continue
    // annual coupon in paise = MV(rupees) × rate/100, rounded once to the paise
    const annualCoupon = toPaise((b.marketValuePaise / 100) * (b.ratePct / 100))
    const perYear = COUPON_FREQ_PER_YEAR[b.couponFrequency ?? 'annual']
    const perCoupon = Math.round(annualCoupon / perYear)
    if (b.maturityISO) {
      scheduledThisMonthPaise += couponsInMonth(b.maturityISO, perYear, start, endExclusive) * perCoupon
    }
    // average view uses the flat annual/12 regardless of schedulability
    bondCouponsMonthlyPaise += Math.round(annualCoupon / 12)
  }

  const fdAccrualMonthlyPaise = Math.max(0, Math.round(input.fdMonthlyAccrualPaise))
  const distributionMonthlyPaise = Math.round(input.trailing12mIncomePaise / 12)
  const monthlyAveragePaise = bondCouponsMonthlyPaise + fdAccrualMonthlyPaise + distributionMonthlyPaise
  const projectedAnnualPaise = monthlyAveragePaise * 12
  const yieldPct =
    input.incomeBasePaise > 0 ? Math.round((projectedAnnualPaise / input.incomeBasePaise) * 10000) / 100 : null

  return {
    scheduledThisMonthPaise,
    monthlyAveragePaise,
    projectedAnnualPaise,
    yieldPct,
    bondCouponsMonthlyPaise,
    fdAccrualMonthlyPaise,
    distributionMonthlyPaise,
  }
}

/* ------------------------------------------------------------------ */
/* Knowledge layer — decide with full knowledge                        */
/* ------------------------------------------------------------------ */

export const CREDIT_RATINGS = ['govt', 'AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'below_B', 'unrated'] as const

export const CREDIT_RATING_META: Record<CreditRating, { label: string; tier: string; note: string }> = {
  govt: { label: 'Government', tier: 'Sovereign', note: 'Backed by the state — the safety bucket’s foundation (T-bills, G-secs).' },
  AAA: { label: 'AAA', tier: 'Highest quality', note: 'Highest credit quality; comparatively less risky than AA — still not risk-free.' },
  AA: { label: 'AA', tier: 'High quality', note: 'A notch below AAA. Fine in moderation; rates compensate for the extra risk.' },
  A: { label: 'A', tier: 'Strong', note: 'Adequate safety but more sensitive to business conditions.' },
  BBB: { label: 'BBB', tier: 'Moderate', note: 'Lowest investment grade — adequate, but vulnerable. Not for a safety-first core.' },
  BB: { label: 'BB', tier: 'Speculative', note: '“Junk” boundary. Yield is compensation for real default risk.' },
  B: { label: 'B', tier: 'Speculative', note: 'Speculative — expect volatility and genuine default risk.' },
  below_B: { label: 'Below B', tier: 'Highly speculative', note: 'High default risk. Position-size accordingly.' },
  unrated: { label: 'Unrated', tier: 'Unknown', note: 'No rating on record — verify credit quality before trusting yield.' },
}

export interface HorizonRow {
  horizon: string
  emoji: string
  jobs: JobKey[]
  instruments: string
}

export const HORIZON_MAP: HorizonRow[] = [
  { horizon: 'Needed within 1 year', emoji: '💧', jobs: ['liquidity'], instruments: 'Savings, liquid instruments — access beats return' },
  { horizon: '1–5 years', emoji: '🛡️', jobs: ['safety', 'income'], instruments: 'FD ladder, T-bills, government bonds, quality deposits' },
  { horizon: '5–10 years', emoji: '⚖️', jobs: ['income', 'growth'], instruments: 'A mix of fixed income and equity' },
  { horizon: '10–20+ years', emoji: '📈', jobs: ['growth'], instruments: 'Predominantly equity and index funds' },
  { horizon: 'Diversification', emoji: '🥇', jobs: ['protection'], instruments: 'Gold and silver — hedges, not engines' },
  { horizon: 'Can afford to lose', emoji: '🚀', jobs: ['speculation'], instruments: 'Crypto and speculative bets, strictly capped' },
]

export interface KnowledgeCard {
  key: string
  emoji: string
  title: string
  body: string
}

export const KNOWLEDGE_CARDS: KnowledgeCard[] = [
  {
    key: 'every_rupee',
    emoji: '🧭',
    title: 'Ask what the money must do, not where to put it',
    body: 'Don’t ask “where should I put my money?” — ask “what job does this rupee need to perform?” Money needed in 1 year, 1–5 years, 10+ years, for diversification, or that you can afford to lose, belongs in different instruments. That one question reorganises an entire portfolio.',
  },
  {
    key: 'savings_role',
    emoji: '🏦',
    title: 'A savings account is liquidity, not an investment',
    body: 'Keep enough for 6–12 months of expenses, upcoming large payments and short-term emergencies. Money beyond that shouldn’t sit idle earning savings-account rates when it can safely earn more elsewhere.',
  },
  {
    key: 'dicgc',
    emoji: '🏛️',
    title: 'DICGC insures ₹5 lakh per depositor per bank',
    body: 'Eligible deposits — savings, FD and RD — are insured up to ₹5 lakh per bank including principal and accrued interest, aggregated across all your accounts at that bank. Deposits at different banks get separate limits. The DICGC publishes an up-to-date insured-bank list; verify before depositing.',
  },
  {
    key: 'fd_ladder',
    emoji: '🪜',
    title: 'Ladder your FDs instead of one long lock-in',
    body: 'Split a lump sum across 1/2/3/4/5-year FDs. When the shortest matures, reinvest into the longest. You get a rolling maturity system: periodic liquidity, flexibility as rates change, and freedom to redeploy when circumstances change.',
  },
  {
    key: 'sbf_caution',
    emoji: '⚠️',
    title: 'Higher interest is compensation for higher risk',
    body: 'A small finance bank paying 8% over 6.5% isn’t free money — the spread pays you for taking extra risk. Insurance doesn’t make an unlimited deposit risk-free. Use small-finance-bank FDs within a controlled slice of the safety bucket, and verify the bank is currently DICGC-insured.',
  },
  {
    key: 'rd_role',
    emoji: '🗓️',
    title: 'RDs turn monthly income into capital',
    body: 'An RD is useful when building capital from salary or business income — automate the monthly slice. If a lump sum is already sitting in cash, a direct allocation usually constructs a better portfolio than parking it in an RD “because it’s safe”.',
  },
  {
    key: 'govt_first',
    emoji: '🇮🇳',
    title: 'Government securities before corporate yield',
    body: 'For the conservative part of a portfolio, prefer T-bills, government securities and other sovereign-backed instruments before reaching for BBB corporate debt merely to increase yield. Safety buckets are built on sovereign paper.',
  },
  {
    key: 'rating_ladder',
    emoji: '🪙',
    title: 'AAA → AA → A → BBB: ratings measure quality, not safety guarantees',
    body: '“AAA = safe, BBB = more return” is an oversimplification. Credit ratings indicate credit quality; they do not eliminate risk. SEBI notes corporate bonds carry more risk than government securities, and AAA is comparatively less risky than AA. Build conservative buckets on govt + AAA, add AA selectively, and keep A/BBB small.',
  },
  {
    key: 'coupon_risk',
    emoji: '🧾',
    title: 'A coupon is not a guaranteed total return',
    body: 'A bond can pay interest regularly and still hurt you through credit risk, interest-rate risk, liquidity risk, price fluctuation and reinvestment risk. Design the income portfolio for the whole return, not the headline coupon.',
  },
  {
    key: 'income_ladder',
    emoji: '💵',
    title: 'Build a monthly income ladder — a pseudo-salary',
    body: 'Spread maturities and coupon dates across months so some income arrives every month — Jan ₹X, Feb ₹X, Mar ₹X. Chasing the highest single yield loses to a well-distributed ladder on both reliability and sleep.',
  },
  {
    key: 'index_core',
    emoji: '📊',
    title: 'Index first, stock-picking second',
    body: 'For a 10–20+ year horizon, make broad-market index funds the equity core (Nifty 50, Nifty Next 50, wider diversification). Individual stocks are an optional satellite around that foundation, not the engine itself.',
  },
  {
    key: 'metals',
    emoji: '🥇',
    title: 'Gold insures; silver is a volatile satellite',
    body: 'Gold’s job is portfolio insurance, diversification and purchasing-power protection — roughly 5–15% of a portfolio. Prefer efficient vehicles (gold ETFs) over jewellery. Silver is considerably more volatile: a 2–5% satellite allocation is reasonable; don’t make it 15–20% on a price hunch.',
  },
  {
    key: 'crypto_discipline',
    emoji: '🚀',
    title: 'Crypto: speculative capital, rebalanced on schedule',
    body: 'Treat crypto as venture capital — 0–5% you can afford to lose without damaging your financial life. If a 3% allocation 5×’s into 20% of net worth, rebalance back to plan instead of letting one bet quietly take over the portfolio.',
  },
  {
    key: 'rebalance',
    emoji: '🎯',
    title: 'Fix drift with new money first',
    body: 'When a bucket drifts from its target, the cheapest rebalance is directing fresh savings toward the underweight jobs. Trimming winners (and the tax that follows) is the second tool. Rebalancing is what keeps risk where you chose it.',
  },
]

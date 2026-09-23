import { describe, expect, it } from 'vitest'
import {
  allocateByJob,
  buildJobPlan,
  planHealth,
  couponsInMonth,
  incomeMachine,
  dicgcExposure,
  normalizeInstitution,
  PLAN_PRESETS,
  suggestJobForAccount,
  suggestJobForDeposit,
  suggestJobForInvestment,
  suggestJobForAsset,
  effectiveJob,
  JOB_META,
  type PlannerHolding,
} from '../src/lib/planner'
import { monthRange, toUTC } from '../src/lib/date'
import { toPaise } from '../src/lib/money'

function h(partial: Partial<PlannerHolding> & { id: string; valuePaise: number }): PlannerHolding {
  return { kind: 'investment', name: partial.id, job: null, suggestedJob: null, ...partial }
}

describe('allocateByJob', () => {
  it('groups by effective job (stored job wins over suggestion)', () => {
    const rows = [
      h({ id: 'a', valuePaise: 3_000_000_00, job: 'growth', suggestedJob: 'income' }),
      h({ id: 'b', valuePaise: 1_000_000_00, suggestedJob: 'liquidity' }),
      h({ id: 'c', valuePaise: 1_000_000_00, job: null, suggestedJob: null }),
    ]
    const slices = allocateByJob(rows)
    expect(slices.map((s) => [s.job, s.pct])).toEqual([
      ['growth', 60],
      ['liquidity', 20],
      [null, 20],
    ])
  })

  it('returns zero pct for every job when total is zero', () => {
    const slices = allocateByJob([h({ id: 'a', valuePaise: 0 })])
    expect(slices).toEqual([])
  })

  it('sorts slices largest-first', () => {
    const rows = [
      h({ id: 'small', valuePaise: 100_00, suggestedJob: 'safety' }),
      h({ id: 'big', valuePaise: 900_00, suggestedJob: 'growth' }),
    ]
    expect(allocateByJob(rows)[0].job).toBe('growth')
  })
})

describe('buildJobPlan', () => {
  // ₹10,00,000 total (1e8 paise)
  const rows: PlannerHolding[] = [
    h({ id: 'fd1', kind: 'fd', name: 'HDFC FD', valuePaise: 20_000_000, suggestedJob: 'safety' }),
    h({ id: 'nifty', name: 'Nifty index', valuePaise: 70_000_000, job: 'growth' }),
    h({ id: 'emg', kind: 'account', name: 'Emergency a/c', valuePaise: 10_000_000, suggestedJob: 'liquidity' }),
  ]

  it('computes pct, drift, status and move per job (hand-verified)', () => {
    const plan = buildJobPlan(rows, { growth: 40, liquidity: 10 })
    const growth = plan.jobs.find((j) => j.job === 'growth')!
    const liquidity = plan.jobs.find((j) => j.job === 'liquidity')!
    const safety = plan.jobs.find((j) => j.job === 'safety')!

    expect(plan.totalPaise).toBe(100_000_000)
    expect(growth.pct).toBe(70)
    expect(growth.driftPp).toBe(30)
    expect(growth.status).toBe('drift')
    expect(growth.movePaise).toBe(-30_000_000) // trim ₹3,00,000
    expect(growth.outsideGuideline).toBe(true) // 70 > 50.5
    expect(growth.holdings).toHaveLength(1)

    expect(liquidity.pct).toBe(10)
    expect(liquidity.driftPp).toBe(0)
    expect(liquidity.status).toBe('on_plan')
    expect(liquidity.movePaise).toBe(0) // |move| < ₹1 collapses to 0
    expect(liquidity.outsideGuideline).toBe(false) // 10 within [5,10]

    expect(safety.pct).toBe(20)
    expect(safety.targetPct).toBeNull()
    expect(safety.status).toBe('no_target')
    expect(safety.driftPp).toBeNull()
    expect(safety.movePaise).toBeNull()
  })

  it('counts unassigned money (job and suggestion both null)', () => {
    const plan = buildJobPlan([h({ id: 'x', valuePaise: 50_000_00 })], {})
    expect(plan.unassignedCount).toBe(1)
    expect(plan.unassignedValuePaise).toBe(50_000_00)
    expect(plan.jobs.every((j) => j.valuePaise === 0)).toBe(true)
  })

  it('flags outside-guideline even when drift is within tolerance', () => {
    // speculation guideline [0,5]: exactly 5 is inside, 6 is outside (±0.5 grace)
    const spec5 = buildJobPlan(
      [h({ id: 'btc', valuePaise: 5_00_00, suggestedJob: 'speculation' }), h({ id: 'rest', valuePaise: 95_00_00, job: 'growth' })],
      { speculation: 5 },
    )
    const ok = spec5.jobs.find((j) => j.job === 'speculation')!
    expect(ok.pct).toBe(5)
    expect(ok.status).toBe('on_plan')
    expect(ok.outsideGuideline).toBe(false)

    const spec6 = buildJobPlan(
      [h({ id: 'btc', valuePaise: 6_00_00, suggestedJob: 'speculation' }), h({ id: 'rest', valuePaise: 94_00_00, job: 'growth' })],
      { speculation: 3 },
    )
    const spec = spec6.jobs.find((j) => j.job === 'speculation')!
    expect(spec.pct).toBe(6)
    expect(spec.status).toBe('on_plan') // |6−3| = 3 ≤ 5pp tolerance
    expect(spec.outsideGuideline).toBe(true) // 6 > 5.5 guideline ceiling
  })

  it('returns all six jobs in canonical order', () => {
    const plan = buildJobPlan([], {})
    expect(plan.jobs.map((j) => j.job)).toEqual([
      'liquidity',
      'safety',
      'income',
      'growth',
      'protection',
      'speculation',
    ])
  })
})

describe('planHealth', () => {
  it('empty when there is no wealth', () => {
    expect(planHealth(buildJobPlan([], {}))).toBe('empty')
  })
  it('unset when holdings exist but no targets', () => {
    expect(planHealth(buildJobPlan([h({ id: 'a', valuePaise: 100_00 })], {}))).toBe('unset')
  })
  it('aligned when every targeted job is within tolerance', () => {
    const plan = buildJobPlan(
      [h({ id: 'a', valuePaise: 40_000_00, job: 'growth' }), h({ id: 'b', valuePaise: 60_000_00, suggestedJob: 'safety' })],
      { growth: 40, safety: 60 },
    )
    expect(planHealth(plan)).toBe('aligned')
  })
  it('drift when any targeted job drifts beyond tolerance', () => {
    const plan = buildJobPlan(
      [h({ id: 'a', valuePaise: 40_000_00, job: 'growth' }), h({ id: 'b', valuePaise: 60_000_00, suggestedJob: 'safety' })],
      { growth: 70, safety: 30 },
    )
    expect(planHealth(plan)).toBe('drift')
  })
})

describe('presets', () => {
  it('every preset sums to exactly 100 and has all six jobs', () => {
    for (const p of PLAN_PRESETS) {
      const sum = Object.values(p.targets).reduce((a, b) => a + b, 0)
      expect(sum, p.key).toBe(100)
      expect(Object.keys(p.targets).sort(), p.key).toEqual([...Object.keys(JOB_META)].sort())
    }
  })
})

describe('couponsInMonth', () => {
  const win = (monthKey: string) => monthRange(monthKey)

  it('counts a quarterly coupon in its scheduled month', () => {
    // quarterly: Jun 15 → Mar 15, Dec 15, Sep 15, Jun 15 …
    expect(couponsInMonth('2027-06-15', 4, win('2026-09').start, win('2026-09').endExclusive)).toBe(1)
    expect(couponsInMonth('2027-06-15', 4, win('2026-08').start, win('2026-08').endExclusive)).toBe(0)
  })

  it('annual bond pays only in the maturity anniversary months', () => {
    expect(couponsInMonth('2027-06-15', 1, win('2026-06').start, win('2026-06').endExclusive)).toBe(1)
    expect(couponsInMonth('2027-06-15', 1, win('2026-07').start, win('2026-07').endExclusive)).toBe(0)
  })

  it('monthly coupon cadence pays every month until maturity', () => {
    expect(couponsInMonth('2027-06-15', 12, win('2026-09').start, win('2026-09').endExclusive)).toBe(1)
    expect(couponsInMonth('2027-06-15', 12, win('2027-06').start, win('2027-06').endExclusive)).toBe(1)
    expect(couponsInMonth('2027-06-15', 12, win('2027-07').start, win('2027-07').endExclusive)).toBe(0)
  })

  it('half-yearly dates clamp month-ends without drift (Dec 31 → Jun 30)', () => {
    expect(couponsInMonth('2027-12-31', 2, win('2026-12').start, win('2026-12').endExclusive)).toBe(1)
    expect(couponsInMonth('2027-12-31', 2, win('2026-06').start, win('2026-06').endExclusive)).toBe(1)
    expect(couponsInMonth('2027-12-31', 2, win('2026-07').start, win('2026-07').endExclusive)).toBe(0)
  })

  it('matured bonds pay nothing', () => {
    expect(couponsInMonth('2025-01-01', 4, win('2026-09').start, win('2026-09').endExclusive)).toBe(0)
  })

  it('a maturity landing inside the month counts (final coupon)', () => {
    expect(couponsInMonth('2026-09-20', 2, win('2026-09').start, win('2026-09').endExclusive)).toBe(1)
  })

  it('rejects nonsense frequencies', () => {
    expect(couponsInMonth('2027-06-15', 0, win('2026-09').start, win('2026-09').endExclusive)).toBe(0)
  })
})

describe('incomeMachine', () => {
  it('hand-verified: bond coupon + FD accrual + trailing dividends', () => {
    const m = incomeMachine({
      bonds: [
        {
          name: 'NHAI bond',
          marketValuePaise: 100_000_000, // ₹10,00,000
          ratePct: 7.2,
          couponFrequency: 'annual',
          maturityISO: '2026-09-15',
        },
      ],
      fdMonthlyAccrualPaise: 500_000, // ₹5,000
      trailing12mIncomePaise: 1_200_000, // ₹12,000
      incomeBasePaise: 288_000_000, // ₹28,80,000
      monthKey: '2026-09',
    })
    expect(m.bondCouponsMonthlyPaise).toBe(600_000) // ₹6,000 = 72,000/12
    expect(m.scheduledThisMonthPaise).toBe(7_200_000) // ₹72,000 lands in Sep (annual coupon)
    expect(m.fdAccrualMonthlyPaise).toBe(500_000)
    expect(m.distributionMonthlyPaise).toBe(100_000) // ₹1,000
    expect(m.monthlyAveragePaise).toBe(1_200_000) // ₹12,000
    expect(m.projectedAnnualPaise).toBe(14_400_000) // ₹1,44,000
    expect(m.yieldPct).toBe(5.0) // 1,44,000 / 28,80,000 → 5%
  })

  it('without a maturity the bond still counts in the average (not scheduled)', () => {
    const m = incomeMachine({
      bonds: [{ name: 'perp', marketValuePaise: 50_000_000, ratePct: 8, couponFrequency: null, maturityISO: null }],
      fdMonthlyAccrualPaise: 0,
      trailing12mIncomePaise: 0,
      incomeBasePaise: 50_000_000,
      monthKey: '2026-09',
    })
    expect(m.scheduledThisMonthPaise).toBe(0)
    expect(m.bondCouponsMonthlyPaise).toBe(333_333) // round(₹40,000/12) = ₹3,333.33
    expect(m.yieldPct).toBe(8.0) // 39,99,996 / 50,00,000 ≈ 8%
  })

  it('quarterly coupons schedule per calendar quarter', () => {
    const m = incomeMachine({
      bonds: [{ name: 'gsec', marketValuePaise: 40_000_000, ratePct: 7.04, couponFrequency: 'quarterly', maturityISO: '2027-06-15' }],
      fdMonthlyAccrualPaise: 0,
      trailing12mIncomePaise: 0,
      incomeBasePaise: 40_000_000,
      monthKey: '2026-09',
    })
    // annual coupon ₹28,160 → quarterly ₹7,040
    const perCoupon = Math.round(toPaise((40_000_000 / 100) * (7.04 / 100)) / 4)
    expect(perCoupon).toBe(704_000)
    expect(m.scheduledThisMonthPaise).toBe(704_000) // ₹7,040 lands in Sep
  })

  it('yield is null without an income base', () => {
    const m = incomeMachine({ bonds: [], fdMonthlyAccrualPaise: 100, trailing12mIncomePaise: 0, incomeBasePaise: 0, monthKey: '2026-09' })
    expect(m.yieldPct).toBeNull()
    expect(m.monthlyAveragePaise).toBe(100)
  })
})

describe('dicgcExposure', () => {
  it('aggregates across account types at the same bank and flags over ₹5L', () => {
    const { rows, overLimitCount } = dicgcExposure([
      { institution: 'HDFC Bank', paise: 30_000_000 }, // ₹3L FD
      { institution: 'hdfc', paise: 30_000_000 }, // ₹3L savings
      { institution: 'SBI', paise: 40_000_000 }, // ₹4L — separate bank, separate limit
    ])
    expect(rows).toHaveLength(2)
    const hdfc = rows.find((r) => normalizeInstitution(r.institution) === 'hdfc')!
    expect(hdfc.totalPaise).toBe(60_000_000) // ₹6L aggregated
    expect(hdfc.insuredPaise).toBe(50_000_000) // ₹5L covered
    expect(hdfc.uninsuredPaise).toBe(10_000_000) // ₹1L exposed
    expect(hdfc.overLimit).toBe(true)
    expect(overLimitCount).toBe(1)
    expect(rows.find((r) => normalizeInstitution(r.institution) === 'sbi')!.overLimit).toBe(false)
  })

  it('exactly ₹5L is fully insured (boundary)', () => {
    const { rows } = dicgcExposure([{ institution: 'IDFC First Bank', paise: 50_000_000 }])
    expect(rows[0].overLimit).toBe(false)
    expect(rows[0].uninsuredPaise).toBe(0)
  })

  it('normalises common bank-name variants to one key', () => {
    expect(normalizeInstitution('HDFC Bank')).toBe('hdfc')
    expect(normalizeInstitution('HDFC Savings')).toBe('hdfc')
    expect(normalizeInstitution(' hdfc ')).toBe('hdfc')
    expect(normalizeInstitution('SBI')).toBe('sbi')
  })

  it('skips non-positive deposits and sorts largest first', () => {
    const { rows } = dicgcExposure([
      { institution: 'Small', paise: 10_00 },
      { institution: 'Big', paise: 90_00 },
      { institution: 'Zero', paise: 0 },
      { institution: 'Neg', paise: -5 },
    ])
    expect(rows.map((r) => r.institution)).toEqual(['Big', 'Small'])
  })
})

describe('job suggestions', () => {
  it('accounts: savings/cash → liquidity, cards → null', () => {
    expect(suggestJobForAccount('savings')).toBe('liquidity')
    expect(suggestJobForAccount('cash')).toBe('liquidity')
    expect(suggestJobForAccount('credit_card')).toBeNull()
  })
  it('deposits always suggest safety', () => {
    expect(suggestJobForDeposit()).toBe('safety')
  })
  it('investments map by type (govt bonds → safety, corporates → income)', () => {
    expect(suggestJobForInvestment('stock')).toBe('growth')
    expect(suggestJobForInvestment('mutual_fund')).toBe('growth')
    expect(suggestJobForInvestment('crypto')).toBe('speculation')
    expect(suggestJobForInvestment('gold')).toBe('protection')
    expect(suggestJobForInvestment('reit')).toBe('income')
    expect(suggestJobForInvestment('ppf')).toBe('safety')
    expect(suggestJobForInvestment('nps')).toBe('growth')
    expect(suggestJobForInvestment('bond', 'govt')).toBe('safety')
    expect(suggestJobForInvestment('bond', 'AAA')).toBe('income')
    expect(suggestJobForInvestment('bond', null)).toBe('income')
    expect(suggestJobForInvestment('other')).toBeNull()
  })
  it('assets map by category (consumption assets stay unassigned)', () => {
    expect(suggestJobForAsset('real_estate')).toBe('growth')
    expect(suggestJobForAsset('machinery')).toBe('income')
    expect(suggestJobForAsset('gold_jewellery')).toBe('protection')
    expect(suggestJobForAsset('vehicle')).toBeNull()
    expect(suggestJobForAsset('art')).toBeNull()
  })
  it('effectiveJob: stored job wins over the suggestion', () => {
    expect(effectiveJob({ kind: 'investment', id: 'x', name: 'x', valuePaise: 1, job: 'protection', suggestedJob: 'growth' })).toBe('protection')
    expect(effectiveJob({ kind: 'investment', id: 'x', name: 'x', valuePaise: 1, job: null, suggestedJob: 'growth' })).toBe('growth')
    expect(effectiveJob({ kind: 'investment', id: 'x', name: 'x', valuePaise: 1, job: null, suggestedJob: null })).toBeNull()
  })
})

describe('calendar sanity for coupon walk', () => {
  it('monthRange windows are half-open UTC months', () => {
    const { start, endExclusive } = monthRange('2026-09')
    expect(start).toEqual(toUTC('2026-09-01'))
    expect(endExclusive).toEqual(toUTC('2026-10-01'))
  })
})

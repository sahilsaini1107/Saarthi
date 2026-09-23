// Phase 5.4 — insight rules, ranking and capping.
import { describe, expect, it } from 'vitest'
import { buildInsights, type InsightsInput } from '@/lib/insights'

const base: InsightsInput = {
  budgets: [],
  trips: [],
  categoriesMoM: [],
  biggestExpense: null,
  savingsRatePct: null,
  netWorthDeltaPct: null,
  habits: [],
  coursesAtRisk: [],
  revisionsDue: 0,
  journal: { streak: 0, daysSinceLast: null },
  maturitiesSoon: [],
}

describe('rule triggers', () => {
  it('empty input → no insights', () => {
    expect(buildInsights(base)).toEqual([])
  })

  it('over budget fires with overspend magnitude; on_track stays silent', () => {
    const s = buildInsights({
      ...base,
      budgets: [
        { categoryName: 'Food', band: 'over', overspendPaise: 120_000, overPacePaise: 0 },
        { categoryName: 'Transport', band: 'on_track', overspendPaise: 0, overPacePaise: 0 },
      ],
    })
    expect(s).toHaveLength(1)
    expect(s[0].severity).toBe('warning')
    expect(s[0].title).toContain('Food')
    expect(s[0].body).toContain('₹1.2K')
  })

  it('watch band fires with over-pace body', () => {
    const s = buildInsights({
      ...base,
      budgets: [{ categoryName: 'Shopping', band: 'watch', overspendPaise: 0, overPacePaise: 30_000 }],
    })
    expect(s[0].title).toContain('ahead of pace')
    expect(s[0].body).toContain('₹300')
  })

  it('trip over budget only fires for ongoing trips', () => {
    const s = buildInsights({
      ...base,
      trips: [
        { name: 'Goa', ongoing: true, overBudgetPaise: 5_000 },
        { name: 'Manali', ongoing: false, overBudgetPaise: 99_000 },
      ],
    })
    expect(s).toHaveLength(1)
    expect(s[0].title).toContain('Goa')
  })

  it('category MoM jump needs BOTH ≥30% and ≥₹500 increase', () => {
    const s = buildInsights({
      ...base,
      categoriesMoM: [
        { name: 'Food', emoji: '🍜', currentPaise: 200_000, prevPaise: 100_000 }, // +100%, +₹1,000 ✓
        { name: 'Tiny', emoji: '🤏', currentPaise: 200, prevPaise: 100 }, // +100% but +₹1 ✗
        { name: 'BigButFlat', emoji: '🫥', currentPaise: 110_000, prevPaise: 100_000 }, // +10% ✗
      ],
    })
    expect(s).toHaveLength(1)
    expect(s[0].title).toContain('Food')
    expect(s[0].title).toContain('100%')
  })

  it('at-risk courses fire; savings-negative fires below 0', () => {
    const s = buildInsights({
      ...base,
      coursesAtRisk: [{ title: 'System Design' }],
      savingsRatePct: -12,
    })
    expect(s.map((i) => i.id).sort()).toEqual(['course-risk-System Design', 'savings-negative'])
  })

  it('savings rate exactly 0 is neither warning nor positive', () => {
    expect(buildInsights({ ...base, savingsRatePct: 0 })).toEqual([])
  })

  it('habit streaks ≥7 fire; built habit beats plain streak; 6-day silent', () => {
    const s = buildInsights({
      ...base,
      habits: [
        { name: 'Run', emoji: '🏃', streak: 30, built: false },
        { name: 'Read', emoji: '📚', streak: 70, built: true },
        { name: 'Meditate', emoji: '🧘', streak: 6, built: false },
      ],
    })
    expect(s.map((i) => i.id)).toEqual(['habit-built-Read', 'habit-streak-Run'])
    expect(s[0].title).toContain('built')
  })

  it('savings ≥20% is positive; below stays silent', () => {
    expect(buildInsights({ ...base, savingsRatePct: 25 })[0].id).toBe('savings-strong')
    expect(buildInsights({ ...base, savingsRatePct: 19.9 })).toEqual([])
  })

  it('net worth up ≥0.5% is positive; smaller moves silent', () => {
    expect(buildInsights({ ...base, netWorthDeltaPct: 0.5 })[0].id).toBe('networth-up')
    expect(buildInsights({ ...base, netWorthDeltaPct: 0.49 })).toEqual([])
    expect(buildInsights({ ...base, netWorthDeltaPct: -3 })).toEqual([]) // dips stay silent (market noise)
  })

  it('journal: streak ≥3 positive; 3+ day gap nudges; 2-day gap silent', () => {
    const s = buildInsights({
      ...base,
      journal: { streak: 4, daysSinceLast: 0 },
    })
    expect(s[0].id).toBe('journal-streak')

    const nudge = buildInsights({ ...base, journal: { streak: 0, daysSinceLast: 3 } })
    expect(nudge[0].id).toBe('journal-gap')

    expect(buildInsights({ ...base, journal: { streak: 0, daysSinceLast: 2 } })).toEqual([])
  })

  it('maturity info shows the soonest only; big expense ≥₹5,000; revisions ≥5', () => {
    const s = buildInsights({
      ...base,
      maturitiesSoon: [
        { kind: 'fd', title: 'HDFC', daysLeft: 20 },
        { kind: 'rd', title: 'SBI', daysLeft: 5 },
      ],
      biggestExpense: { amountPaise: 600_000, categoryName: 'Electronics' },
      revisionsDue: 6,
    })
    expect(s.filter((i) => i.id.startsWith('maturity'))).toHaveLength(1)
    expect(s.find((i) => i.id.startsWith('maturity'))?.title).toContain('SBI')
    expect(s.find((i) => i.id === 'big-expense')).toBeTruthy()
    expect(s.find((i) => i.id === 'revisions-pile')).toBeTruthy()
  })
})

describe('ranking and capping', () => {
  const busy: InsightsInput = {
    ...base,
    budgets: [{ categoryName: 'Food', band: 'over', overspendPaise: 100_000, overPacePaise: 0 }],
    habits: [{ name: 'Run', emoji: '🏃', streak: 10, built: false }],
    savingsRatePct: 25,
    biggestExpense: { amountPaise: 900_000, categoryName: null },
  }

  it('warnings outrank positives outrank infos regardless of magnitude', () => {
    const s = buildInsights(busy)
    expect(s.map((i) => i.severity)).toEqual(['warning', 'positive', 'positive', 'info'])
  })

  it('within severity, larger magnitude first (bigger overspend, bigger streak)', () => {
    const s = buildInsights({
      ...base,
      budgets: [
        { categoryName: 'A', band: 'over', overspendPaise: 500, overPacePaise: 0 },
        { categoryName: 'B', band: 'over', overspendPaise: 900, overPacePaise: 0 },
      ],
    })
    expect(s[0].title.startsWith('B')).toBe(true)
  })

  it('cap limits output (default 6, explicit cap for tests)', () => {
    const many: InsightsInput = {
      ...base,
      budgets: ['A', 'B', 'C', 'D', 'E'].map((n) => ({ categoryName: n, band: 'over' as const, overspendPaise: 100, overPacePaise: 0 })),
      habits: ['x', 'y'].map((n) => ({ name: n, emoji: '🏃', streak: 8, built: false })),
      trips: [{ name: 'Goa', ongoing: true, overBudgetPaise: 10 }],
    }
    expect(buildInsights(many)).toHaveLength(6)
    expect(buildInsights(many, 3)).toHaveLength(3)
  })

  it('stripped of internal magnitude key', () => {
    for (const i of buildInsights(busy)) expect('magnitude' in i).toBe(false)
  })
})

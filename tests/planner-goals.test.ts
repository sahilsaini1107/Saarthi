import { describe, expect, it } from 'vitest'
import { rollupGoalsByJob, type GoalLinkInput } from '@/lib/planner-goals'

const goal = (over: Partial<GoalLinkInput>): GoalLinkInput => ({
  id: 'g',
  title: 'Goal',
  emoji: '🎯',
  color: '#0D9488',
  job: null,
  status: 'active',
  targetValueMilli: null,
  contributedMilli: 0,
  targetDate: null,
  ...over,
})

describe('rollupGoalsByJob', () => {
  it('rolls active money goals into their job sleeve', () => {
    const r = rollupGoalsByJob([
      goal({ id: '1', title: 'Emergency fund', job: 'safety', targetValueMilli: 100_000_000, contributedMilli: 40_000_000, targetDate: '2027-09-01' }),
      goal({ id: '2', title: 'Car corpus', job: 'safety', targetValueMilli: 300_000_000, contributedMilli: 75_000_000, targetDate: '2028-01-01' }),
    ])
    expect(r.byJob.safety.goalCount).toBe(2)
    expect(r.byJob.safety.committedMilli).toBe(400_000_000)
    expect(r.byJob.safety.contributedMilli).toBe(115_000_000)
    expect(r.totalCommittedMilli).toBe(400_000_000)
    expect(r.linkedCount).toBe(2)
  })

  it('computes remaining, pct and achieved per goal', () => {
    const r = rollupGoalsByJob([
      goal({ id: '1', job: 'growth', targetValueMilli: 100_000_000, contributedMilli: 40_000_000 }),
      goal({ id: '2', job: 'growth', targetValueMilli: 50_000_000, contributedMilli: 60_000_000 }), // over-funded
    ])
    const [under, over] = r.byJob.growth.goals
    expect(under.remainingMilli).toBe(60_000_000)
    expect(under.pct).toBe(40)
    expect(under.achieved).toBe(false)
    expect(over.remainingMilli).toBe(0)
    expect(over.pct).toBe(120)
    expect(over.achieved).toBe(true)
  })

  it('counts only ACTIVE goals (achieved/archived leave the plan)', () => {
    const r = rollupGoalsByJob([
      goal({ id: '1', job: 'safety', status: 'achieved', targetValueMilli: 100_000_000, contributedMilli: 100_000_000 }),
      goal({ id: '2', job: 'safety', status: 'archived', targetValueMilli: 100_000_000, contributedMilli: 10_000_000 }),
      goal({ id: '3', job: 'safety', targetValueMilli: 20_000_000, contributedMilli: 5_000_000 }),
    ])
    expect(r.byJob.safety.goalCount).toBe(1)
    expect(r.byJob.safety.committedMilli).toBe(20_000_000)
    expect(r.byJob.safety.contributedMilli).toBe(5_000_000)
    expect(r.linkedCount).toBe(1)
  })

  it('unlinked active money goals surface as the linking backlog', () => {
    const r = rollupGoalsByJob([
      goal({ id: '1', title: 'Mystery fund', targetValueMilli: 10_000_000 }),
      goal({ id: '2', job: 'income', targetValueMilli: 10_000_000 }),
    ])
    expect(r.unlinkedCount).toBe(1)
    expect(r.linkedCount).toBe(1)
    expect(r.byJob.income.goalCount).toBe(1)
  })

  it('target-less goals list with null remaining/pct and add 0 to committed', () => {
    const r = rollupGoalsByJob([goal({ id: '1', job: 'growth', contributedMilli: 12_345_000 })])
    const [row] = r.byJob.growth.goals
    expect(row.targetMilli).toBeNull()
    expect(row.remainingMilli).toBeNull()
    expect(row.pct).toBeNull()
    expect(row.achieved).toBe(false)
    expect(r.byJob.growth.committedMilli).toBe(0)
    expect(r.byJob.growth.contributedMilli).toBe(12_345_000)
  })

  it('sorts soonest deadline first, undated last (then title)', () => {
    const r = rollupGoalsByJob([
      goal({ id: 'z', title: 'Zulu', job: 'growth' }),
      goal({ id: 'c', title: 'Charlie', job: 'growth', targetDate: '2028-01-01' }),
      goal({ id: 'a', title: 'Alpha', job: 'growth', targetDate: '2027-01-01' }),
    ])
    expect(r.byJob.growth.goals.map((g) => g.title)).toEqual(['Alpha', 'Charlie', 'Zulu'])
  })

  it('all six sleeves always present (UI can index freely)', () => {
    const r = rollupGoalsByJob([])
    for (const job of ['liquidity', 'safety', 'income', 'growth', 'protection', 'speculation'] as const) {
      expect(r.byJob[job]).toEqual({ goals: [], committedMilli: 0, contributedMilli: 0, goalCount: 0 })
    }
    expect(r.totalCommittedMilli).toBe(0)
  })

  it('zero/negative targets are treated as target-less', () => {
    const r = rollupGoalsByJob([goal({ job: 'safety', targetValueMilli: 0, contributedMilli: 5_000 })])
    expect(r.byJob.safety.goals[0].pct).toBeNull()
    expect(r.byJob.safety.committedMilli).toBe(0)
  })
})

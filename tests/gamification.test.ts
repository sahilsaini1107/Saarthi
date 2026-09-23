import { describe, expect, it } from 'vitest'
import {
  BADGES,
  XP_AWARDS,
  computeProfile,
  cumulativeXpForLevel,
  levelInfo,
  levelTitle,
  xpForStats,
  type GamificationStats,
} from '@/lib/gamification'

const base: GamificationStats = {
  habitEntries: 0,
  routineRuns: 0,
  journalEntries: 0,
  workouts: 0,
  studySessions: 0,
  studyMinutes: 0,
  skinCheckInDays: 0,
  billPayments: 0,
  transactions: 0,
  goalTasksDone: 0,
  revisionsDone: 0,
  longestHabitStreak: 0,
  journalStreak: 0,
  goalsAchieved: 0,
  netWorthPaise: 0,
  lifeScore: null,
  savingsRatePct: null,
  insurancePolicies: 0,
}

describe('xpForStats', () => {
  it('weights every event by its award table', () => {
    const xp = xpForStats({ ...base, habitEntries: 3, journalEntries: 1, transactions: 10 })
    expect(xp).toBe(3 * XP_AWARDS.habitCheckIn + XP_AWARDS.journalEntry + 10 * XP_AWARDS.transactionLogged)
  })

  it('is zero for an empty slate', () => {
    expect(xpForStats(base)).toBe(0)
  })

  it('adds up a full active day deterministically', () => {
    const day: GamificationStats = {
      ...base,
      habitEntries: 2,
      routineRuns: 1,
      journalEntries: 1,
      workouts: 1,
      studySessions: 1,
      skinCheckInDays: 1,
      billPayments: 1,
      transactions: 3,
      goalTasksDone: 1,
      revisionsDone: 2,
    }
    expect(xpForStats(day)).toBe(2 * 5 + 10 + 10 + 8 + 8 + 3 + 5 + 3 * 2 + 8 + 2 * 5) // = 77
  })
})

describe('cumulativeXpForLevel / levelInfo', () => {
  it('uses the 100·n ramp: L2=100, L3=300, L4=600, L5=1000, L10=4500, L20=19000', () => {
    expect(cumulativeXpForLevel(1)).toBe(0)
    expect(cumulativeXpForLevel(2)).toBe(100)
    expect(cumulativeXpForLevel(3)).toBe(300)
    expect(cumulativeXpForLevel(4)).toBe(600)
    expect(cumulativeXpForLevel(5)).toBe(1000)
    expect(cumulativeXpForLevel(10)).toBe(4500)
    expect(cumulativeXpForLevel(20)).toBe(19_000)
  })

  it('places exact-threshold XP at the new level', () => {
    expect(levelInfo(0).level).toBe(1)
    expect(levelInfo(99).level).toBe(1)
    expect(levelInfo(100).level).toBe(2)
    expect(levelInfo(299).level).toBe(2)
    expect(levelInfo(300).level).toBe(3)
    expect(levelInfo(1000).level).toBe(5)
  })

  it('computes progress through the current level', () => {
    const l = levelInfo(150) // level 2 spans 100→300, so 50/200 = 25%
    expect(l.level).toBe(2)
    expect(l.xpIntoLevel).toBe(50)
    expect(l.xpForNext).toBe(200)
    expect(l.pct).toBe(25)
  })

  it('clamps negative / fractional input defensively', () => {
    expect(levelInfo(-50).level).toBe(1)
    expect(levelInfo(12.7).xpIntoLevel).toBe(12)
  })

  it('bands titles without gaps', () => {
    expect(levelTitle(1).title).toBe('Beginner')
    expect(levelTitle(2).title).toBe('Beginner')
    expect(levelTitle(3).title).toBe('Builder')
    expect(levelTitle(9).title).toBe('Committed')
    expect(levelTitle(10).title).toBe('Pathfinder')
    expect(levelTitle(50).title).toBe('Life Master')
  })
})

describe('badges', () => {
  it('unique ids and every badge has description + tier', () => {
    const ids = new Set(BADGES.map((b) => b.id))
    expect(ids.size).toBe(BADGES.length)
    for (const b of BADGES) {
      expect(b.description.length).toBeGreaterThan(3)
      expect(['bronze', 'silver', 'gold']).toContain(b.tier)
    }
  })

  it('exact boundaries earn the badge (>= semantics)', () => {
    const s = { ...base, longestHabitStreak: 66, netWorthPaise: 10_000_000, lifeScore: 70, savingsRatePct: 20, insurancePolicies: 1 }
    const profile = computeProfile(s)
    const earned = new Set(profile.badges.filter((b) => b.earned).map((b) => b.id))
    expect(earned.has('streak-66')).toBe(true)
    expect(earned.has('networth-1l')).toBe(true)
    expect(earned.has('networth-10l')).toBe(false)
    expect(earned.has('life-70')).toBe(true)
    expect(earned.has('saver-20')).toBe(true)
    expect(earned.has('protected')).toBe(true)
    expect(earned.has('first-checkin')).toBe(false) // streak but zero entries? impossible IRL, logic exact anyway
  })

  it('null lifeScore / savings never earn their badges', () => {
    const profile = computeProfile(base)
    const earned = new Set(profile.badges.filter((b) => b.earned).map((b) => b.id))
    expect(earned.has('life-70')).toBe(false)
    expect(earned.has('saver-20')).toBe(false)
    expect(profile.earnedCount).toBe(0)
    expect(profile.level.level).toBe(1)
  })

  it('one rupee below a money milestone stays locked', () => {
    const s = { ...base, netWorthPaise: 10_000_000 - 1 }
    const earned = computeProfile(s).badges.filter((b) => b.earned).map((b) => b.id)
    expect(earned).not.toContain('networth-1l')
  })

  it('studyMinutes drives the Deep Diver badge', () => {
    expect(computeProfile({ ...base, studyMinutes: 599 }).badges.find((b) => b.id === 'study-600m')?.earned).toBe(false)
    expect(computeProfile({ ...base, studyMinutes: 600 }).badges.find((b) => b.id === 'study-600m')?.earned).toBe(true)
  })

  it('profile totals add up', () => {
    const s = { ...base, habitEntries: 100, longestHabitStreak: 10, transactions: 50 }
    const p = computeProfile(s)
    expect(p.earnedCount).toBe(p.badges.filter((b) => b.earned).length)
    expect(p.totalCount).toBe(BADGES.length)
    expect(p.xp).toBe(500 + 100)
  })
})

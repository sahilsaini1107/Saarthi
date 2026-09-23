import { describe, expect, it } from 'vitest'
import {
  LEVEL_XP,
  MAX_LEVEL,
  etaDaysToLevel,
  levelForXp,
  levelProgress,
  minutesInWindow,
  minutesTrailing,
  paceMinutes,
  practiceStreak,
  recentPracticeStrip,
  skillCategoryMeta,
  toPractices,
  xpForLevel,
  type PracticeLike,
} from '@/lib/skills'

const P = (date: string, minutes = 30): PracticeLike => ({ date, minutes })

describe('skill levels — fixed cumulative curve', () => {
  it('thresholds are strictly increasing and start at 0', () => {
    expect(LEVEL_XP[0]).toBe(0)
    for (let i = 1; i < LEVEL_XP.length; i++) expect(LEVEL_XP[i]).toBeGreaterThan(LEVEL_XP[i - 1])
    expect(MAX_LEVEL).toBe(10)
  })

  it('level 1 from 0 XP, boundaries land exactly on thresholds', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(1)).toBe(1)
    expect(levelForXp(99)).toBe(1)
    expect(levelForXp(100)).toBe(2)
    expect(levelForXp(299)).toBe(2)
    expect(levelForXp(300)).toBe(3)
    expect(levelForXp(4499)).toBe(9)
    expect(levelForXp(4500)).toBe(10)
  })

  it('clamps garbage input and never exceeds max level', () => {
    expect(levelForXp(-50)).toBe(1)
    expect(levelForXp(999_999)).toBe(10)
    expect(levelForXp(12345.7)).toBe(10) // floor before compare
  })

  it('xpForLevel round-trips with levelForXp and clamps', () => {
    for (let level = 1; level <= 10; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level)
    }
    expect(xpForLevel(0)).toBe(0) // clamped to level 1
    expect(xpForLevel(-3)).toBe(0)
    expect(xpForLevel(11)).toBe(LEVEL_XP[9]) // clamped to level 10
    expect(xpForLevel(10.6)).toBe(LEVEL_XP[9]) // rounds to 11 → clamp to max
  })
})

describe('levelProgress', () => {
  it('positions inside a band with 2-decimal pct', () => {
    const p = levelProgress(150) // level 2: floor 100, next 300
    expect(p.level).toBe(2)
    expect(p.into).toBe(50)
    expect(p.span).toBe(200)
    expect(p.pct).toBe(25)
    expect(p.nextAt).toBe(300)
    expect(p.isMax).toBe(false)
  })

  it('2-decimal rounding matches the repo Math.round convention', () => {
    // xp 110: into 10, span 200 → 5% exactly; xp 111 → 5.5%; xp 111.4 not possible (ints)
    expect(levelProgress(110).pct).toBe(5)
    expect(levelProgress(111).pct).toBe(5.5)
    // one third of the level-3 band (300→600): xp 301 → 1/300 → 0.33; xp 350 → 16.67
    expect(levelProgress(301).pct).toBe(0.33)
    expect(levelProgress(350).pct).toBe(16.67)
  })

  it('max level pins pct at 100 with no nextAt', () => {
    const p = levelProgress(4500)
    expect(p.level).toBe(10)
    expect(p.isMax).toBe(true)
    expect(p.pct).toBe(100)
    expect(p.nextAt).toBeNull()
    expect(levelProgress(100000).pct).toBe(100)
  })

  it('0 XP sits at level 1 with 0%', () => {
    const p = levelProgress(0)
    expect(p.level).toBe(1)
    expect(p.into).toBe(0)
    expect(p.span).toBe(100)
    expect(p.pct).toBe(0)
    expect(p.nextAt).toBe(100)
  })
})

describe('practiceStreak', () => {
  it('counts consecutive days, deduping multiple logs per day', () => {
    const rows = [P('2026-09-18', 20), P('2026-09-19', 10), P('2026-09-19', 15), P('2026-09-20', 25)]
    expect(practiceStreak(rows, '2026-09-20')).toBe(3)
  })

  it('grace rule: un-logged today does not break the streak', () => {
    const rows = [P('2026-09-18'), P('2026-09-19')]
    expect(practiceStreak(rows, '2026-09-20')).toBe(2)
    expect(practiceStreak(rows, '2026-09-21')).toBe(0) // yesterday also empty now
  })

  it('a missed past day stops the walk', () => {
    const rows = [P('2026-09-16'), P('2026-09-18'), P('2026-09-19'), P('2026-09-20')]
    expect(practiceStreak(rows, '2026-09-20')).toBe(3)
  })

  it('zero-minute logs are ignored entirely', () => {
    const rows = [P('2026-09-19', 0), P('2026-09-20', 30)]
    expect(practiceStreak(rows, '2026-09-20')).toBe(1)
  })

  it('empty history → 0', () => {
    expect(practiceStreak([], '2026-09-20')).toBe(0)
  })
})

describe('window sums across month ends and leap days', () => {
  const febLeap = [P('2024-02-27', 10), P('2024-02-28', 20), P('2024-02-29', 30), P('2024-03-01', 40)]

  it('minutesInWindow is inclusive on both ends', () => {
    expect(minutesInWindow(febLeap, '2024-02-28', '2024-02-29')).toBe(50)
    expect(minutesInWindow(febLeap, '2024-02-27', '2024-03-01')).toBe(100)
    expect(minutesInWindow(febLeap, '2024-03-02', '2024-03-05')).toBe(0)
  })

  it('minutesTrailing spans month boundaries correctly (leap Feb)', () => {
    // trailing 4 days ending 2024-03-01: Feb 27..Mar 1
    expect(minutesTrailing(febLeap, '2024-03-01', 4)).toBe(100)
    // trailing 2 days: Feb 29 + Mar 1
    expect(minutesTrailing(febLeap, '2024-03-01', 2)).toBe(70)
  })

  it('month-end rollover on a 31-day month', () => {
    const rows = [P('2026-08-31', 15), P('2026-09-01', 10)]
    expect(minutesTrailing(rows, '2026-09-01', 2)).toBe(25)
    expect(minutesTrailing(rows, '2026-09-01', 1)).toBe(10)
  })
})

describe('paceMinutes', () => {
  it('divides by elapsed days with the window start as day 1', () => {
    const rows = [P('2026-09-19', 30), P('2026-09-20', 10)]
    // window Sep 14..Sep 20 = 7 days elapsed
    expect(paceMinutes(rows, '2026-09-14', '2026-09-20')).toBe(40 / 7)
  })

  it('same-day window counts as 1 elapsed day', () => {
    expect(paceMinutes([P('2026-09-20', 45)], '2026-09-20', '2026-09-20')).toBe(45)
    expect(paceMinutes([], '2026-09-20', '2026-09-20')).toBe(0)
  })

  it('clamps the end at today when the window extends into the future', () => {
    const rows = [P('2026-09-19', 20), P('2026-09-20', 20)]
    // window Sep 18..Sep 30 but today = Sep 20 → 3 elapsed days
    expect(paceMinutes(rows, '2026-09-18', '2026-09-30', '2026-09-20')).toBe(40 / 3)
  })

  it('null when the window is entirely in the future', () => {
    expect(paceMinutes([], '2026-09-25', '2026-09-30', '2026-09-20')).toBeNull()
  })
})

describe('etaDaysToLevel', () => {
  it('ceils the remaining XP over the pace', () => {
    // target level 5 = 1000 XP; at 900 XP, pace 30/day → 100/30 = 3.33 → 4 days
    expect(etaDaysToLevel(900, 5, 30)).toBe(4)
    // exact division stays exact
    expect(etaDaysToLevel(900, 5, 50)).toBe(2)
  })

  it('0 when the target level is already reached', () => {
    expect(etaDaysToLevel(1000, 5, 30)).toBe(0)
    expect(etaDaysToLevel(5000, 10, 30)).toBe(0)
    expect(etaDaysToLevel(5000, 3, 30)).toBe(0) // target below current
  })

  it('null when pace is unknown or invalid — never a fake ETA', () => {
    expect(etaDaysToLevel(900, 5, null)).toBeNull()
    expect(etaDaysToLevel(900, 5, 0)).toBeNull()
    expect(etaDaysToLevel(900, 5, -5)).toBeNull()
    expect(etaDaysToLevel(900, 5, Number.NaN)).toBeNull()
  })

  it('clamps the requested target level to the curve', () => {
    // target 99 → clamped to level 10 (4500); at 0 XP / pace 100 → 45 days
    expect(etaDaysToLevel(0, 99, 100)).toBe(45)
  })
})

describe('recentPracticeStrip + mappers', () => {
  it('strip totals per day and fills empty days with 0', () => {
    const rows = [P('2026-09-19', 20), P('2026-09-19', 10), P('2026-09-20', 5)]
    const strip = recentPracticeStrip(rows, '2026-09-20', 3)
    expect(strip.map((c) => c.iso)).toEqual(['2026-09-18', '2026-09-19', '2026-09-20'])
    expect(strip.map((c) => c.minutes)).toEqual([0, 30, 5])
  })

  it('toPractices maps Dates to ISO and drops non-positive minutes', () => {
    const rows = [
      { date: new Date('2026-09-19T00:00:00.000Z'), minutes: 30 },
      { date: new Date('2026-09-20T00:00:00.000Z'), minutes: 0 },
      { date: new Date('2026-09-20T00:00:00.000Z'), minutes: -5 },
    ]
    expect(toPractices(rows)).toEqual([{ date: '2026-09-19', minutes: 30 }])
  })

  it('category meta falls back to Other', () => {
    expect(skillCategoryMeta('technical').label).toBe('Technical')
    expect(skillCategoryMeta('nope').emoji).toBe('✨')
  })
})

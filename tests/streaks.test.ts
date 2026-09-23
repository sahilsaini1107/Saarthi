import { describe, expect, it } from 'vitest'
import {
  buildingProgress,
  completionRate,
  currentStreak,
  hasAnyScheduledDay,
  heatmapDays,
  isScheduledOn,
  longestStreak,
  normalizeWeekdays,
  parseWeekdays,
} from '@/lib/habits'
import { journalStreak, filterEntries, sanitizeTags, parseTags, isMood } from '@/lib/journal'

// Hand-traced scenarios (Golden Rule: verify against manual math).
// Dates chosen to cross month boundaries and a leap-year February.

const set = (days: string[]) => new Set(days)

describe('weekday schedule', () => {
  it('parses the Mon..Sun bitstring', () => {
    expect(parseWeekdays('1111100')).toEqual([true, true, true, true, true, false, false])
    expect(parseWeekdays('0000100')).toEqual([false, false, false, false, true, false, false])
  })
  it('2026-09-07 is a Monday; 2026-09-06 is a Sunday', () => {
    expect(isScheduledOn('1111111', '2026-09-07')).toBe(true)
    expect(isScheduledOn('1111100', '2026-09-07')).toBe(true)
    expect(isScheduledOn('1111100', '2026-09-06')).toBe(false)
    expect(isScheduledOn('0000001', '2026-09-06')).toBe(true) // Sun only
  })
  it('leap-year scheduling: 2024-02-29 exists and is a Thursday', () => {
    expect(isScheduledOn('1111100', '2024-02-29')).toBe(true)
    expect(isScheduledOn('0001000', '2024-02-29')).toBe(true) // Thu only
    expect(isScheduledOn('0001000', '2024-03-01')).toBe(false) // Friday
  })
  it('normalizeWeekdays rejects garbage and passes valid strings', () => {
    expect(normalizeWeekdays('1010101')).toBe('1010101')
    expect(() => normalizeWeekdays('1121100')).toThrow()
    expect(() => normalizeWeekdays('1111')).toThrow()
    expect(() => normalizeWeekdays('')).toThrow()
  })
  it('hasAnyScheduledDay', () => {
    expect(hasAnyScheduledDay('0000000')).toBe(false)
    expect(hasAnyScheduledDay('0000010')).toBe(true)
  })
})

describe('currentStreak (grace rule)', () => {
  const ALL = '1111111'
  it('counts today when done', () => {
    const s = currentStreak(set(['2026-09-04', '2026-09-05', '2026-09-06']), ALL, '2026-09-06')
    expect(s).toBe(3)
  })
  it('today scheduled but not done: streak survives (day is not over)', () => {
    const s = currentStreak(set(['2026-09-04', '2026-09-05']), ALL, '2026-09-06')
    expect(s).toBe(2)
  })
  it('yesterday missed: streak is 0 even if the day before was done', () => {
    const s = currentStreak(set(['2026-09-03', '2026-09-05']), ALL, '2026-09-06')
    expect(s).toBe(1) // only today counts; 04th gap breaks the chain behind it
  })
  it('unscheduled days never break a streak (weekend-off habit)', () => {
    // Fri 2026-09-04 done, Sat/Sun off, Mon 2026-09-07 not yet done → streak 1
    const s = currentStreak(set(['2026-09-04']), '1111100', '2026-09-07')
    expect(s).toBe(1)
  })
  it('weekend-off streak accumulates across the weekend', () => {
    // Mon 08-31 .. Fri 09-04 all done, weekend off, Mon 09-07 done
    const done = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07']
    expect(currentStreak(set(done), '1111100', '2026-09-07')).toBe(6)
  })
  it('month boundary: Aug 31 -> Sep 1 continuity', () => {
    const done = ['2026-08-30', '2026-08-31', '2026-09-01']
    expect(currentStreak(set(done), ALL, '2026-09-01')).toBe(3)
  })
  it('leap-year boundary: Feb 28 -> Feb 29 -> Mar 1 (2024)', () => {
    const done = ['2024-02-28', '2024-02-29', '2024-03-01']
    expect(currentStreak(set(done), ALL, '2024-03-01')).toBe(3)
  })
  it('empty history → 0; brand-new habit done today → 1', () => {
    expect(currentStreak(set([]), ALL, '2026-09-06')).toBe(0)
    expect(currentStreak(set(['2026-09-06']), ALL, '2026-09-06')).toBe(1)
  })
})

describe('longestStreak', () => {
  const ALL = '1111111'
  it('finds the best run across a mid-history gap', () => {
    const done = ['2026-09-01', '2026-09-02', '2026-09-05', '2026-09-06', '2026-09-07']
    expect(longestStreak(done, ALL)).toBe(3)
  })
  it('ignores unscheduled-day gaps', () => {
    const done = ['2026-09-04', '2026-09-07'] // Fri, Mon — weekend in between
    expect(longestStreak(done, '1111100')).toBe(2)
  })
  it('handles empty and single-day histories', () => {
    expect(longestStreak([], ALL)).toBe(0)
    expect(longestStreak(['2026-09-06'], ALL)).toBe(1)
  })
})

describe('completionRate', () => {
  it('counts done/scheduled over the window', () => {
    // Sep 1–7 (Mon–Sun): 4 done of 7 scheduled
    const done = set(['2026-09-01', '2026-09-02', '2026-09-04', '2026-09-06'])
    expect(completionRate(done, '1111111', '2026-09-01', '2026-09-07')).toBeCloseTo(4 / 7)
  })
  it('excludes future days when today is inside the window', () => {
    const done = set(['2026-09-06'])
    // window ends 09-30 but today is 09-06 → denominator = Sep 1..6 scheduled
    expect(completionRate(done, '1111111', '2026-09-01', '2026-09-30', '2026-09-06')).toBeCloseTo(1 / 6)
  })
  it('weekend-off habit: scheduled denominator shrinks', () => {
    const done = set(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'])
    expect(completionRate(done, '1111100', '2026-09-01', '2026-09-06')).toBe(1) // Mon–Fri, all done
  })
  it('0 when nothing scheduled in range; 0 for inverted range', () => {
    expect(completionRate(set([]), '0000000', '2026-09-01', '2026-09-07')).toBe(0)
    expect(completionRate(set(['2026-09-01']), '1111111', '2026-09-07', '2026-09-01')).toBe(0)
  })
})

describe('buildingProgress (66-day mode)', () => {
  it('start day counts as day 1', () => {
    const p = buildingProgress('2026-09-06', 66, '2026-09-06')
    expect(p.day).toBe(1)
    expect(p.daysLeft).toBe(65)
    expect(p.built).toBe(false)
  })
  it('clamps to the window and flips to built exactly at day 66', () => {
    const at65 = buildingProgress('2026-09-06', 66, '2026-11-09')
    expect(at65.day).toBe(65)
    expect(at65.built).toBe(false)
    const at66 = buildingProgress('2026-09-06', 66, '2026-11-10')
    expect(at66.day).toBe(66)
    expect(at66.built).toBe(true)
    expect(at66.daysLeft).toBe(0)
    expect(at66.pct).toBe(100)
  })
  it('long-past start stays clamped at 100%', () => {
    const p = buildingProgress('2026-01-01', 66, '2026-09-06')
    expect(p.built).toBe(true)
    expect(p.pct).toBe(100)
  })
  it('today before startDate → day 0', () => {
    const p = buildingProgress('2026-09-10', 66, '2026-09-06')
    expect(p.day).toBe(0)
    expect(p.pct).toBe(0)
  })
})

describe('heatmapDays', () => {
  it('marks done/missed/null correctly over a 7-day window ending today', () => {
    // Mon 08-31 + Fri 09-04 done; Tue–Thu scheduled but missed
    const days = heatmapDays(set(['2026-08-31', '2026-09-04']), '1111100', '2026-09-06', 7)
    expect(days).toHaveLength(7)
    expect(days[0].iso).toBe('2026-08-31')
    // 08-31 Monday scheduled + done → true
    expect(days[0].done).toBe(true)
    // 09-01 Tuesday scheduled, not done → false
    expect(days[1].done).toBe(false)
    // 09-04 Friday done → true
    expect(days[4].done).toBe(true)
    // 09-05 Sat / 09-06 Sun: not scheduled → null
    expect(days[5].done).toBeNull()
    expect(days[6].done).toBeNull()
  })
})

describe('journal helpers', () => {
  it('journalStreak: today missing does not break, yesterday missing does', () => {
    const dates = set(['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'])
    expect(journalStreak(dates, '2026-09-05')).toBe(4)
    expect(journalStreak(dates, '2026-09-06')).toBe(4) // grace for today
    expect(journalStreak(dates, '2026-09-07')).toBe(0) // 06th missing, day over
  })
  it('filterEntries: search, mood and tag AND together, case-insensitive', () => {
    const entries = [
      { title: 'Morning pages', content: 'Grateful for chai', mood: 'good', tags: ['gratitude'], date: '2026-09-01' },
      { title: 'Wins', content: 'Shipped the RD engine', mood: 'great', tags: ['work'], date: '2026-09-02' },
      { title: 'Slow day', content: 'Rest is work too', mood: 'low', tags: ['rest'], date: '2026-09-03' },
    ]
    expect(filterEntries(entries, { q: 'RD' })).toHaveLength(1)
    expect(filterEntries(entries, { q: 'grateful' })).toHaveLength(1)
    expect(filterEntries(entries, { mood: 'great' })).toHaveLength(1)
    expect(filterEntries(entries, { tag: 'rest' })).toHaveLength(1)
    // 'Rest is work too' matches BOTH q=work and mood=low → 1
    expect(filterEntries(entries, { q: 'work', mood: 'low' })).toHaveLength(1)
    // entry 2 has tag 'work' + mood 'great' → tags are searchable too → 1
    expect(filterEntries(entries, { q: 'work', mood: 'great' })).toHaveLength(1)
    // 'grateful' lives in content of mood=good entry only
    expect(filterEntries(entries, { q: 'chai', mood: 'great' })).toHaveLength(0)
  })
  it('sanitizeTags: strips separators, dedupes, caps 8×24', () => {
    expect(sanitizeTags(['work', 'Work', ' deep work', '', 'money; #2'])).toBe('work,deep work,money #2')
    expect(sanitizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toBe(
      't0,t1,t2,t3,t4,t5,t6,t7',
    )
    expect(sanitizeTags(['x'.repeat(40)])).toBe('x'.repeat(24))
  })
  it('parseTags round-trips', () => {
    expect(parseTags('a,b,c')).toEqual(['a', 'b', 'c'])
    expect(parseTags('')).toEqual([])
  })
  it('isMood guards the mood union', () => {
    expect(isMood('great')).toBe(true)
    expect(isMood('meh')).toBe(false)
  })
})

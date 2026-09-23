// Phase 16 — Books & Reader pure math: streaks, pace, ETA, progress %,
// daily-quote rotation, tags. All functions take an injectable "today"
// (Decision #8) so tests control time.

import { describe, expect, it } from 'vitest'
import {
  BOOK_STATUS_META,
  dailyQuoteIndex,
  etaDays,
  hashString,
  isBookFormat,
  isBookStatus,
  isHighlightColor,
  isPageBased,
  minutesInWindow,
  minutesPerDay,
  normalizeRating,
  pageProgressPct,
  pagesInWindow,
  pagesPace,
  parseTags,
  pickDailyQuote,
  progressPct,
  readingDaysInWindow,
  readingStreak,
  remainingPages,
  serializeTags,
  sortQuotesForRotation,
  type SessionLike,
} from '@/lib/reading'

const T = '2026-09-20' // a Sunday, per the fixed test clock

function sessions(spec: Record<string, [number, number]>): SessionLike[] {
  return Object.entries(spec).map(([date, [minutes, pages]]) => ({ date, minutes, pages }))
}

describe('guards & vocab', () => {
  it('format/status/color guards', () => {
    expect(isBookFormat('epub')).toBe(true)
    expect(isBookFormat('audiobook')).toBe(false)
    expect(isBookStatus('reading')).toBe(true)
    expect(isBookStatus('READING')).toBe(false)
    expect(isHighlightColor('yellow')).toBe(true)
    expect(isHighlightColor('orange')).toBe(false)
  })

  it('isPageBased: physical + pdf yes, epub no', () => {
    expect(isPageBased('physical')).toBe(true)
    expect(isPageBased('pdf')).toBe(true)
    expect(isPageBased('epub')).toBe(false)
  })

  it('status meta covers every status', () => {
    for (const s of ['to_read', 'reading', 'finished', 'abandoned'] as const) {
      expect(BOOK_STATUS_META[s].label.length).toBeGreaterThan(0)
    }
  })
})

describe('progress', () => {
  it('pageProgressPct: 2-decimal, clamped, null on unknown totals', () => {
    expect(pageProgressPct(123, 480)).toBe(25.62) // 25.625 floored by IEEE-754 (Math.round(v*100)/100, repo convention)
    expect(pageProgressPct(50, 200)).toBe(25)
    expect(pageProgressPct(0, 300)).toBe(0)
    expect(pageProgressPct(350, 300)).toBe(100) // sloppy entry clamps
    expect(pageProgressPct(10, 0)).toBeNull()
    expect(pageProgressPct(10, -5)).toBeNull()
    expect(pageProgressPct(NaN, 100)).toBeNull()
  })

  it('progressPct unifies the two systems', () => {
    expect(progressPct('physical', { currentPage: 50, totalPages: 200, percent: null })).toBe(25)
    expect(progressPct('pdf', { currentPage: 1, totalPages: 3, percent: null })).toBe(33.33)
    expect(progressPct('epub', { currentPage: 0, totalPages: 0, percent: 62.456 })).toBe(62.46)
    expect(progressPct('epub', { currentPage: 0, totalPages: 0, percent: null })).toBeNull()
    expect(progressPct('epub', { currentPage: 0, totalPages: 0, percent: 140 })).toBe(100)
    expect(progressPct('epub', { currentPage: 0, totalPages: 0, percent: -3 })).toBe(0)
  })

  it('remainingPages: never negative, null without totals', () => {
    expect(remainingPages(80, 300)).toBe(220)
    expect(remainingPages(350, 300)).toBe(0)
    expect(remainingPages(0, 0)).toBeNull()
  })
})

describe('readingStreak', () => {
  it('counts consecutive reading days back from today', () => {
    const s = sessions({ '2026-09-20': [30, 10], '2026-09-19': [20, 8], '2026-09-18': [0, 0], '2026-09-17': [45, 15] })
    // today logged → walk today→yesterday; 18th has only a 0-minute session → stops
    expect(readingStreak(s, T)).toBe(2)
  })

  it('grace: an un-logged today does not break the streak', () => {
    const s = sessions({ '2026-09-19': [30, 10], '2026-09-18': [20, 8] })
    expect(readingStreak(s, T)).toBe(2)
  })

  it('a past gap breaks the streak', () => {
    const s = sessions({ '2026-09-20': [30, 10], '2026-09-18': [20, 8], '2026-09-17': [10, 4] })
    expect(readingStreak(s, T)).toBe(1)
  })

  it('empty vault of sessions → 0', () => {
    expect(readingStreak([], T)).toBe(0)
  })

  it('multiple sessions on the same day count once as a day', () => {
    const s = [...sessions({ '2026-09-20': [15, 5] }), ...sessions({ '2026-09-20': [25, 6] })]
    expect(readingStreak(s, T)).toBe(1)
  })
})

describe('windows', () => {
  const s = sessions({ '2026-09-14': [30, 12], '2026-09-19': [45, 20], '2026-09-20': [25, 10], '2026-09-25': [99, 40] })

  it('minutesInWindow is inclusive and future-clamped', () => {
    expect(minutesInWindow(s, '2026-09-14', '2026-09-20', T)).toBe(100)
    expect(minutesInWindow(s, '2026-09-14', '2026-09-30', T)).toBe(100) // 25th clamped out
    expect(minutesInWindow(s, '2026-09-21', '2026-09-30', T)).toBe(0)
    expect(minutesInWindow(s, '2026-09-30', '2026-09-14', T)).toBe(0) // inverted window
  })

  it('pagesInWindow mirrors minutes', () => {
    expect(pagesInWindow(s, '2026-09-14', '2026-09-20', T)).toBe(42)
  })

  it('readingDaysInWindow counts days with >0 minutes', () => {
    const s2 = [...s, ...sessions({ '2026-09-16': [0, 3] })] // 0-minute day doesn't count
    expect(readingDaysInWindow(s2, '2026-09-14', '2026-09-20', T)).toBe(3)
  })

  it('minutesPerDay averages over the calendar window (2-decimal)', () => {
    expect(minutesPerDay(s, T, 7)).toBe(Math.round((100 / 7) * 100) / 100)
    expect(minutesPerDay(s, T, 0)).toBe(0)
  })
})

describe('pace & ETA', () => {
  it('pagesPace divides by elapsed days since start, not the full window', () => {
    // book started yesterday: 40 pages in 2 elapsed days → 20/day
    const s = sessions({ '2026-09-19': [60, 30], '2026-09-20': [30, 10] })
    expect(pagesPace(s, T, '2026-09-19', 14)).toBe(20)
  })

  it('pagesPace uses the window floor when the book started earlier', () => {
    const s = sessions({ '2026-09-14': [60, 14] }) // 7-day window → 2/day
    expect(pagesPace(s, T, '2025-01-01', 7)).toBe(2)
  })

  it('pagesPace: no pages → null', () => {
    expect(pagesPace([], T, '2026-09-01', 14)).toBeNull()
  })

  it('etaDays rounds up and gates on status/pace', () => {
    expect(etaDays('physical', { currentPage: 100, totalPages: 300, status: 'reading' }, 20)).toBe(10)
    expect(etaDays('physical', { currentPage: 100, totalPages: 305, status: 'reading' }, 20)).toBe(11) // ceil
    expect(etaDays('physical', { currentPage: 300, totalPages: 300, status: 'reading' }, 20)).toBe(0)
    expect(etaDays('physical', { currentPage: 100, totalPages: 300, status: 'finished' }, 20)).toBeNull()
    expect(etaDays('physical', { currentPage: 100, totalPages: 300, status: 'reading' }, null)).toBeNull()
    expect(etaDays('epub', { currentPage: 0, totalPages: 0, status: 'reading' }, 20)).toBeNull()
  })
})

describe('tags', () => {
  it('parseTags trims, dedupes case-insensitively, caps 6×24', () => {
    expect(parseTags(' mindset , stoicism,mindset,  ')).toEqual(['mindset', 'stoicism'])
    expect(parseTags(null)).toEqual([])
    const many = Array.from({ length: 10 }, (_, i) => `tag${i + 1}`)
    expect(parseTags(many.join(','))).toHaveLength(6)
    expect(parseTags(`${'x'.repeat(40)},y`)).toEqual(['x'.repeat(24), 'y'])
  })

  it('serializeTags round-trips through parseTags', () => {
    expect(serializeTags(['a', 'b c', 'd'])).toBe('a, b c, d')
    expect(serializeTags(['a', 'A'])).toBe('a')
  })
})

describe('daily quote rotation', () => {
  it('hashString is stable and unsigned', () => {
    expect(hashString('2026-09-20')).toBe(hashString('2026-09-20'))
    expect(hashString('2026-09-20')).toBeGreaterThanOrEqual(0)
    expect(hashString('2026-09-21')).not.toBe(hashString('2026-09-20'))
  })

  it('dailyQuoteIndex is deterministic and in-bounds, null when empty', () => {
    const idx = dailyQuoteIndex(5, T)
    expect(idx).toBe(dailyQuoteIndex(5, T))
    expect(idx!).toBeGreaterThanOrEqual(0)
    expect(idx!).toBeLessThan(5)
    expect(dailyQuoteIndex(0, T)).toBeNull()
    expect(dailyQuoteIndex(-3, T)).toBeNull()
  })

  it('the rotation walks across days', () => {
    const count = 5
    const seq = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].map((d) => dailyQuoteIndex(count, d))
    expect(new Set(seq).size).toBeGreaterThan(1) // actually moves
  })

  it('sortQuotesForRotation: favorites first, then id order — stable', () => {
    const q = [
      { id: 'c', favorite: false },
      { id: 'b', favorite: true },
      { id: 'a', favorite: true },
    ]
    expect(sortQuotesForRotation(q).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('pickDailyQuote: favorites get their own cycle; empty → null', () => {
    const quotes = [
      { id: 'q1', favorite: false },
      { id: 'q2', favorite: true },
      { id: 'q3', favorite: false },
    ]
    const pick = pickDailyQuote(quotes, T)
    expect(pick?.id).toBe('q2') // only favorite — pool of one
    expect(pickDailyQuote([], T)).toBeNull()
  })

  it('pickDailyQuote without favorites rotates the whole vault deterministically', () => {
    const quotes = [
      { id: 'q1', favorite: false },
      { id: 'q2', favorite: false },
      { id: 'q3', favorite: false },
    ]
    const direct = quotes[dailyQuoteIndex(3, T)!]
    expect(pickDailyQuote(quotes, T)?.id).toBe(direct.id)
  })
})

describe('normalizeRating', () => {
  it('keeps 1..5 integers, nulls everything else', () => {
    expect(normalizeRating(3)).toBe(3)
    expect(normalizeRating(1)).toBe(1)
    expect(normalizeRating(5)).toBe(5)
    expect(normalizeRating(0)).toBeNull()
    expect(normalizeRating(6)).toBeNull()
    expect(normalizeRating(4.5)).toBeNull()
    expect(normalizeRating(null)).toBeNull()
    expect(normalizeRating(undefined)).toBeNull()
  })
})

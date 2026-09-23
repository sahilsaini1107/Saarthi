import { describe, expect, it } from 'vitest'
import {
  ageLabel,
  daysInPipeline,
  iceBand,
  iceScore,
  ideaStats,
  nextPipelineStatus,
  round2,
  sortForAction,
  sparkOfTheDay,
  statusRank,
  type IdeaLike,
} from '@/lib/ideas'

const idea = (over: Partial<IdeaLike> = {}): IdeaLike => ({
  id: 'i1',
  title: 'An idea',
  status: 'spark',
  impact: 5,
  confidence: 5,
  effort: 5,
  ...over,
})

describe('iceScore — impact × confidence ÷ effort', () => {
  it('computes clean divisions', () => {
    expect(iceScore(5, 5, 5)).toBe(5)
    expect(iceScore(10, 10, 1)).toBe(100)
    expect(iceScore(1, 1, 10)).toBe(0.1)
    expect(iceScore(9, 3, 1)).toBe(27)
  })

  it('rounds to exactly 2 decimals (repo convention)', () => {
    expect(iceScore(7, 8, 3)).toBe(18.67) // 18.666…
    expect(iceScore(8, 7, 6)).toBe(9.33) // 9.333…
    expect(iceScore(2, 3, 7)).toBe(0.86) // 0.857…
    expect(iceScore(1, 1, 3)).toBe(0.33) // 0.333…
  })

  it('rejects out-of-range or non-integer inputs with null — no fake scores', () => {
    expect(iceScore(0, 5, 5)).toBeNull()
    expect(iceScore(5, 11, 5)).toBeNull()
    expect(iceScore(5.5, 5, 5)).toBeNull()
    expect(iceScore(5, 5, 0)).toBeNull()
    expect(iceScore(-1, 5, 5)).toBeNull()
  })

  it('round2 matches the shared convention (deterministic in this engine)', () => {
    expect(round2(1.005)).toBe(1)
    expect(round2(2.675)).toBe(2.68) // V8 computes 2.675*100 = 267.50000000000006
    expect(round2(3.14159)).toBe(3.14)
  })
})

describe('iceBand — chip color banding', () => {
  it('strong ≥ 15, promising ≥ 8, otherwise seed; null is a seed', () => {
    expect(iceBand(100)).toBe('strong')
    expect(iceBand(15)).toBe('strong')
    expect(iceBand(14.99)).toBe('promising')
    expect(iceBand(8)).toBe('promising')
    expect(iceBand(7.99)).toBe('seed')
    expect(iceBand(0)).toBe('seed')
    expect(iceBand(null)).toBe('seed')
  })
})

describe('pipeline ordering', () => {
  it('ranks forward stages and hands out the next stage', () => {
    expect(statusRank('spark')).toBe(0)
    expect(statusRank('exploring')).toBe(1)
    expect(statusRank('planned')).toBe(2)
    expect(statusRank('launched')).toBe(3)
    expect(nextPipelineStatus('spark')).toBe('exploring')
    expect(nextPipelineStatus('exploring')).toBe('planned')
    expect(nextPipelineStatus('planned')).toBeNull() // launch is deliberate
    expect(nextPipelineStatus('parked')).toBeNull()
  })

  it('sortForAction: forward stages first, then score desc, then title', () => {
    const list = [
      idea({ id: 'a', title: 'Planned low', status: 'planned', impact: 2, confidence: 2, effort: 2 }), // 2
      idea({ id: 'b', title: 'Spark high', status: 'spark', impact: 9, confidence: 9, effort: 3 }), // 27
      idea({ id: 'c', title: 'Spark low', status: 'spark', impact: 2, confidence: 3, effort: 3 }), // 2
      idea({ id: 'd', title: 'Exploring', status: 'exploring', impact: 5, confidence: 5, effort: 5 }), // 5
    ]
    expect(sortForAction(list).map((i) => i.id)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('sortForAction breaks score ties by title', () => {
    const list = [
      idea({ id: 'b', title: 'Bravo', impact: 5, confidence: 5, effort: 5 }),
      idea({ id: 'a', title: 'Alpha', impact: 5, confidence: 5, effort: 5 }),
    ]
    expect(sortForAction(list).map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('sparkOfTheDay — deterministic rotation', () => {
  const pool = [idea({ id: 'a' }), idea({ id: 'b' }), idea({ id: 'c' }), idea({ id: 'd' }), idea({ id: 'e' })]

  it('returns null on an empty pool and a pool member otherwise', () => {
    expect(sparkOfTheDay([], '2026-09-20')).toBeNull()
    const pick = sparkOfTheDay(pool, '2026-09-20')
    expect(pick).not.toBeNull()
    expect(pool.some((p) => p.id === pick!.id)).toBe(true)
  })

  it('is stable within a day and deterministic across runs', () => {
    expect(sparkOfTheDay(pool, '2026-09-20')).toEqual(sparkOfTheDay(pool, '2026-09-20'))
    expect(sparkOfTheDay(pool, '2026-09-20')!.id).toBe(sparkOfTheDay(pool, '2026-09-20')!.id)
  })

  it('rotates across days (a 5-pool must not pick one idea 60 days straight)', () => {
    const picks = new Set<string>()
    let day = '2026-06-01'
    for (let i = 0; i < 60; i++) {
      picks.add(sparkOfTheDay(pool, day)!.id)
      day = shift(day, 1)
    }
    expect(picks.size).toBeGreaterThan(1)
  })

  it('follows the pool: id-sorted indexing (hash % length)', () => {
    // direct formula check for a known day — guards against accidental shuffling
    const two = [idea({ id: 'x' }), idea({ id: 'y' })]
    const expected = ['x', 'y'][hashOfDay('2026-09-20') % 2]
    expect(sparkOfTheDay(two, '2026-09-20')!.id).toBe(expected)
  })
})

describe('ideaStats — pipeline math', () => {
  it('counts every status and the live pipeline', () => {
    const items = [
      idea({ status: 'spark' }),
      idea({ status: 'spark' }),
      idea({ status: 'exploring' }),
      idea({ status: 'planned' }),
      idea({ status: 'launched' }),
      idea({ status: 'parked' }),
      idea({ status: 'dropped' }),
    ]
    const s = ideaStats(items)
    expect(s.total).toBe(7)
    expect(s.sparks).toBe(2)
    expect(s.exploring).toBe(1)
    expect(s.planned).toBe(1)
    expect(s.launched).toBe(1)
    expect(s.parked).toBe(1)
    expect(s.dropped).toBe(1)
    expect(s.pipelineCount).toBe(4)
  })

  it('avgIce averages the live pipeline only, 2-decimal', () => {
    const items = [
      idea({ status: 'spark', impact: 7, confidence: 8, effort: 3 }), // 18.67
      idea({ status: 'exploring', impact: 5, confidence: 5, effort: 5 }), // 5
      idea({ status: 'launched', impact: 10, confidence: 10, effort: 1 }), // excluded
    ]
    expect(ideaStats(items).avgIce).toBe(11.84) // (18.67 + 5) / 2 = 11.835 → round-half-up 11.84
  })

  it('avgIce is null when the pipeline is empty', () => {
    expect(ideaStats([idea({ status: 'launched' })]).avgIce).toBeNull()
    expect(ideaStats([]).avgIce).toBeNull()
  })

  it('bestIce ignores parked and dropped, includes launched', () => {
    const items = [
      idea({ status: 'parked', impact: 10, confidence: 10, effort: 1 }), // 100 — ignored
      idea({ status: 'dropped', impact: 10, confidence: 10, effort: 1 }), // 100 — ignored
      idea({ status: 'launched', impact: 9, confidence: 9, effort: 1 }), // 81
      idea({ status: 'spark', impact: 8, confidence: 8, effort: 4 }), // 16
    ]
    expect(ideaStats(items).bestIce).toBe(81)
    expect(ideaStats([]).bestIce).toBeNull()
  })
})

describe('daysInPipeline & ageLabel', () => {
  it('measures calendar age with month-end and leap safety, floor 0', () => {
    expect(daysInPipeline('2026-09-20', '2026-09-20')).toBe(0)
    expect(daysInPipeline('2026-08-31', '2026-09-01')).toBe(1)
    expect(daysInPipeline('2024-02-29', '2024-03-01')).toBe(1)
    expect(daysInPipeline('2025-12-31', '2026-01-02')).toBe(2)
    expect(daysInPipeline('2026-09-25', '2026-09-20')).toBe(0) // future-dated row can't go negative
  })

  it('ageLabel reads like a human', () => {
    expect(ageLabel(0)).toBe('today')
    expect(ageLabel(3)).toBe('3d')
    expect(ageLabel(45)).toBe('45d')
    expect(ageLabel(60)).toBe('2mo')
    expect(ageLabel(400)).toBe('1y+')
  })
})

/* ---------- helpers ---------- */

function shift(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function hashOfDay(iso: string): number {
  // FNV-1a 32-bit, mirrors lib/reading.ts hashString used by sparkOfTheDay
  let h = 0x811c9dc5
  for (let i = 0; i < iso.length; i++) {
    h ^= iso.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

import { describe, expect, it } from 'vitest'
import { daysUntil, goalHealth, goalProgress, milestoneProgress, normalizeReorder } from '@/lib/goals'

// Hand-traced roll-up scenarios (Golden Rule: verify against manual math).
// Rules (Decision #18): milestone with tasks = done-tasks ratio; without
// tasks = manual flag. Goal progress = mean over milestones + direct tasks.

const task = (milestoneId: string | null, done: boolean) => ({ milestoneId, done })

describe('milestoneProgress', () => {
  it('with tasks: ratio of done tasks', () => {
    expect(milestoneProgress({ done: false, tasks: [task('m1', true), task('m1', false)] })).toBe(0.5)
    expect(milestoneProgress({ done: false, tasks: [task('m1', true), task('m1', true)] })).toBe(1)
    expect(milestoneProgress({ done: false, tasks: [] })).toBe(0)
  })
  it('without tasks: the manual done flag decides', () => {
    expect(milestoneProgress({ done: true, tasks: [] })).toBe(1)
    expect(milestoneProgress({ done: false, tasks: [] })).toBe(0)
  })
  it('manual flag cannot fake completion when tasks exist', () => {
    // a milestone with 2 undone tasks reads 0 even if someone toggled done
    expect(milestoneProgress({ done: true, tasks: [task('m1', false), task('m1', false)] })).toBe(0)
  })
})

describe('goalProgress', () => {
  it('averages milestone progress with direct tasks', () => {
    const m1 = { id: 'm1', done: false, tasks: [task('m1', true), task('m1', false)] } // 0.5
    const m2 = { id: 'm2', done: true, tasks: [] } // 1.0
    // (0.5 + 1.0 + 1.0 direct) / 3 = 0.8333…
    expect(goalProgress([m1, m2], [task(null, true)])).toBeCloseTo(0.8333, 4)
  })
  it('milestone tasks do not double count as direct tasks', () => {
    const m1 = { id: 'm1', done: false, tasks: [task('m1', true), task('m1', false)] } // 0.5
    expect(goalProgress([m1], [task('m1', true), task('m1', false)])).toBe(0.5)
  })
  it('empty goal sits at 0', () => {
    expect(goalProgress([], [])).toBe(0)
  })
})

describe('goalHealth', () => {
  const today = '2026-09-06'
  it('achieved wins over everything', () => {
    expect(goalHealth('achieved', '2026-08-01', today)).toBe('done')
  })
  it('overdue / due-soon (≤7d) / on-track / no deadline', () => {
    expect(goalHealth('active', '2026-09-05', today)).toBe('overdue')
    expect(goalHealth('active', '2026-09-06', today)).toBe('due_soon')
    expect(goalHealth('active', '2026-09-13', today)).toBe('due_soon')
    expect(goalHealth('active', '2026-09-14', today)).toBe('on_track')
    expect(goalHealth('active', null, today)).toBe('no_deadline')
  })
})

describe('daysUntil', () => {
  it('crosses month boundaries and leap Februaries', () => {
    expect(daysUntil('2026-09-13', '2026-09-06')).toBe(7)
    expect(daysUntil('2026-10-06', '2026-09-06')).toBe(30)
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1)
    expect(daysUntil('2024-02-29', '2024-02-28')).toBe(1) // leap day
    expect(daysUntil('2026-09-05', '2026-09-06')).toBe(-1)
  })
})

describe('normalizeReorder (Phase 12 drag-and-drop)', () => {
  it('accepts an exact permutation and returns id → new order', () => {
    expect(normalizeReorder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual({ c: 0, a: 1, b: 2 })
    expect(normalizeReorder(['a'], ['a'])).toEqual({ a: 0 })
    expect(normalizeReorder([], [])).toEqual({}) // empty goal = no-op success
  })
  it('rejects payloads that are not permutations', () => {
    expect(normalizeReorder(['a', 'b', 'c'], ['a', 'b'])).toBeNull() // missing id
    expect(normalizeReorder(['a', 'b'], ['a', 'b', 'c'])).toBeNull() // unknown id
    expect(normalizeReorder(['a', 'b'], ['a', 'a'])).toBeNull() // duplicate
    expect(normalizeReorder(['a', 'b'], ['b', 'x'])).toBeNull() // unknown swap-in
    expect(normalizeReorder([], ['a'])).toBeNull()
  })
})

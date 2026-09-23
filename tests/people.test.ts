import { describe, expect, it } from 'vitest'
import {
  cadenceFor,
  daysSince,
  IMPORTANCE_CADENCE,
  lastTouchDate,
  personCategoryMeta,
  reconnectRank,
  reconnectState,
  recentTouchStrip,
  sortForReconnect,
  toTouches,
  touchesInWindow,
  type TouchLike,
} from '@/lib/people'
import { shiftISO } from '@/lib/date'

const T = (date: string, type = 'call'): TouchLike => ({ date, type })

describe('cadence defaults + override', () => {
  it('importance maps to the documented defaults', () => {
    expect(IMPORTANCE_CADENCE[3]).toBe(14)
    expect(IMPORTANCE_CADENCE[2]).toBe(30)
    expect(IMPORTANCE_CADENCE[1]).toBe(90)
    expect(cadenceFor(3)).toBe(14)
    expect(cadenceFor(2)).toBe(30)
    expect(cadenceFor(1)).toBe(90)
  })

  it('unknown importance falls back to regular (30)', () => {
    expect(cadenceFor(99)).toBe(30)
    expect(cadenceFor(0)).toBe(30)
  })

  it('explicit override wins and is clamped to ≥1', () => {
    expect(cadenceFor(3, 7)).toBe(7)
    expect(cadenceFor(1, 365)).toBe(365)
    expect(cadenceFor(2, 0)).toBe(1)
    expect(cadenceFor(2, -10)).toBe(1)
    expect(cadenceFor(2, 7.6)).toBe(8) // rounds
    expect(cadenceFor(2, null)).toBe(30)
  })
})

describe('daysSince — leap years, month ends, same day', () => {
  it('same day = 0', () => {
    expect(daysSince('2026-09-20', '2026-09-20')).toBe(0)
  })

  it('crosses month ends correctly', () => {
    expect(daysSince('2026-08-31', '2026-09-01')).toBe(1)
    expect(daysSince('2026-08-15', '2026-09-14')).toBe(30)
  })

  it('handles the leap day (Feb 29)', () => {
    expect(daysSince('2024-02-28', '2024-02-29')).toBe(1)
    expect(daysSince('2024-02-29', '2024-03-01')).toBe(1)
    expect(daysSince('2023-02-28', '2023-03-01')).toBe(1) // non-leap
  })

  it('year rollover', () => {
    expect(daysSince('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysSince('2025-01-01', '2026-01-01')).toBe(365)
    expect(daysSince('2024-01-01', '2025-01-01')).toBe(366) // leap year
  })
})

describe('reconnectState — the due engine', () => {
  it('never touched → status never', () => {
    const s = reconnectState(null, 14, '2026-09-20')
    expect(s.status).toBe('never')
    expect(s.dueInDays).toBe(0)
    expect(s.daysSinceLast).toBeNull()
  })

  it('inside the window → ok with positive dueInDays', () => {
    // touched 7 days ago, cadence 14 → 7 days left
    const s = reconnectState(shiftISO('2026-09-20', -7), 14, '2026-09-20')
    expect(s.status).toBe('ok')
    expect(s.dueInDays).toBe(7)
    expect(s.daysSinceLast).toBe(7)
  })

  it('boundary: touched exactly cadence days ago → due today', () => {
    const s = reconnectState('2026-09-06', 14, '2026-09-20')
    expect(s.daysSinceLast).toBe(14)
    expect(s.status).toBe('due')
    expect(s.dueInDays).toBe(0)
  })

  it('boundary +1 → overdue by that many days', () => {
    const s = reconnectState('2026-09-05', 14, '2026-09-20')
    expect(s.status).toBe('overdue')
    expect(s.dueInDays).toBe(-1)
  })

  it('touched today is always ok (even the freshest possible)', () => {
    const s = reconnectState('2026-09-20', 14, '2026-09-20')
    expect(s.status).toBe('ok')
    expect(s.dueInDays).toBe(14)
  })

  it('a back-dated touch inside the window fixes an overdue badge', () => {
    // logged a meet-up 3 days ago on a person whose cadence is 7
    const s = reconnectState(shiftISO('2026-09-20', -3), 7, '2026-09-20')
    expect(s.status).toBe('ok')
    expect(s.dueInDays).toBe(4)
  })
})

describe('reconnectRank + sortForReconnect', () => {
  it('ranks overdue < never < due < ok', () => {
    expect(reconnectRank({ status: 'overdue', dueInDays: -2, daysSinceLast: 16 })).toBe(0)
    expect(reconnectRank({ status: 'never', dueInDays: 0, daysSinceLast: null })).toBe(1)
    expect(reconnectRank({ status: 'due', dueInDays: 0, daysSinceLast: 14 })).toBe(2)
    expect(reconnectRank({ status: 'ok', dueInDays: 5, daysSinceLast: 9 })).toBe(3)
  })

  it('sorts most-overdue first, then never, due, and soonest-ok', () => {
    const rows = [
      { name: 'ok-far', name2: '', reconnect: { status: 'ok' as const, dueInDays: 20, daysSinceLast: 10 } },
      { name: 'ok-soon', name2: '', reconnect: { status: 'ok' as const, dueInDays: 2, daysSinceLast: 28 } },
      { name: 'never', name2: '', reconnect: { status: 'never' as const, dueInDays: 0, daysSinceLast: null } },
      { name: 'overdue-1', name2: '', reconnect: { status: 'overdue' as const, dueInDays: -1, daysSinceLast: 15 } },
      { name: 'overdue-9', name2: '', reconnect: { status: 'overdue' as const, dueInDays: -9, daysSinceLast: 39 } },
      { name: 'due', name2: '', reconnect: { status: 'due' as const, dueInDays: 0, daysSinceLast: 30 } },
    ]
    const sorted = sortForReconnect(rows)
    expect(sorted.map((r) => r.name)).toEqual(['overdue-9', 'overdue-1', 'never', 'due', 'ok-soon', 'ok-far'])
  })

  it('does not mutate the input array', () => {
    const rows = [
      { name: 'b', reconnect: { status: 'ok' as const, dueInDays: 5, daysSinceLast: 5 } },
      { name: 'a', reconnect: { status: 'ok' as const, dueInDays: 5, daysSinceLast: 5 } },
    ]
    sortForReconnect(rows)
    expect(rows.map((r) => r.name)).toEqual(['b', 'a'])
  })
})

describe('touch window helpers', () => {
  it('lastTouchDate picks the max, null when empty', () => {
    expect(lastTouchDate([T('2026-08-01'), T('2026-09-10'), T('2026-08-20')])).toBe('2026-09-10')
    expect(lastTouchDate([])).toBeNull()
  })

  it('touchesInWindow is inclusive across the month end', () => {
    const touches = [T('2026-08-31'), T('2026-09-01'), T('2026-09-10')]
    expect(touchesInWindow(touches, '2026-08-31', '2026-09-10')).toBe(3)
    expect(touchesInWindow(touches, '2026-09-02', '2026-09-30')).toBe(1)
  })

  it('recentTouchStrip counts per day and fills zeros', () => {
    const strip = recentTouchStrip([T('2026-09-19'), T('2026-09-19'), T('2026-09-20')], '2026-09-20', 3)
    expect(strip.map((c) => c.count)).toEqual([0, 2, 1])
  })

  it('toTouches coerces unknown types to other and maps Dates', () => {
    expect(toTouches([{ date: new Date('2026-09-19T00:00:00.000Z'), type: 'weird' }])).toEqual([
      { date: '2026-09-19', type: 'other' },
    ])
    expect(toTouches([{ date: new Date('2026-09-19T00:00:00.000Z'), type: 'meet' }])[0].type).toBe('meet')
  })
})

describe('category meta', () => {
  it('falls back to Other for unknown keys', () => {
    expect(personCategoryMeta('mentor').label).toBe('Mentor')
    expect(personCategoryMeta('zzz').emoji).toBe('👤')
  })
})

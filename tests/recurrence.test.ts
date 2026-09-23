import { describe, expect, it } from 'vitest'
import { advanceDue, anchorDayFor, isDueInMonth, nextDueOnOrAfter, upcomingOccurrences } from '@/lib/recurrence'
import { isoDayUTC, monthRange } from '@/lib/date'

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('advanceDue (bills survive month boundaries)', () => {
  it('monthly: anchor day preserved, clamped in short months, restored after', () => {
    const seq = upcomingOccurrences(d('2024-01-31'), 'monthly', { anchorDay: 31 }, 12).map(isoDayUTC)
    expect(seq).toEqual([
      '2024-01-31',
      '2024-02-29', // leap clamp
      '2024-03-31', // no drift
      '2024-04-30',
      '2024-05-31',
      '2024-06-30',
      '2024-07-31',
      '2024-08-31',
      '2024-09-30',
      '2024-10-31',
      '2024-11-30',
      '2024-12-31',
    ])
  })
  it('quarterly: Jan 31 → Apr 30 → Jul 31', () => {
    const seq = upcomingOccurrences(d('2024-01-31'), 'quarterly', { anchorDay: 31 }, 4).map(isoDayUTC)
    expect(seq).toEqual(['2024-01-31', '2024-04-30', '2024-07-31', '2024-10-31'])
  })
  it('annual: leap-day anchor settles on Feb 28 after a leap year', () => {
    const seq = upcomingOccurrences(d('2024-02-29'), 'annual', { anchorDay: 29 }, 3).map(isoDayUTC)
    expect(seq).toEqual(['2024-02-29', '2025-02-28', '2026-02-28'])
  })
  it('custom_days advances by exact day count', () => {
    const seq = upcomingOccurrences(d('2026-01-01'), 'custom_days', { customDays: 15 }, 3).map(isoDayUTC)
    expect(seq).toEqual(['2026-01-01', '2026-01-16', '2026-01-31'])
  })
  it('single step advance equals the sequence', () => {
    expect(isoDayUTC(advanceDue(d('2024-01-31'), 'monthly', { anchorDay: 31 }))).toBe('2024-02-29')
    expect(isoDayUTC(advanceDue(d('2026-03-05'), 'monthly', { anchorDay: 5 }))).toBe('2026-04-05')
  })
})

describe('nextDueOnOrAfter (catch-up after missed periods)', () => {
  it('advances until the occurrence is on/after today', () => {
    expect(isoDayUTC(nextDueOnOrAfter(d('2024-01-31'), 'monthly', { anchorDay: 31 }, d('2024-03-05')))).toBe('2024-03-31')
    expect(isoDayUTC(nextDueOnOrAfter(d('2024-01-10'), 'monthly', { anchorDay: 10 }, d('2024-01-10')))).toBe('2024-01-10')
    expect(isoDayUTC(nextDueOnOrAfter(d('2024-01-10'), 'monthly', { anchorDay: 10 }, d('2024-04-02')))).toBe('2024-04-10')
  })
})

describe('calendar helpers', () => {
  it('anchorDayFor clamps to month length', () => {
    expect(anchorDayFor(d('2024-02-29'))).toBe(29)
    expect(anchorDayFor(d('2023-02-28'))).toBe(28)
    expect(anchorDayFor(d('2026-09-06'))).toBe(6)
  })
  it('isDueInMonth respects [start, endExclusive)', () => {
    const { start, endExclusive } = monthRange('2026-09')
    expect(isDueInMonth(d('2026-09-06'), start, endExclusive)).toBe(true)
    expect(isDueInMonth(d('2026-08-31'), start, endExclusive)).toBe(false)
    expect(isDueInMonth(d('2026-10-01'), start, endExclusive)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  addMonthsUTC,
  daysBetweenUTC,
  formatDayLabel,
  isValidTimezone,
  monthRange,
  shiftISO,
  todayISO,
  toUTC,
  isoDayUTC,
  shiftMonthKey,
} from '@/lib/date'

describe('todayISO (user-timezone aware)', () => {
  const instant = Date.UTC(2026, 0, 1, 0, 0) // 2026-01-01T00:00Z
  it('resolves the same instant differently per timezone', () => {
    expect(todayISO('Asia/Kolkata', new Date(instant))).toBe('2026-01-01') // 05:30 local
    expect(todayISO('Pacific/Midway', new Date(instant))).toBe('2025-12-31') // UTC-11
    expect(todayISO('Pacific/Kiritimati', new Date(instant))).toBe('2026-01-01') // UTC+14
  })
  it('crosses year boundaries correctly', () => {
    const nye = Date.UTC(2025, 11, 31, 13, 0) // 18:30 Dec 31 in Kolkata
    expect(todayISO('Asia/Kolkata', new Date(nye))).toBe('2025-12-31')
    expect(todayISO('Pacific/Kiritimati', new Date(nye))).toBe('2026-01-01')
    expect(todayISO('Pacific/Midway', new Date(nye))).toBe('2025-12-31')
  })
  it('validates timezone ids', () => {
    expect(isValidTimezone('Asia/Kolkata')).toBe(true)
    expect(isValidTimezone('Not/AZone')).toBe(false)
  })
})

describe('addMonthsUTC (drift-free, month-end clamping)', () => {
  it('clamps into shorter months but preserves the anchor afterwards', () => {
    expect(isoDayUTC(addMonthsUTC(toUTC('2024-01-31'), 1))).toBe('2024-02-29') // leap year
    expect(isoDayUTC(addMonthsUTC(toUTC('2023-01-31'), 1))).toBe('2023-02-28') // non-leap
    expect(isoDayUTC(addMonthsUTC(toUTC('2024-01-31'), 2))).toBe('2024-03-31') // anchor restored
    expect(isoDayUTC(addMonthsUTC(toUTC('2024-03-31'), 1))).toBe('2024-04-30')
    expect(isoDayUTC(addMonthsUTC(toUTC('2024-02-29'), 12))).toBe('2025-02-28')
    expect(isoDayUTC(addMonthsUTC(toUTC('2024-05-15'), 3))).toBe('2024-08-15')
  })
  it('supports explicit anchor day', () => {
    expect(isoDayUTC(addMonthsUTC(toUTC('2024-02-29'), 1, 31))).toBe('2024-03-31')
    expect(isoDayUTC(addMonthsUTC(toUTC('2024-02-29'), 1, 30))).toBe('2024-03-30')
  })
})

describe('monthRange', () => {
  it('handles leap and non-leap February', () => {
    const leap = monthRange('2024-02')
    expect(daysBetweenUTC(leap.start, leap.endExclusive)).toBe(29)
    const normal = monthRange('2026-02')
    expect(daysBetweenUTC(normal.start, normal.endExclusive)).toBe(28)
    expect(leap.start.toISOString()).toBe('2024-02-01T00:00:00.000Z')
  })
})

describe('labels and shifts', () => {
  it('formats day and month labels in UTC', () => {
    expect(formatDayLabel('2026-09-06')).toBe('Sun, 6 Sept')
    expect(shiftISO('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftISO('2024-02-28', 1)).toBe('2024-02-29')
  })
})

describe('shiftMonthKey (Phase 12 digest month stepper)', () => {
  it('shifts within a year and across the Dec/Jan boundary', () => {
    expect(shiftMonthKey('2026-09', 0)).toBe('2026-09')
    expect(shiftMonthKey('2026-09', -1)).toBe('2026-08')
    expect(shiftMonthKey('2026-09', 1)).toBe('2026-10')
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
    expect(shiftMonthKey('2025-12', 1)).toBe('2026-01')
  })
  it('handles multi-month and multi-year deltas', () => {
    expect(shiftMonthKey('2026-03', -14)).toBe('2025-01')
    expect(shiftMonthKey('2026-11', 14)).toBe('2028-01')
    expect(shiftMonthKey('2024-02', 12)).toBe('2025-02') // leap-year source month
  })
})

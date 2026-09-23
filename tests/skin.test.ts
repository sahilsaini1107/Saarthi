import { describe, expect, it } from 'vitest'
import { paoStatus, skinStreak } from '@/lib/skin'

// Hand-traced PAO + AM/PM streak scenarios.
// PAO ladder (Decision #22): expired → ≤7 soon → ≤30 expiring → ok.

describe('paoStatus', () => {
  it('expiry = opened + paoMonths (calendar-accurate)', () => {
    const p = paoStatus('2026-06-01', 6, '2026-09-06')
    expect(p.expiryISO).toBe('2026-12-01')
    expect(p.daysLeft).toBe(86) // Sep 6 → Dec 1: 30−6 → 24 + 30 + 1? hand-check below
    expect(p.level).toBe('ok')
  })
  it('warning ladder boundaries', () => {
    // expiry 2026-12-01
    expect(paoStatus('2026-06-01', 6, '2026-10-01').level).toBe('ok') // 61 days
    expect(paoStatus('2026-06-01', 6, '2026-11-01').level).toBe('expiring') // 30 days (≤30)
    expect(paoStatus('2026-06-01', 6, '2026-11-24').level).toBe('soon') // 7 days (≤7)
    expect(paoStatus('2026-06-01', 6, '2026-11-23').level).toBe('expiring') // 8 days
  })
  it('expired once past the date, with negative days-left', () => {
    const p = paoStatus('2026-06-01', 6, '2026-12-02')
    expect(p.level).toBe('expired')
    expect(p.daysLeft).toBe(-1)
  })
  it('month-end clamp: Jan 31 + 1 month → Feb 28 (2026, non-leap)', () => {
    expect(paoStatus('2026-01-31', 1, '2026-02-27').expiryISO).toBe('2026-02-28')
    expect(paoStatus('2026-01-31', 1, '2026-02-27').level).toBe('soon') // 1 day
    expect(paoStatus('2026-01-31', 1, '2026-03-01').level).toBe('expired')
  })
  it('leap year: Jan 31 + 1 month → Feb 29 (2024)', () => {
    expect(paoStatus('2024-01-31', 1, '2024-02-28').expiryISO).toBe('2024-02-29')
    expect(paoStatus('2024-01-31', 1, '2024-02-28').daysLeft).toBe(1)
  })
  it('products without open date or PAO never warn', () => {
    expect(paoStatus(null, 6, '2026-09-06')).toEqual({ level: 'no_pao', daysLeft: null, expiryISO: null })
    expect(paoStatus('2026-06-01', null, '2026-09-06')).toEqual({ level: 'no_pao', daysLeft: null, expiryISO: null })
    expect(paoStatus('2026-06-01', 0, '2026-09-06').level).toBe('no_pao')
  })
})

describe('skinStreak (am-or-pm, grace rule)', () => {
  const set = (days: string[]) => new Set(days)
  it('counts consecutive days with either checklist', () => {
    expect(skinStreak(set(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']), '2026-09-06')).toBe(5)
  })
  it('today pending never breaks the streak (grace)', () => {
    // today 09-06 not done → walks back from 09-05
    expect(skinStreak(set(['2026-09-03', '2026-09-04', '2026-09-05']), '2026-09-06')).toBe(3)
  })
  it('today done extends the streak', () => {
    expect(skinStreak(set(['2026-09-04', '2026-09-05', '2026-09-06']), '2026-09-06')).toBe(3)
  })
  it('a missed day breaks the chain behind today', () => {
    expect(skinStreak(set(['2026-09-01', '2026-09-02', '2026-09-05']), '2026-09-06')).toBe(1) // 09-05 only
  })
  it('empty history is zero', () => {
    expect(skinStreak(set([]), '2026-09-06')).toBe(0)
  })
})

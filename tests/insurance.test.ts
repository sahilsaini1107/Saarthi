import { describe, expect, it } from 'vitest'
import {
  annualizedPremiumPaise,
  coverageSummary,
  nextPremiumDueUTC,
  renewalLabel,
  renewalNeedsAttention,
  renewalStatus,
} from '@/lib/insurance'
import { isoDayUTC, toUTC } from '@/lib/date'

const d = (iso: string) => toUTC(iso)

describe('nextPremiumDueUTC (drift-free anchored advance)', () => {
  it('advances by the frequency, preserving the anchor day', () => {
    expect(isoDayUTC(nextPremiumDueUTC(d('2026-01-15'), 'annual'))).toBe('2027-01-15')
    expect(isoDayUTC(nextPremiumDueUTC(d('2026-01-15'), 'monthly'))).toBe('2026-02-15')
    expect(isoDayUTC(nextPremiumDueUTC(d('2026-01-15'), 'quarterly'))).toBe('2026-04-15')
    expect(isoDayUTC(nextPremiumDueUTC(d('2026-01-15'), 'half_yearly'))).toBe('2026-07-15')
  })

  it('clamps month-end anchors without losing them (Jan 31 → Feb 28 → Mar 31)', () => {
    const feb = nextPremiumDueUTC(d('2026-01-31'), 'monthly')
    expect(isoDayUTC(feb)).toBe('2026-02-28')
    // the anchor stays 31 — next hop returns to the 31st
    expect(isoDayUTC(nextPremiumDueUTC(feb, 'monthly', 31))).toBe('2026-03-31')
  })

  it('handles leap-year Feb 29 anchors', () => {
    const leapDay = d('2028-02-29')
    expect(isoDayUTC(nextPremiumDueUTC(leapDay, 'annual'))).toBe('2029-02-28')
  })

  it('chained advances never drift for a 31st-of-the-month policy', () => {
    let due = d('2026-01-31')
    const anchor = 31
    for (let i = 0; i < 6; i++) due = nextPremiumDueUTC(due, 'monthly', anchor)
    // Jun has 30 days → clamped to Jun 30, not pushed to Jul 1
    expect(isoDayUTC(due)).toBe('2026-07-31')
  })
})

describe('annualizedPremiumPaise', () => {
  it('normalizes every frequency to a yearly figure', () => {
    expect(annualizedPremiumPaise(500_000, 'monthly')).toBe(6_000_000) // ₹5,000/mo → ₹60,000/yr
    expect(annualizedPremiumPaise(1_200_000, 'quarterly')).toBe(4_800_000)
    expect(annualizedPremiumPaise(2_500_000, 'half_yearly')).toBe(5_000_000)
    expect(annualizedPremiumPaise(25_000_000, 'annual')).toBe(25_000_000)
  })

  it('is integer-exact (no float drift) for odd amounts', () => {
    expect(annualizedPremiumPaise(333_333, 'monthly')).toBe(3_999_996)
    expect(annualizedPremiumPaise(1_111_111, 'quarterly')).toBe(4_444_444)
  })
})

describe('renewalStatus ladder (30/15/7/1, injectable clock)', () => {
  const due = d('2026-09-20')

  it('classifies each window', () => {
    expect(renewalStatus(due, d('2026-08-10'))).toEqual({ level: 'none', daysLeft: 41 })
    expect(renewalStatus(due, d('2026-08-21'))).toEqual({ level: 'd30', daysLeft: 30 })
    expect(renewalStatus(due, d('2026-09-05'))).toEqual({ level: 'd15', daysLeft: 15 })
    expect(renewalStatus(due, d('2026-09-13'))).toEqual({ level: 'd7', daysLeft: 7 })
    expect(renewalStatus(due, d('2026-09-19'))).toEqual({ level: 'd1', daysLeft: 1 })
    expect(renewalStatus(due, d('2026-09-20'))).toEqual({ level: 'due', daysLeft: 0 })
    expect(renewalStatus(due, d('2026-09-21'))).toEqual({ level: 'overdue', daysLeft: -1 })
    expect(renewalStatus(due, d('2026-10-01'))).toEqual({ level: 'overdue', daysLeft: -11 })
  })

  it('boundary: day 31 is silent, day 30 is the first ladder rung', () => {
    expect(renewalStatus(due, d('2026-08-20')).level).toBe('none')
    expect(renewalStatus(due, d('2026-08-21')).level).toBe('d30')
  })

  it('needs attention exactly on the ladder or past due', () => {
    expect(renewalNeedsAttention(renewalStatus(due, d('2026-08-20')))).toBe(false)
    expect(renewalNeedsAttention(renewalStatus(due, d('2026-08-21')))).toBe(true)
    expect(renewalNeedsAttention(renewalStatus(due, d('2026-09-25')))).toBe(true)
  })

  it('labels read naturally', () => {
    expect(renewalLabel(renewalStatus(due, d('2026-09-20')))).toBe('Due today')
    expect(renewalLabel(renewalStatus(due, d('2026-09-19')))).toBe('Due tomorrow')
    expect(renewalLabel(renewalStatus(due, d('2026-09-13')))).toBe('Due in 7 days')
    expect(renewalLabel(renewalStatus(due, d('2026-09-22')))).toBe('Overdue by 2 days')
    expect(renewalLabel(renewalStatus(due, d('2026-09-21')))).toBe('Overdue by 1 day')
  })
})

describe('coverageSummary', () => {
  const now = d('2026-09-07')

  it('sums active policies only, annualizes premiums, finds the next due', () => {
    const s = coverageSummary(
      [
        { id: 'a', status: 'active', sumAssuredPaise: 100_000_000, premiumPaise: 500_000, premiumFrequency: 'monthly', nextPremiumDue: '2026-10-01' },
        { id: 'b', status: 'active', sumAssuredPaise: 500_000_000, premiumPaise: 25_000_000, premiumFrequency: 'annual', nextPremiumDue: '2026-09-15' },
        { id: 'c', status: 'closed', sumAssuredPaise: 999_000_000, premiumPaise: 99_000_000, premiumFrequency: 'annual', nextPremiumDue: '2026-09-08' },
      ],
      now,
    )
    expect(s.policyCount).toBe(2)
    expect(s.totalSumAssuredPaise).toBe(600_000_000)
    expect(s.annualPremiumPaise).toBe(6_000_000 + 25_000_000)
    expect(s.nextDuePolicyId).toBe('b')
    expect(s.nextDueDate).toBe('2026-09-15')
  })

  it('counts policies needing attention (ladder or overdue) and skips silent ones', () => {
    const s = coverageSummary(
      [
        { id: 'a', status: 'active', sumAssuredPaise: 1, premiumPaise: 1, premiumFrequency: 'annual', nextPremiumDue: '2026-09-20' }, // 13d → d15
        { id: 'b', status: 'active', sumAssuredPaise: 1, premiumPaise: 1, premiumFrequency: 'annual', nextPremiumDue: '2026-12-01' }, // 85d → none
        { id: 'c', status: 'active', sumAssuredPaise: 1, premiumPaise: 1, premiumFrequency: 'annual', nextPremiumDue: '2026-09-01' }, // overdue
      ],
      now,
    )
    expect(s.attentionCount).toBe(2)
  })

  it('is empty-safe', () => {
    const s = coverageSummary([], now)
    expect(s).toEqual({
      policyCount: 0,
      totalSumAssuredPaise: 0,
      annualPremiumPaise: 0,
      nextDuePolicyId: null,
      nextDueDate: null,
      attentionCount: 0,
    })
  })
})

// Insurance math (Phase 7): premium recurrence (drift-free anchored
// advance), annualized premium outgo, and the renewal reminder ladder.
// All pure functions with an injectable clock — same conventions as
// lib/fd.ts (30/15/7/1 ladder) and lib/recurrence.ts (anchor-day months).

import { addMonthsUTC, daysBetweenUTC, toUTC } from './date'

export const PREMIUM_FREQUENCIES = ['monthly', 'quarterly', 'half_yearly', 'annual'] as const
export type PremiumFrequency = (typeof PREMIUM_FREQUENCIES)[number]

/** Months per premium period (annual = 12). */
const MONTHS_PER_PERIOD: Record<PremiumFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  annual: 12,
}

export const INSURANCE_TYPES = ['term', 'health', 'life', 'vehicle', 'asset', 'other'] as const
export type InsuranceType = (typeof INSURANCE_TYPES)[number]

export const POLICY_STATUSES = ['active', 'lapsed', 'closed'] as const
export type PolicyStatus = (typeof POLICY_STATUSES)[number]

/** The renewal ladder reuses the FD offsets — one convention everywhere. */
export const INSURANCE_REMINDER_OFFSETS = [30, 15, 7, 1] as const

export type InsuranceReminderLevel = 'none' | 'd30' | 'd15' | 'd7' | 'd1' | 'due' | 'overdue'

/**
 * Advance a premium due date by exactly one frequency period WITHOUT drift:
 * the day-of-month anchor is preserved and clamped to the target month's
 * length (Jan 31 → Feb 28 → Mar 31). `anchorDay` defaults to the current
 * due date's day so short months never push the schedule permanently.
 */
export function nextPremiumDueUTC(currentDue: Date, frequency: PremiumFrequency, anchorDay?: number): Date {
  return addMonthsUTC(currentDue, MONTHS_PER_PERIOD[frequency], anchorDay ?? currentDue.getUTCDate())
}

/**
 * Normalize any premium frequency to a yearly outgo in paise.
 *   monthly 5000 → 60000; quarterly 12000 → 48000; annual 25000 → 25000.
 * Integer-exact for every frequency (all multipliers divide evenly).
 */
export function annualizedPremiumPaise(premiumPaise: number, frequency: PremiumFrequency): number {
  const perYear = 12 / MONTHS_PER_PERIOD[frequency]
  return Math.round(premiumPaise * perYear)
}

export interface RenewalStatus {
  level: InsuranceReminderLevel
  daysLeft: number
}

/**
 * Where a policy sits on the renewal ladder given an injected clock.
 * Due today → 'due'; past due (grace window of 30 days before 'lapsed' is
 * the insurer's job, so we keep flagging) → 'overdue'.
 */
export function renewalStatus(nextDue: Date, now: Date): RenewalStatus {
  const daysLeft = daysBetweenUTC(now, nextDue)
  if (daysLeft < 0) return { level: 'overdue', daysLeft }
  if (daysLeft === 0) return { level: 'due', daysLeft }
  if (daysLeft <= 1) return { level: 'd1', daysLeft }
  if (daysLeft <= 7) return { level: 'd7', daysLeft }
  if (daysLeft <= 15) return { level: 'd15', daysLeft }
  if (daysLeft <= 30) return { level: 'd30', daysLeft }
  return { level: 'none', daysLeft }
}

/** Only ladder levels that need attention (surfaces on Today). */
export function renewalNeedsAttention(status: RenewalStatus): boolean {
  return status.level !== 'none'
}

/** Human label for a ladder level. */
export function renewalLabel(status: RenewalStatus): string {
  switch (status.level) {
    case 'overdue':
      return status.daysLeft === -1 ? 'Overdue by 1 day' : `Overdue by ${-status.daysLeft} days`
    case 'due':
      return 'Due today'
    case 'd1':
      return 'Due tomorrow'
    case 'd7':
      return `Due in ${status.daysLeft} days`
    case 'd15':
      return `Due in ${status.daysLeft} days`
    case 'd30':
      return `Due in ${status.daysLeft} days`
    case 'none':
      return `Due in ${status.daysLeft} days`
  }
}

export interface CoverageSummary {
  policyCount: number
  totalSumAssuredPaise: number
  annualPremiumPaise: number
  nextDuePolicyId: string | null
  nextDueDate: string | null
  /** active policies on the renewal ladder (≤30d, due or overdue) */
  attentionCount: number
}

/** Aggregate over the user's policies. ISO date strings in, `now` injectable. */
export function coverageSummary(
  policies: {
    id: string
    status: PolicyStatus
    sumAssuredPaise: number
    premiumPaise: number
    premiumFrequency: PremiumFrequency
    nextPremiumDue: string
  }[],
  now: Date,
): CoverageSummary {
  const active = policies.filter((p) => p.status === 'active')
  let totalSumAssuredPaise = 0
  let annualPremiumPaise = 0
  let next: { id: string; due: string } | null = null
  let attentionCount = 0

  for (const p of active) {
    totalSumAssuredPaise += p.sumAssuredPaise
    annualPremiumPaise += annualizedPremiumPaise(p.premiumPaise, p.premiumFrequency)
    if (!next || p.nextPremiumDue < next.due) next = { id: p.id, due: p.nextPremiumDue }
    if (renewalNeedsAttention(renewalStatus(toUTC(p.nextPremiumDue), now))) attentionCount += 1
  }

  return {
    policyCount: active.length,
    totalSumAssuredPaise,
    annualPremiumPaise,
    nextDuePolicyId: next?.id ?? null,
    nextDueDate: next?.due ?? null,
    attentionCount,
  }
}

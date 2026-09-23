// Insurance service (Phase 7). Policies with a drift-free premium schedule
// and the shared 30/15/7/1 renewal ladder. "Log premium" advances the due
// date exactly one period and optionally creates a linked expense (Decision
// #35: no separate payments table — the advanced due date IS the ledger).

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import {
  INSURANCE_TYPES,
  POLICY_STATUSES,
  PREMIUM_FREQUENCIES,
  PremiumFrequency,
  annualizedPremiumPaise,
  coverageSummary,
  nextPremiumDueUTC,
  renewalLabel,
  renewalStatus,
} from '@/lib/insurance'
import { isoDayUTC, todayISO, toUTC } from '@/lib/date'
import { InsurancePolicyDTO } from '@/lib/types'

export interface PolicyWithMeta extends InsurancePolicyDTO {
  renewalLevel: string
  daysUntilDue: number
  dueLabel: string
  annualPremiumPaise: number
}

function toDTO(p: {
  id: string
  name: string
  type: string
  insurer: string
  policyNumber: string | null
  sumAssuredPaise: bigint
  premiumPaise: number
  premiumFrequency: string
  nextPremiumDue: Date
  startDate: Date
  maturityDate: Date | null
  nominee: string | null
  status: string
  notes: string | null
  createdAt: Date
}): InsurancePolicyDTO {
  return {
    id: p.id,
    name: p.name,
    type: p.type as InsurancePolicyDTO['type'],
    insurer: p.insurer,
    policyNumber: p.policyNumber,
    sumAssuredPaise: Number(p.sumAssuredPaise),
    premiumPaise: p.premiumPaise,
    premiumFrequency: p.premiumFrequency as InsurancePolicyDTO['premiumFrequency'],
    nextPremiumDue: isoDayUTC(p.nextPremiumDue),
    startDate: isoDayUTC(p.startDate),
    maturityDate: p.maturityDate ? isoDayUTC(p.maturityDate) : null,
    nominee: p.nominee,
    status: p.status as InsurancePolicyDTO['status'],
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
  }
}

export async function createPolicy(
  userId: string,
  input: {
    name: string
    type: string
    insurer: string
    policyNumber?: string | null
    sumAssuredPaise: number
    premiumPaise: number
    premiumFrequency: PremiumFrequency
    nextPremiumDue: string
    startDate: string
    maturityDate?: string | null
    nominee?: string | null
    notes?: string | null
  },
): Promise<InsurancePolicyDTO> {
  if (!input.name.trim()) throw new HttpError('Policy name is required', 422)
  if (!input.insurer.trim()) throw new HttpError('Insurer is required', 422)
  if (!INSURANCE_TYPES.includes(input.type as (typeof INSURANCE_TYPES)[number])) throw new HttpError('Unknown policy type', 422)
  if (!PREMIUM_FREQUENCIES.includes(input.premiumFrequency)) throw new HttpError('Unknown premium frequency', 422)
  if (!Number.isInteger(input.sumAssuredPaise) || input.sumAssuredPaise <= 0) throw new HttpError('Sum assured must be positive', 422)
  if (!Number.isInteger(input.premiumPaise) || input.premiumPaise <= 0) throw new HttpError('Premium must be positive', 422)
  for (const [label, iso] of [['nextPremiumDue', input.nextPremiumDue], ['startDate', input.startDate]] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new HttpError(`${label} must be YYYY-MM-DD`, 422)
  }
  if (input.maturityDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(input.maturityDate)) {
    throw new HttpError('maturityDate must be YYYY-MM-DD or null', 422)
  }

  const row = await db.insurancePolicy.create({
    data: {
      userId,
      name: input.name.trim(),
      type: input.type,
      insurer: input.insurer.trim(),
      policyNumber: input.policyNumber?.trim() || null,
      sumAssuredPaise: BigInt(input.sumAssuredPaise),
      premiumPaise: input.premiumPaise,
      premiumFrequency: input.premiumFrequency,
      nextPremiumDue: toUTC(input.nextPremiumDue),
      startDate: toUTC(input.startDate),
      maturityDate: input.maturityDate ? toUTC(input.maturityDate) : null,
      nominee: input.nominee?.trim() || null,
      status: 'active',
      notes: input.notes?.trim() || null,
    },
  })
  return toDTO(row)
}

export async function listPolicies(userId: string, tz: string): Promise<{ policies: PolicyWithMeta[]; summary: ReturnType<typeof coverageSummary> }> {
  const rows = await db.insurancePolicy.findMany({ where: { userId }, orderBy: { nextPremiumDue: 'asc' } })
  const now = toUTC(todayISO(tz))
  const policies = rows.map((r) => {
    const status = renewalStatus(r.nextPremiumDue, now)
    return {
      ...toDTO(r),
      renewalLevel: r.status === 'active' ? status.level : 'none',
      daysUntilDue: status.daysLeft,
      dueLabel: renewalLabel(status),
      annualPremiumPaise: annualizedPremiumPaise(r.premiumPaise, r.premiumFrequency as PremiumFrequency),
    }
  })
  const summary = coverageSummary(
    rows.map((r) => ({
      id: r.id,
      status: r.status as (typeof POLICY_STATUSES)[number],
      sumAssuredPaise: Number(r.sumAssuredPaise),
      premiumPaise: r.premiumPaise,
      premiumFrequency: r.premiumFrequency as PremiumFrequency,
      nextPremiumDue: isoDayUTC(r.nextPremiumDue),
    })),
    now,
  )
  return { policies, summary }
}

export async function updatePolicy(
  userId: string,
  id: string,
  input: Partial<{
    name: string
    type: string
    insurer: string
    policyNumber: string | null
    sumAssuredPaise: number
    premiumPaise: number
    premiumFrequency: PremiumFrequency
    nextPremiumDue: string
    maturityDate: string | null
    nominee: string | null
    status: (typeof POLICY_STATUSES)[number]
    notes: string | null
  }>,
): Promise<InsurancePolicyDTO> {
  const existing = await db.insurancePolicy.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Policy not found', 404)
  if (input.type !== undefined && !INSURANCE_TYPES.includes(input.type as (typeof INSURANCE_TYPES)[number])) throw new HttpError('Unknown policy type', 422)
  if (input.premiumFrequency !== undefined && !PREMIUM_FREQUENCIES.includes(input.premiumFrequency as PremiumFrequency)) {
    throw new HttpError('Unknown premium frequency', 422)
  }
  if (input.status !== undefined && !POLICY_STATUSES.includes(input.status as (typeof POLICY_STATUSES)[number])) throw new HttpError('Unknown status', 422)
  if (input.sumAssuredPaise !== undefined && (!Number.isInteger(input.sumAssuredPaise) || input.sumAssuredPaise <= 0)) {
    throw new HttpError('Sum assured must be positive', 422)
  }
  if (input.premiumPaise !== undefined && (!Number.isInteger(input.premiumPaise) || input.premiumPaise <= 0)) {
    throw new HttpError('Premium must be positive', 422)
  }
  if (input.nextPremiumDue !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.nextPremiumDue)) {
    throw new HttpError('nextPremiumDue must be YYYY-MM-DD', 422)
  }

  const row = await db.insurancePolicy.update({
    where: { id },
    data: {
      name: input.name?.trim() || existing.name,
      type: input.type ?? existing.type,
      insurer: input.insurer?.trim() || existing.insurer,
      policyNumber: input.policyNumber === undefined ? existing.policyNumber : input.policyNumber?.trim() || null,
      sumAssuredPaise: input.sumAssuredPaise === undefined ? existing.sumAssuredPaise : BigInt(input.sumAssuredPaise),
      premiumPaise: input.premiumPaise ?? existing.premiumPaise,
      premiumFrequency: input.premiumFrequency ?? existing.premiumFrequency,
      nextPremiumDue: input.nextPremiumDue ? toUTC(input.nextPremiumDue) : existing.nextPremiumDue,
      maturityDate: input.maturityDate === undefined ? existing.maturityDate : input.maturityDate ? toUTC(input.maturityDate) : null,
      nominee: input.nominee === undefined ? existing.nominee : input.nominee?.trim() || null,
      status: input.status ?? existing.status,
      notes: input.notes === undefined ? existing.notes : input.notes?.trim() || null,
    },
  })
  return toDTO(row)
}

export async function deletePolicy(userId: string, id: string): Promise<void> {
  const existing = await db.insurancePolicy.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Policy not found', 404)
  await db.insurancePolicy.delete({ where: { id } })
}

/**
 * Mark this period's premium paid: advance nextPremiumDue one period
 * (drift-free, anchored on the SCHEDULED due day so short months never
 * drift), and optionally record the expense against an account in the same
 * DB transaction. Paying twice advances twice — the UI gates the button by
 * due date, and the advanced date makes accidental double-taps visible.
 */
export async function payPremium(
  userId: string,
  id: string,
  input: { accountId?: string | null; categoryId?: string | null; note?: string | null },
): Promise<{ policy: InsurancePolicyDTO; transactionId: string | null; nextDue: string }> {
  const existing = await db.insurancePolicy.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Policy not found', 404)
  if (existing.status !== 'active') throw new HttpError('Only active policies can be paid', 422)

  const scheduledAnchor = existing.nextPremiumDue.getUTCDate()
  const advanced = nextPremiumDueUTC(existing.nextPremiumDue, existing.premiumFrequency as PremiumFrequency, scheduledAnchor)

  let transactionId: string | null = null
  const policy = await db.$transaction(async (tx) => {
    if (input.accountId) {
      const account = await tx.account.findFirst({ where: { id: input.accountId, userId } })
      if (!account) throw new HttpError('Account not found', 404)
      const txn = await tx.transaction.create({
        data: {
          userId,
          accountId: account.id,
          categoryId: input.categoryId ?? null,
          amountPaise: existing.premiumPaise,
          direction: 'out',
          date: existing.nextPremiumDue,
          note: input.note?.trim() || `Insurance premium · ${existing.name}`,
          source: 'manual',
        },
      })
      // mirror createTransaction's balance rule (credit card outstanding grows)
      const effect = account.type === 'credit_card' ? existing.premiumPaise : -existing.premiumPaise
      await tx.account.update({ where: { id: account.id }, data: { balancePaise: { increment: effect } } })
      transactionId = txn.id
    }
    return tx.insurancePolicy.update({
      where: { id },
      data: { nextPremiumDue: advanced, status: 'active' },
    })
  })

  return { policy: toDTO(policy), transactionId, nextDue: isoDayUTC(advanced) }
}

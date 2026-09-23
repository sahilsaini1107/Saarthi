// Fixed Deposit service. Maturity date + amount are ALWAYS computed
// server-side from the inputs — the client never supplies them.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { COMPOUNDING_OPTIONS, Compounding, elapsedProgress, maturityAmountPaise, maturityDateUTC, reminderStatus } from '@/lib/fd'
import { isoDayUTC, todayISO, toUTC } from '@/lib/date'
import { FixedDepositDTO, JobKey } from '@/lib/types'
import { parseJob } from '@/services/planner'

export interface FdWithMeta extends FixedDepositDTO {
  daysLeft: number
  reminderLevel: string
  progressPct: number
  interestPaise: number
}

function toDTO(f: {
  id: string
  bank: string
  principalPaise: number
  ratePct: number
  tenureMonths: number
  startDate: Date
  compounding: string
  autoRenew: boolean
  status: string
  job: string | null
  maturityDate: Date
  maturityAmountPaise: number
  createdAt: Date
}): FixedDepositDTO {
  return {
    id: f.id,
    bank: f.bank,
    principalPaise: f.principalPaise,
    ratePct: f.ratePct,
    tenureMonths: f.tenureMonths,
    startDate: isoDayUTC(f.startDate),
    compounding: f.compounding as Compounding,
    autoRenew: f.autoRenew,
    status: f.status as FixedDepositDTO['status'],
    job: (f.job as FixedDepositDTO['job']) ?? null,
    maturityDate: isoDayUTC(f.maturityDate),
    maturityAmountPaise: f.maturityAmountPaise,
    createdAt: f.createdAt.toISOString(),
  }
}

export async function createFd(
  userId: string,
  input: {
    bank: string
    principalPaise: number
    ratePct: number
    tenureMonths: number
    startDate: string
    compounding: Compounding
    autoRenew?: boolean
    job?: JobKey | null
  },
): Promise<FixedDepositDTO> {
  const bank = input.bank.trim()
  if (!bank) throw new HttpError('Bank name is required', 422)
  if (!Number.isInteger(input.principalPaise) || input.principalPaise <= 0) throw new HttpError('Principal must be positive', 422)
  if (!(input.ratePct > 0 && input.ratePct <= 100)) throw new HttpError('Rate must be between 0 and 100', 422)
  if (!Number.isInteger(input.tenureMonths) || input.tenureMonths < 1 || input.tenureMonths > 360) {
    throw new HttpError('Tenure must be between 1 and 360 months', 422)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new HttpError('Start date must be YYYY-MM-DD', 422)
  if (!COMPOUNDING_OPTIONS.includes(input.compounding)) throw new HttpError('Unknown compounding frequency', 422)

  const maturity = maturityDateUTC(input.startDate, input.tenureMonths)
  const maturityAmount = maturityAmountPaise(input.principalPaise, input.ratePct, input.tenureMonths, input.compounding)

  const row = await db.fixedDeposit.create({
    data: {
      userId,
      bank,
      principalPaise: input.principalPaise,
      ratePct: input.ratePct,
      tenureMonths: input.tenureMonths,
      startDate: toUTC(input.startDate),
      compounding: input.compounding,
      autoRenew: input.autoRenew ?? false,
      status: 'active',
      job: parseJob(input.job),
      maturityDate: maturity,
      maturityAmountPaise: maturityAmount,
    },
  })
  return toDTO(row)
}

export async function listFds(userId: string, tz: string): Promise<FdWithMeta[]> {
  const rows = await db.fixedDeposit.findMany({
    where: { userId },
    orderBy: { maturityDate: 'asc' },
  })
  const today = toUTC(todayISO(tz))
  return rows.map((f) => {
    const { level, daysLeft } = reminderStatus(f.maturityDate, today)
    return {
      ...toDTO(f),
      daysLeft,
      reminderLevel: f.status === 'active' ? level : 'none',
      progressPct: Math.round(elapsedProgress(isoDayUTC(f.startDate), f.tenureMonths, f.maturityDate, today) * 100),
      interestPaise: f.maturityAmountPaise - f.principalPaise,
    }
  })
}

export async function updateFd(
  userId: string,
  id: string,
  input: Partial<{
    bank: string
    ratePct: number
    autoRenew: boolean
    status: 'active' | 'matured' | 'closed'
    job: JobKey | null
  }>,
): Promise<FixedDepositDTO> {
  const existing = await db.fixedDeposit.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('FD not found', 404)
  // Principal/tenure/start define a booked FD; changing them means closing and
  // rebooking. Rate is editable (banks revise rates on renewal) — recompute amount.
  let maturityAmount = existing.maturityAmountPaise
  if (input.ratePct !== undefined && input.ratePct !== existing.ratePct) {
    if (!(input.ratePct > 0 && input.ratePct <= 100)) throw new HttpError('Rate must be between 0 and 100', 422)
    maturityAmount = maturityAmountPaise(
      existing.principalPaise,
      input.ratePct,
      existing.tenureMonths,
      existing.compounding as Compounding,
    )
  }
  const row = await db.fixedDeposit.update({
    where: { id },
    data: {
      bank: input.bank?.trim() || existing.bank,
      ratePct: input.ratePct ?? existing.ratePct,
      autoRenew: input.autoRenew ?? existing.autoRenew,
      status: input.status ?? existing.status,
      job: input.job === undefined ? existing.job : parseJob(input.job),
      maturityAmountPaise: maturityAmount,
    },
  })
  return toDTO(row)
}

export async function deleteFd(userId: string, id: string): Promise<void> {
  const existing = await db.fixedDeposit.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('FD not found', 404)
  await db.fixedDeposit.delete({ where: { id } })
}

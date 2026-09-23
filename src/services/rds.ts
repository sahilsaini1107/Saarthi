// Recurring Deposit service (Phase 1.5). Maturity date + amount are ALWAYS
// computed server-side from the inputs (same rule as FDs). Optionally
// auto-creates a monthly installment bill so paying the RD reuses the
// bill → transaction pipeline (exactly-once per period).

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { reminderStatus, elapsedProgress } from '@/lib/fd'
import { RD_COMPOUNDING_OPTIONS, RdCompounding, rdInstallmentsPaid, rdMaturityAmountPaise, rdMaturityDateUTC, rdValueNowPaise } from '@/lib/rd'
import { isoDayUTC, todayISO, toUTC } from '@/lib/date'
import { addMonthsUTC } from '@/lib/date'
import { RecurringDepositDTO, JobKey } from '@/lib/types'
import { parseJob } from '@/services/planner'

export interface RdWithMeta extends RecurringDepositDTO {
  daysLeft: number
  reminderLevel: string
  progressPct: number
  interestPaise: number
  installmentsPaid: number
  valueNowPaise: number
  billId: string | null
}

function toDTO(r: {
  id: string
  bank: string
  installmentPaise: bigint
  ratePct: number
  tenureMonths: number
  startDate: Date
  compounding: string
  autoRenew: boolean
  status: string
  job: string | null
  maturityDate: Date
  maturityAmountPaise: bigint
  createdAt: Date
}): RecurringDepositDTO {
  return {
    id: r.id,
    bank: r.bank,
    installmentPaise: Number(r.installmentPaise),
    ratePct: r.ratePct,
    tenureMonths: r.tenureMonths,
    startDate: isoDayUTC(r.startDate),
    compounding: r.compounding as RdCompounding,
    autoRenew: r.autoRenew,
    status: r.status as RecurringDepositDTO['status'],
    job: (r.job as RecurringDepositDTO['job']) ?? null,
    maturityDate: isoDayUTC(r.maturityDate),
    maturityAmountPaise: Number(r.maturityAmountPaise),
    createdAt: r.createdAt.toISOString(),
  }
}

async function investmentCategoryId(userId: string): Promise<string | null> {
  const cat = await db.category.findFirst({ where: { userId, name: 'Investment' }, select: { id: true } })
  return cat?.id ?? null
}

export async function createRd(
  userId: string,
  input: {
    bank: string
    installmentPaise: number
    ratePct: number
    tenureMonths: number
    startDate: string
    compounding: RdCompounding
    autoRenew?: boolean
    autoBill?: boolean
    job?: JobKey | null
  },
): Promise<RecurringDepositDTO> {
  const bank = input.bank.trim()
  if (!bank) throw new HttpError('Bank name is required', 422)
  if (!Number.isInteger(input.installmentPaise) || input.installmentPaise <= 0) throw new HttpError('Installment must be positive', 422)
  if (!(input.ratePct > 0 && input.ratePct <= 100)) throw new HttpError('Rate must be between 0 and 100', 422)
  if (!Number.isInteger(input.tenureMonths) || input.tenureMonths < 1 || input.tenureMonths > 360) {
    throw new HttpError('Tenure must be between 1 and 360 months', 422)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new HttpError('Start date must be YYYY-MM-DD', 422)
  if (!RD_COMPOUNDING_OPTIONS.includes(input.compounding)) throw new HttpError('Unknown compounding frequency', 422)

  const start = toUTC(input.startDate)
  const maturity = rdMaturityDateUTC(input.startDate, input.tenureMonths)
  const maturityAmount = rdMaturityAmountPaise(input.installmentPaise, input.ratePct, input.tenureMonths, input.compounding)

  const row = await db.recurringDeposit.create({
    data: {
      userId,
      bank,
      installmentPaise: BigInt(input.installmentPaise),
      ratePct: input.ratePct,
      tenureMonths: input.tenureMonths,
      startDate: start,
      compounding: input.compounding,
      autoRenew: input.autoRenew ?? false,
      status: 'active',
      job: parseJob(input.job),
      maturityDate: maturity,
      maturityAmountPaise: BigInt(maturityAmount),
    },
  })

  if (input.autoBill ?? true) {
    // First installment is due on the start date itself; the BILL carries the
    // following occurrences (paying the first one is the RD booking itself).
    const nextDue = addMonthsUTC(start, 1, start.getUTCDate())
    await db.bill.create({
      data: {
        userId,
        name: `RD · ${bank}`,
        amountPaise: input.installmentPaise,
        frequency: 'monthly',
        nextDue,
        anchorDay: start.getUTCDate(),
        remindDaysBefore: 1,
        categoryId: await investmentCategoryId(userId),
        rdId: row.id,
      },
    })
  }

  return toDTO(row)
}

export async function listRds(userId: string, tz: string): Promise<RdWithMeta[]> {
  const rows = await db.recurringDeposit.findMany({
    where: { userId },
    orderBy: { maturityDate: 'asc' },
    include: { bill: { select: { id: true } } },
  })
  const today = toUTC(todayISO(tz))
  return rows.map((r) => {
    const { level, daysLeft } = reminderStatus(r.maturityDate, today)
    const paid = rdInstallmentsPaid(isoDayUTC(r.startDate), r.tenureMonths, today)
    return {
      ...toDTO(r),
      daysLeft,
      reminderLevel: r.status === 'active' ? level : 'none',
      progressPct: Math.round(elapsedProgress(isoDayUTC(r.startDate), r.tenureMonths, r.maturityDate, today) * 100),
      interestPaise: Number(r.maturityAmountPaise) - Number(r.installmentPaise) * r.tenureMonths,
      installmentsPaid: paid,
      valueNowPaise: rdValueNowPaise(Number(r.installmentPaise), paid),
      billId: r.bill?.id ?? null,
    }
  })
}

export async function updateRd(
  userId: string,
  id: string,
  input: Partial<{
    bank: string
    ratePct: number
    installmentPaise: number
    autoRenew: boolean
    status: 'active' | 'matured' | 'closed'
    job: JobKey | null
  }>,
): Promise<RecurringDepositDTO> {
  const existing = await db.recurringDeposit.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('RD not found', 404)

  let installment = existing.installmentPaise
  let maturityAmount = existing.maturityAmountPaise
  let rate = existing.ratePct

  if (input.ratePct !== undefined && input.ratePct !== existing.ratePct) {
    if (!(input.ratePct > 0 && input.ratePct <= 100)) throw new HttpError('Rate must be between 0 and 100', 422)
    rate = input.ratePct
  }
  if (input.installmentPaise !== undefined && input.installmentPaise !== Number(existing.installmentPaise)) {
    if (!Number.isInteger(input.installmentPaise) || input.installmentPaise <= 0) throw new HttpError('Installment must be positive', 422)
    installment = BigInt(input.installmentPaise)
  }
  if (rate !== existing.ratePct || installment !== existing.installmentPaise) {
    maturityAmount = BigInt(
      rdMaturityAmountPaise(Number(installment), rate, existing.tenureMonths, existing.compounding as RdCompounding),
    )
  }

  const row = await db.recurringDeposit.update({
    where: { id },
    data: {
      bank: input.bank?.trim() || existing.bank,
      ratePct: rate,
      installmentPaise: installment,
      autoRenew: input.autoRenew ?? existing.autoRenew,
      status: input.status ?? existing.status,
      job: input.job === undefined ? existing.job : parseJob(input.job),
      maturityAmountPaise: maturityAmount,
    },
  })

  // Keep the linked installment bill in sync with a changed installment.
  if (installment !== existing.installmentPaise) {
    await db.bill.updateMany({ where: { rdId: id }, data: { amountPaise: Number(installment) } })
  }

  return toDTO(row)
}

export async function deleteRd(userId: string, id: string): Promise<void> {
  const existing = await db.recurringDeposit.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('RD not found', 404)
  // Linked installment bill cascades (Bill.rdId onDelete: Cascade).
  await db.recurringDeposit.delete({ where: { id } })
}

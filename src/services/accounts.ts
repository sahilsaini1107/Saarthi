// Account service: savings / cash / credit_card.
// Balance semantics (documented decision):
//   savings, cash      → balancePaise = money owned
//   credit_card        → balancePaise = outstanding amount OWED;
//                        spending ("out") increases it, payments ("in") reduce it.
// Utilization is computed on read and color-coded client-side.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { AccountDTO, AccountType, JobKey } from '@/lib/types'
import { parseJob } from '@/services/planner'

const ACCOUNT_TYPES: AccountType[] = ['savings', 'cash', 'credit_card']

export interface AccountWithUtilization extends AccountDTO {
  utilizationPct: number | null
}

function toDTO(a: {
  id: string
  name: string
  type: string
  balancePaise: number
  creditLimitPaise: number | null
  statementDay: number | null
  dueDay: number | null
  job: string | null
  color: string
  archived: boolean
  createdAt: Date
}): AccountWithUtilization {
  const utilizationPct =
    a.type === 'credit_card' && a.creditLimitPaise && a.creditLimitPaise > 0
      ? Math.round((a.balancePaise / a.creditLimitPaise) * 100)
      : null
  return {
    id: a.id,
    name: a.name,
    type: a.type as AccountType,
    balancePaise: a.balancePaise,
    creditLimitPaise: a.creditLimitPaise,
    statementDay: a.statementDay,
    dueDay: a.dueDay,
    job: (a.job as JobKey | null) ?? null,
    color: a.color,
    archived: a.archived,
    createdAt: a.createdAt.toISOString(),
    utilizationPct,
  }
}

export async function listAccounts(userId: string): Promise<AccountWithUtilization[]> {
  const rows = await db.account.findMany({
    where: { userId },
    orderBy: [{ archived: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(toDTO)
}

function validateDay(day: number | null | undefined, label: string): number | null {
  if (day == null) return null
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new HttpError(`${label} must be between 1 and 31`, 422)
  return day
}

export async function createAccount(
  userId: string,
  input: {
    name: string
    type: AccountType
    balancePaise?: number
    creditLimitPaise?: number | null
    statementDay?: number | null
    dueDay?: number | null
    job?: JobKey | null
    color?: string
  },
): Promise<AccountWithUtilization> {
  const name = input.name.trim()
  if (!name) throw new HttpError('Account name is required', 422)
  if (!ACCOUNT_TYPES.includes(input.type)) throw new HttpError('Unknown account type', 422)
  if (input.type === 'credit_card' && (input.creditLimitPaise == null || input.creditLimitPaise <= 0)) {
    throw new HttpError('Credit cards need a credit limit', 422)
  }
  const row = await db.account.create({
    data: {
      userId,
      name,
      type: input.type,
      balancePaise: Math.max(0, Math.trunc(input.balancePaise ?? 0)),
      creditLimitPaise: input.type === 'credit_card' ? Math.trunc(input.creditLimitPaise!) : null,
      statementDay: validateDay(input.statementDay ?? null, 'Statement day'),
      dueDay: validateDay(input.dueDay ?? null, 'Due day'),
      job: parseJob(input.job),
      color: input.color || (input.type === 'credit_card' ? '#EF4444' : '#0D9488'),
    },
  })
  return toDTO(row)
}

export async function updateAccount(
  userId: string,
  id: string,
  input: Partial<{
    name: string
    color: string
    archived: boolean
    creditLimitPaise: number | null
    statementDay: number | null
    dueDay: number | null
    job: JobKey | null
  }>,
): Promise<AccountWithUtilization> {
  const existing = await db.account.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Account not found', 404)
  const row = await db.account.update({
    where: { id },
    data: {
      name: input.name?.trim() || existing.name,
      color: input.color ?? existing.color,
      archived: input.archived ?? existing.archived,
      creditLimitPaise: existing.type === 'credit_card' ? (input.creditLimitPaise ?? existing.creditLimitPaise) : null,
      statementDay: input.statementDay !== undefined ? validateDay(input.statementDay, 'Statement day') : existing.statementDay,
      dueDay: input.dueDay !== undefined ? validateDay(input.dueDay, 'Due day') : existing.dueDay,
      job: input.job === undefined ? existing.job : parseJob(input.job),
    },
  })
  return toDTO(row)
}

export async function deleteAccount(userId: string, id: string): Promise<void> {
  const existing = await db.account.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Account not found', 404)
  // Cascades to the account's transactions by design (schema-level).
  await db.account.delete({ where: { id } })
}

/** Sum of savings+cash balances, and total card outstanding. */
export async function accountSummary(userId: string) {
  const rows = await db.account.findMany({
    where: { userId, archived: false },
    select: { type: true, balancePaise: true },
  })
  let liquidPaise = 0
  let cardOutstandingPaise = 0
  for (const r of rows) {
    if (r.type === 'credit_card') cardOutstandingPaise += r.balancePaise
    else liquidPaise += r.balancePaise
  }
  return { liquidPaise, cardOutstandingPaise }
}

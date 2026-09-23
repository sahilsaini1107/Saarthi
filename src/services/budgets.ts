// Budget service (Phase 5.1). Budgets are recurring monthly caps per expense
// category; spend comes straight from the transaction ledger for the month.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { currentMonthKey, daysInMonthUTC, isoDayUTC, monthRange, todayISO } from '@/lib/date'
import { bandFor, daysLeftInMonth, monthElapsedFraction, onTrackRatio, projectedMonthEndPaise, safeDailySpendPaise } from '@/lib/budgets'
import type { BudgetBand } from '@/lib/budgets'

export interface BudgetWithStatus {
  id: string
  categoryId: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  amountPaise: number
  spentPaise: number
  spentPct: number | null
  expectedPct: number
  band: BudgetBand
  projectedPaise: number | null
  safePerDayPaise: number
  daysLeft: number
}

export interface BudgetListPayload {
  monthKey: string
  today: string
  budgets: BudgetWithStatus[]
  totals: {
    budgetPaise: number
    spentPaise: number
    band: BudgetBand
    overCount: number
    watchCount: number
  }
  /** 0..1 share of budgets on track (null = no budgets) — Life Score input */
  onTrackRatio: number | null
}

export async function listBudgets(userId: string, tz: string): Promise<BudgetListPayload> {
  const today = todayISO(tz)
  const monthKey = currentMonthKey(tz)
  const { start, endExclusive } = monthRange(monthKey)
  const [y, m] = monthKey.split('-').map(Number)
  const daysInMonth = daysInMonthUTC(y, m - 1)
  const dayOfMonth = Number(today.slice(8, 10))
  const expectedFraction = monthElapsedFraction(dayOfMonth, daysInMonth)
  const daysLeft = daysLeftInMonth(dayOfMonth, daysInMonth)

  const [budgets, monthTxns] = await Promise.all([
    db.budget.findMany({
      where: { userId },
      include: { category: { select: { id: true, name: true, emoji: true, color: true, kind: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.transaction.findMany({
      where: { userId, direction: 'out', date: { gte: start, lt: endExclusive } },
      select: { categoryId: true, amountPaise: true },
    }),
  ])

  const spentByCategory = new Map<string, number>()
  for (const t of monthTxns) {
    if (!t.categoryId) continue
    spentByCategory.set(t.categoryId, (spentByCategory.get(t.categoryId) ?? 0) + t.amountPaise)
  }

  const rows: BudgetWithStatus[] = budgets.map((b) => {
    const spent = spentByCategory.get(b.categoryId) ?? 0
    const band = bandFor(spent, b.amountPaise, expectedFraction)
    return {
      id: b.id,
      categoryId: b.categoryId,
      categoryName: b.category?.name ?? 'Uncategorised',
      categoryEmoji: b.category?.emoji ?? '❓',
      categoryColor: b.category?.color ?? '#94A3B8',
      amountPaise: b.amountPaise,
      spentPaise: spent,
      spentPct: b.amountPaise > 0 ? Math.round((spent / b.amountPaise) * 1000) / 10 : null,
      expectedPct: Math.round(expectedFraction * 1000) / 10,
      band,
      projectedPaise: projectedMonthEndPaise(spent, dayOfMonth, daysInMonth),
      safePerDayPaise: safeDailySpendPaise(b.amountPaise, spent, daysLeft),
      daysLeft,
    }
  })

  // biggest problems first: over budgets by overspend, then watch by gap, then rest
  const bandRank: Record<BudgetBand, number> = { over: 0, watch: 1, on_track: 2, none: 3 }
  rows.sort((a, b) => {
    if (bandRank[a.band] !== bandRank[b.band]) return bandRank[a.band] - bandRank[b.band]
    return b.spentPaise - a.spentPaise
  })

  const totalBudget = rows.reduce((s, r) => s + r.amountPaise, 0)
  const totalSpent = rows.reduce((s, r) => s + r.spentPaise, 0)

  return {
    monthKey,
    today: isoDayUTC(new Date(`${today}T00:00:00.000Z`)),
    budgets: rows,
    totals: {
      budgetPaise: totalBudget,
      spentPaise: totalSpent,
      band: bandFor(totalSpent, totalBudget, expectedFraction),
      overCount: rows.filter((r) => r.band === 'over').length,
      watchCount: rows.filter((r) => r.band === 'watch').length,
    },
    onTrackRatio: onTrackRatio(rows.map((r) => r.band)),
  }
}

async function assertCategory(userId: string, categoryId: string) {
  const category = await db.category.findFirst({ where: { id: categoryId, userId } })
  if (!category) throw new HttpError('Category not found', 404)
  if (category.kind !== 'expense') throw new HttpError('Budgets apply to expense categories only', 422)
  return category
}

/** Create or update the (single) budget for a category. */
export async function upsertBudget(userId: string, categoryId: string, amountPaise: number) {
  await assertCategory(userId, categoryId)
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new HttpError('Budget must be a positive amount', 422)
  return db.budget.upsert({
    where: { userId_categoryId: { userId, categoryId } },
    create: { userId, categoryId, amountPaise },
    update: { amountPaise },
    include: { category: { select: { name: true, emoji: true, color: true } } },
  })
}

export async function updateBudget(userId: string, id: string, amountPaise: number) {
  const existing = await db.budget.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Budget not found', 404)
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new HttpError('Budget must be a positive amount', 422)
  return db.budget.update({ where: { id }, data: { amountPaise } })
}

export async function deleteBudget(userId: string, id: string): Promise<void> {
  const existing = await db.budget.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Budget not found', 404)
  await db.budget.delete({ where: { id } })
}

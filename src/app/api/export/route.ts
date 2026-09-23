// Data export (Phase 7): a full JSON dump of everything the user recorded.
// One authed GET, no file is written server-side — the client downloads it.
// BigInt columns serialize as numbers. NOTE: does NOT use withUser because
// the raw file response must not be wrapped in {data: ...}.

import { NextResponse } from 'next/server'
import { fail } from '@/lib/api-helpers'
import { getSessionUser } from '@/services/auth'
import { db } from '@/lib/db'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Not signed in', 401)

  try {
    const [
      accounts,
      categories,
      transactions,
      fixedDeposits,
      recurringDeposits,
      investments,
      investmentTxns,
      assets,
      bills,
      billPayments,
      budgets,
      trips,
      insurancePolicies,
      habits,
      habitEntries,
      routines,
      routineRuns,
      journalEntries,
      goals,
      goalTasks,
      courses,
      studySessions,
      workouts,
      bodyMetrics,
      skinProducts,
      skinCheckIns,
    ] = await Promise.all([
      db.account.findMany({ where: { userId: user.id } }),
      db.category.findMany({ where: { userId: user.id } }),
      db.transaction.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.fixedDeposit.findMany({ where: { userId: user.id } }),
      db.recurringDeposit.findMany({ where: { userId: user.id } }),
      db.investment.findMany({ where: { userId: user.id } }),
      db.investmentTxn.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.asset.findMany({ where: { userId: user.id } }),
      db.bill.findMany({ where: { userId: user.id } }),
      db.billPayment.findMany({ where: { userId: user.id } }),
      db.budget.findMany({ where: { userId: user.id } }),
      db.trip.findMany({ where: { userId: user.id } }),
      db.insurancePolicy.findMany({ where: { userId: user.id } }),
      db.habit.findMany({ where: { userId: user.id } }),
      db.habitEntry.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.routine.findMany({ where: { userId: user.id } }),
      db.routineRun.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.journalEntry.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.goal.findMany({ where: { userId: user.id } }),
      db.goalTask.findMany({ where: { userId: user.id } }),
      db.course.findMany({ where: { userId: user.id } }),
      db.studySession.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.workout.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.bodyMetric.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.skinProduct.findMany({ where: { userId: user.id } }),
      db.skinCheckIn.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
    ])

    // never include secrets
    const payload = {
      meta: {
        app: 'Saarthi · Personal Life OS',
        exportedAt: new Date().toISOString(),
        user: { name: user.name, email: user.email, currency: user.currency, timezone: user.timezone },
        counts: {
          transactions: transactions.length,
          journalEntries: journalEntries.length,
          habits: habits.length,
          workouts: workouts.length,
        },
      },
      accounts,
      categories,
      transactions,
      fixedDeposits,
      recurringDeposits,
      investments,
      investmentTxns,
      assets,
      bills,
      billPayments,
      budgets,
      trips,
      insurancePolicies,
      habits,
      habitEntries,
      routines,
      routineRuns,
      journalEntries,
      goals,
      goalTasks,
      courses,
      studySessions,
      workouts,
      bodyMetrics,
      skinCheckIns,
      skinProducts,
    }

    const body = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="saarthi-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err) {
    console.error('[export]', err)
    return fail('Export failed', 500)
  }
}

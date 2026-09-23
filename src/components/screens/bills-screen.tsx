'use client'

// Bills & subscriptions (task 1.6): month calendar, overdue + upcoming list,
// mark-as-paid → exactly-once linked transaction.

import { useMemo, useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { useBills, usePayBill } from '@/hooks/queries'
import { BillFormSheet } from '@/components/money/bill-form-sheet'
import { EmptyState, ErrorCard, Money, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { Button } from '@/components/ui/button'
import { monthRange, formatDayLabel, todayISO, toUTC, isoDayUTC } from '@/lib/date'
import { upcomingOccurrences } from '@/lib/recurrence'
import { cn } from '@/lib/utils'
import { Plus } from 'lucide-react'
import type { BillWithMeta } from '@/services/bills'

export function BillsScreen() {
  const { user, navigate } = useUi()
  const bills = useBills()
  const pay = usePayBill({ success: 'Paid — transaction logged' })
  const [sheet, setSheet] = useState<{ open: boolean; bill: BillWithMeta | null }>({ open: false, bill: null })
  const [month, setMonth] = useState(() => todayISO('Asia/Kolkata').slice(0, 7))

  const { grid, daysHeader } = useMemo(() => {
    const { start, endExclusive } = monthRange(month)
    const total = Math.round((endExclusive.getTime() - start.getTime()) / 86_400_000)
    const lead = (start.getUTCDay() + 6) % 7 // Monday-first
    const cells: { iso: string | null }[] = Array.from({ length: lead }, () => ({ iso: null }))
    for (let i = 0; i < total; i++) cells.push({ iso: isoDayUTC(new Date(start.getTime() + i * 86_400_000)) })

    const marks = new Map<string, { emoji: string; paid: boolean }[]>()
    for (const b of bills.data ?? []) {
      if (!b.active) continue
      const opts = { customDays: b.customDays ?? undefined, anchorDay: b.anchorDay }
      const occurrences = upcomingOccurrences(toUTC(b.nextDue), b.frequency as 'monthly' | 'quarterly' | 'annual' | 'custom_days', opts, 12)
      for (const o of occurrences) {
        const iso = isoDayUTC(o)
        if (iso.slice(0, 7) !== month) continue
        const arr = marks.get(iso) ?? []
        arr.push({ emoji: '🧾', paid: b.lastPaidDate === iso })
        marks.set(iso, arr)
      }
    }
    return { grid: cells, daysHeader: marks }
  }, [month, bills.data])

  if (bills.isLoading) return <SkeletonRow />
  if (bills.isError) return <ErrorCard message={(bills.error as Error).message} onRetry={() => bills.refetch()} />

  const list = (bills.data ?? []).filter((b) => b.active)
  const overdue = list.filter((b) => b.overdue)
  const upcoming = list.filter((b) => !b.overdue).slice(0, 8)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between px-1">
        <button type="button" onClick={() => navigate('/money')} className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Back">
          ← Money
        </button>
        <Button size="sm" className="h-9 rounded-full" onClick={() => setSheet({ open: true, bill: null })}>
          <Plus className="size-4" /> Add bill
        </Button>
      </header>

      <h1 className="-mt-1 px-1 text-2xl font-bold tracking-tight">Bills & subscriptions</h1>

      {/* calendar */}
      <section className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" aria-label="Previous month" className="rounded-full px-2 text-muted-foreground hover:bg-muted" onClick={() => setMonth(shiftMonth(month, -1))}>
            ←
          </button>
          <p className="text-sm font-semibold">{new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(toUTC(month + '-01'))}</p>
          <button type="button" aria-label="Next month" className="rounded-full px-2 text-muted-foreground hover:bg-muted" onClick={() => setMonth(shiftMonth(month, 1))}>
            →
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {grid.map((c, i) => (
            <div key={i} className={cn('flex aspect-square flex-col items-center justify-center rounded-lg text-xs', !c.iso && 'opacity-0')}>
              <span>{c.iso ? Number(c.iso.slice(8, 10)) : ''}</span>
              <span className="flex h-1.5 gap-0.5">
                {(c.iso ? daysHeader.get(c.iso) : [])?.map((m, j) => (
                  <span key={j} className={cn('size-1.5 rounded-full', m.paid ? 'bg-income' : 'bg-warn')} aria-hidden />
                ))}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-warn" /> scheduled
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-income" /> paid
          </span>
        </p>
      </section>

      {/* overdue */}
      {overdue.length > 0 && (
        <section>
          <SectionHeader title="Overdue" />
          <div className="flex flex-col gap-2">
            {overdue.map((b) => (
              <BillRow key={b.id} bill={b} onPay={() => pay.mutate({ billId: b.id, dueDate: b.nextDue })} onEdit={() => setSheet({ open: true, bill: b })} paying={pay.isPending} />
            ))}
          </div>
        </section>
      )}

      {/* upcoming */}
      <section>
        <SectionHeader title="Upcoming" />
        {upcoming.length === 0 ? (
          <EmptyState
            emoji="🧾"
            title="No bills scheduled"
            body="Rent, WiFi, OTT, insurance premiums — if it recurs, park it here and never think about it again."
            action={
              <Button size="sm" className="mt-2 rounded-full" onClick={() => setSheet({ open: true, bill: null })}>
                Schedule a bill
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((b) => (
              <BillRow key={b.id} bill={b} onPay={() => pay.mutate({ billId: b.id, dueDate: b.nextDue })} onEdit={() => setSheet({ open: true, bill: b })} paying={pay.isPending} />
            ))}
          </div>
        )}
      </section>

      <BillFormSheet open={sheet.open} bill={sheet.bill} onOpenChange={(o) => setSheet({ open: o, bill: o ? sheet.bill : null })} />
    </div>
  )
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

function BillRow({ bill, onPay, onEdit, paying }: { bill: BillWithMeta; onPay: () => void; onEdit: () => void; paying: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 rounded-2xl border bg-card p-4', bill.overdue && 'border-expense/40')}>
      <button type="button" className="min-w-0 text-left" onClick={onEdit} aria-label={`Edit ${bill.name}`}>
        <p className="truncate text-sm font-semibold">
          {bill.name}{' '}
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {bill.frequency === 'custom_days' ? `every ${bill.customDays}d` : bill.frequency}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {bill.overdue ? `Overdue · was due ${formatDayLabel(bill.nextDue)}` : formatDayLabel(bill.nextDue)}
          {bill.remindDaysBefore > 0 ? ` · remind ${bill.remindDaysBefore}d before` : ''}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <Money paise={bill.amountPaise} className="text-sm font-bold" />
        <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" disabled={paying} onClick={onPay}>
          Pay
        </Button>
      </div>
    </div>
  )
}

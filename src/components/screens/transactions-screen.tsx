'use client'

// Transaction list (task 1.3): day-grouped, combinable filters, running
// balance when an account is selected, edit/delete via row tap.

import { useMemo, useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { useAccounts, useCategories, useTransactions } from '@/hooks/queries'
import { TransactionRow } from '@/components/money/transaction-row'
import { EmptyState, ErrorCard, Money, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDayLabel, todayISO } from '@/lib/date'
import { formatINRCompact } from '@/lib/money'
import { ArrowLeft, X } from 'lucide-react'

interface DayGroup {
  iso: string
  rows: { id: string; outPaise: number; inPaise: number }[]
}

export function TransactionsScreen() {
  const { user, navigate } = useUi()
  const accounts = useAccounts()
  const categories = useCategories()

  const [accountId, setAccountId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all')
  const [month, setMonth] = useState<string>('') // '' = all time
  const [limit, setLimit] = useState(50)

  const filters = {
    accountId: accountId ?? undefined,
    categoryId: categoryId ?? undefined,
    month: month || undefined,
    direction: direction === 'all' ? undefined : direction,
    limit,
  }
  const txns = useTransactions(filters)

  const account = (accounts.data ?? []).find((a) => a.id === accountId)

  // Group by day + running balance for account-filtered views (computed
  // backwards from the current balance so history always reconciles).
  const { groups, dayTotals } = useMemo(() => {
    const items = txns.data?.items ?? []
    const g = new Map<string, typeof items>()
    for (const t of items) {
      const arr = g.get(t.date) ?? []
      arr.push(t)
      g.set(t.date, arr)
    }
    let running = account?.balancePaise ?? 0
    const totals = new Map<string, { net: number; out: number; in: number; balance?: number }>()
    // walk newest day first; balance label only meaningful when filtered
    const days = [...g.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
    for (const [iso, rows] of days) {
      let out = 0
      let inn = 0
      for (const t of rows) {
        const signed = t.direction === 'out' ? -t.amountPaise : t.amountPaise
        if (t.direction === 'out') out += t.amountPaise
        else inn += t.amountPaise
        if (account) running -= signed // rows are newest-first
      }
      totals.set(iso, { net: inn - out, out, in: inn, balance: account ? running : undefined })
    }
    return { groups: days, dayTotals: totals }
  }, [txns.data, account])

  const totals = txns.data?.totalPaise

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2 px-1">
        <button type="button" onClick={() => navigate('/money')} className="text-muted-foreground" aria-label="Back to Money">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
      </header>

      {/* filters */}
      <section className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
        <div className="grid grid-cols-2 gap-2">
          <Select value={accountId ?? 'all'} onValueChange={(v) => setAccountId(v === 'all' ? null : v)}>
            <SelectTrigger className="h-10 rounded-xl" aria-label="Filter by account">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {(accounts.data ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryId ?? 'all'} onValueChange={(v) => setCategoryId(v === 'all' ? null : v)}>
            <SelectTrigger className="h-10 rounded-xl" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(categories.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={direction} onValueChange={(v) => setDirection(v as typeof direction)}>
            <SelectTrigger className="h-10 rounded-xl" aria-label="Filter by direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">In + out</SelectItem>
              <SelectItem value="out">Expenses</SelectItem>
              <SelectItem value="in">Income</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Input type="month" value={month} max={todayISO(user.timezone).slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-xl pr-8" aria-label="Filter by month" />
            {month && (
              <button type="button" aria-label="Clear month" onClick={() => setMonth('')} className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        {totals && (totals.in > 0 || totals.out > 0) && (
          <p className="px-1 text-xs text-muted-foreground">
            Filtered totals: <span className="font-semibold text-expense">−{formatINRCompact(totals.out)}</span>{' '}
            <span className="font-semibold text-income">+{formatINRCompact(totals.in)}</span>
          </p>
        )}
      </section>

      {/* account balance header */}
      {account && (
        <section className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Current balance · {account.name}</p>
          <Money paise={account.balancePaise} className="text-2xl font-bold" />
        </section>
      )}

      {/* list */}
      {txns.isLoading ? (
        <SkeletonRow />
      ) : txns.isError ? (
        <ErrorCard message={(txns.error as Error).message} onRetry={() => txns.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState emoji="🍃" title="Nothing matches" body="Try widening the filters, or add something with the + button." />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([iso, rows]) => {
            const t = dayTotals.get(iso)
            return (
              <div key={iso}>
                <SectionHeader
                  title={iso === todayISO(user.timezone) ? 'Today' : formatDayLabel(iso)}
                  action={
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {t && t.in > 0 && <span className="text-income">+{formatINRCompact(t.in)}</span>}
                      {t && t.out > 0 && <span className="text-expense">−{formatINRCompact(t.out)}</span>}
                      {t?.balance !== undefined && <span className="font-semibold text-foreground">bal {formatINRCompact(t.balance)}</span>}
                    </span>
                  }
                />
                <div className="flex flex-col gap-2">
                  {rows.map((row) => (
                    <TransactionRow key={row.id} txn={row} />
                  ))}
                </div>
              </div>
            )
          })}
          {txns.data?.nextOffset != null && (
            <Button variant="outline" className="rounded-full" onClick={() => setLimit((l) => l + 50)}>
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

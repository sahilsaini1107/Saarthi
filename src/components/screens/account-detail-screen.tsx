'use client'

// Account detail: card vitals (limit / statement / due / utilization) +
// the account's transaction history.

import { useUi } from '@/components/saarthi-app'
import { useAccounts, useDeleteAccount, useTransactions } from '@/hooks/queries'
import { AccountFormSheet } from '@/components/money/account-form-sheet'
import { TransactionRow } from '@/components/money/transaction-row'
import { EmptyState, ErrorCard, Money, ProgressBar, SkeletonRow, utilizationTone } from '@/components/ui/saarthi'
import { Button } from '@/components/ui/button'
import { ACCOUNT_TYPE_LABELS } from '@/lib/constants'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import type { AccountWithUtilization } from '@/services/accounts'

export function AccountDetailScreen({ accountId }: { accountId: string }) {
  const { navigate, openQuickAdd } = useUi()
  const accounts = useAccounts()
  const txns = useTransactions({ accountId, limit: 100 })
  const del = useDeleteAccount({ success: 'Account deleted' })
  const [editOpen, setEditOpen] = useState(false)

  if (accounts.isLoading) return <SkeletonRow />
  if (accounts.isError) return <ErrorCard message={(accounts.error as Error).message} onRetry={() => accounts.refetch()} />

  const account = (accounts.data ?? []).find((a) => a.id === accountId) as AccountWithUtilization | undefined
  if (!account) {
    return <EmptyState emoji="🤷" title="Account not found" body="It may have been deleted." action={<Button size="sm" className="mt-2 rounded-full" onClick={() => navigate('/money/accounts')}>Back to accounts</Button>} />
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between px-1">
        <button type="button" onClick={() => navigate('/money/accounts')} className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Back">
          <ArrowLeft className="size-4" /> Accounts
        </button>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3 text-xs text-expense hover:text-expense"
            onClick={() => {
              if (confirm(`Delete "${account.name}" and its transactions?`)) del.mutate(account.id, { onSuccess: () => navigate('/money/accounts') })
            }}
          >
            Delete
          </Button>
        </div>
      </header>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: account.color }} aria-hidden />
          <h1 className="text-lg font-bold">{account.name}</h1>
        </div>
        <p className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[account.type]}</p>
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">{account.type === 'credit_card' ? 'Outstanding' : 'Balance'}</p>
          <Money paise={account.balancePaise} className="text-3xl font-bold" />
        </div>

        {account.type === 'credit_card' && (
          <div className="mt-4 flex flex-col gap-2">
            {account.utilizationPct !== null && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>
                    Utilisation · {account.utilizationPct}% of {((account.creditLimitPaise ?? 0) / 100).toLocaleString('en-IN')}
                  </span>
                  <span>{account.utilizationPct < 30 ? 'healthy' : account.utilizationPct <= 70 ? 'watch this' : 'high'}</span>
                </div>
                <ProgressBar value={account.utilizationPct} tone={utilizationTone(account.utilizationPct)} className="h-1.5" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">Statement day</p>
                <p className="font-semibold">{account.statementDay ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">Payment due day</p>
                <p className="font-semibold">{account.dueDay ?? '—'}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        {txns.isLoading ? (
          <SkeletonRow />
        ) : txns.isError ? (
          <ErrorCard message={(txns.error as Error).message} onRetry={() => txns.refetch()} />
        ) : (txns.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            compact
            emoji="🧾"
            title="No transactions here yet"
            body="Use the + button to log the first one."
            action={
              <Button size="sm" className="mt-1 rounded-full" onClick={() => openQuickAdd()}>
                <Plus className="size-4" /> Add
              </Button>
            }
          />
        ) : (
          txns.data!.items.map((t) => <TransactionRow key={t.id} txn={t} showAccount={false} />)
        )}
      </section>

      <AccountFormSheet open={editOpen} onOpenChange={setEditOpen} account={account} />
    </div>
  )
}

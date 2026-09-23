'use client'

// Accounts list (task 1.1) with add/edit/delete.

import { useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { useAccounts, useDeleteAccount } from '@/hooks/queries'
import { AccountFormSheet } from '@/components/money/account-form-sheet'
import { EmptyState, ErrorCard, Money, ProgressBar, SectionHeader, SkeletonRow, utilizationTone } from '@/components/ui/saarthi'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ACCOUNT_TYPE_LABELS } from '@/lib/constants'
import { Plus } from 'lucide-react'
import type { AccountWithUtilization } from '@/services/accounts'

export function AccountsScreen() {
  const { navigate } = useUi()
  const accounts = useAccounts()
  const del = useDeleteAccount({ success: 'Account deleted' })
  const [sheet, setSheet] = useState<{ open: boolean; account: AccountWithUtilization | null }>({ open: false, account: null })

  if (accounts.isLoading) return <SkeletonRow />
  if (accounts.isError) return <ErrorCard message={(accounts.error as Error).message} onRetry={() => accounts.refetch()} />

  const list = accounts.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <Button size="sm" className="h-9 rounded-full" onClick={() => setSheet({ open: true, account: null })}>
          <Plus className="size-4" /> Add
        </Button>
      </header>

      {list.length === 0 ? (
        <EmptyState
          emoji="🏦"
          title="No accounts yet"
          body="Savings, cash or a credit card — pick where your money lives. Quick-add will use these."
          action={
            <Button size="sm" className="mt-2 rounded-full" onClick={() => setSheet({ open: true, account: null })}>
              Add your first account
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((a) => (
            <Card key={a.id} className="rounded-2xl p-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="min-w-0 text-left" onClick={() => navigate(`/money/accounts/${a.id}`)}>
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: a.color }} aria-hidden />
                      <p className="truncate font-semibold">{a.name}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ACCOUNT_TYPE_LABELS[a.type]}
                      {a.type === 'credit_card' && a.dueDay ? ` · due day ${a.dueDay}` : ''}
                    </p>
                  </button>
                  <div className="flex flex-col items-end gap-1">
                    <Money paise={a.balancePaise} className="text-lg font-bold" />
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 rounded-full px-3 text-xs" onClick={() => setSheet({ open: true, account: a })}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-full px-3 text-xs text-expense hover:text-expense"
                        disabled={del.isPending}
                        onClick={() => {
                          if (confirm(`Delete "${a.name}" and its transactions? This cannot be undone.`)) del.mutate(a.id)
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
                {a.type === 'credit_card' && a.utilizationPct !== null && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>
                        {a.utilizationPct}% of {(a.creditLimitPaise ?? 0) / 100 > 0 ? 'limit' : ''}
                      </span>
                      <span>{a.utilizationPct < 30 ? 'healthy' : a.utilizationPct <= 70 ? 'watch this' : 'high utilization'}</span>
                    </div>
                    <ProgressBar value={a.utilizationPct} tone={utilizationTone(a.utilizationPct)} className="h-1.5" />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SectionHeader title="" />
      <AccountFormSheet open={sheet.open} account={sheet.account} onOpenChange={(o) => setSheet({ open: o, account: o ? sheet.account : null })} />
    </div>
  )
}

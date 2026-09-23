'use client'

// Single transaction row — tap to edit (opens the Quick-Add sheet in edit mode).

import { Money } from '@/components/ui/saarthi'
import { useUi } from '@/components/saarthi-app'
import { formatDayLabel } from '@/lib/date'
import type { TransactionDTO } from '@/lib/types'

export function TransactionRow({ txn, showAccount = true }: { txn: TransactionDTO; showAccount?: boolean }) {
  const { openQuickAdd } = useUi()
  return (
    <button
      type="button"
      onClick={() => openQuickAdd(txn)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-colors hover:bg-accent"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-lg"
          style={{ background: (txn.categoryColor ?? '#94A3B8') + '1a' }}
          aria-hidden
        >
          {txn.categoryEmoji ?? '❓'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{txn.categoryName ?? 'Uncategorised'}</p>
          <p className="truncate text-xs text-muted-foreground">
            {txn.note || (showAccount ? txn.accountName : '')}
            {showAccount && txn.note ? ` · ${txn.accountName}` : ''} · {formatDayLabel(txn.date)}
          </p>
        </div>
      </div>
      <Money paise={txn.amountPaise} signed={txn.direction as 'in' | 'out'} className="shrink-0 text-sm font-bold" />
    </button>
  )
}

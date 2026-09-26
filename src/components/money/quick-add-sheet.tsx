'use client'

// Quick-Add FAB flow (task 1.2): amount → category → save. 2 taps after typing.
// Doubles as the transaction editor (1.3) when opened with an editTxn.
// The form remounts fresh on each open (keyed) — no effect-based state sync.

import { useMemo, useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { AmountPad } from '@/components/ui/amount-pad'
import { Chip } from '@/components/ui/saarthi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAccounts, useCategories, useRecentTransactions, useSaveTransaction, useDeleteTransaction, useTrips } from '@/hooks/queries'
import { useUi } from '@/components/saarthi-app'
import { enqueueQuickAdd, newClientKey } from '@/lib/offline-queue'
import { toast } from 'sonner'
import { parseAmountToPaise } from '@/lib/money'
import { todayISO } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { TransactionDTO, TxnSource } from '@/lib/types'

const LAST_ACCOUNT_KEY = 'saarthi.lastAccountId'
const LAST_TRIP_KEY = 'saarthi.lastTripId'

/** Capture draft prefill (Phase 6): voice/message/receipt results open the
 *  same Quick-Add form, with the capture source preserved on save. */
export interface QuickAddPreset {
  source: TxnSource
  direction?: 'in' | 'out'
  amountPaise?: number | null
  date?: string
  note?: string | null
  categoryId?: string | null
}

export function QuickAddSheet({
  open,
  onOpenChange,
  editTxn,
  initialTripId,
  preset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editTxn?: TransactionDTO
  /** pre-attached trip (e.g. "Add expense" from a trip detail screen) */
  initialTripId?: string
  /** capture draft prefill (voice / message / receipt) */
  preset?: QuickAddPreset
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>
            {editTxn ? 'Edit transaction' : preset ? 'Review captured expense' : 'Quick add'}
          </DrawerTitle>
          <DrawerDescription>
            {preset && !editTxn ? 'Check what we parsed, adjust anything, then save.' : 'Amount → category → save. Two taps, under ten seconds.'}
          </DrawerDescription>
        </DrawerHeader>
        {open && (
          <QuickAddForm
            key={editTxn?.id ?? `new-${initialTripId ?? ''}-${preset?.source ?? ''}-${preset?.amountPaise ?? ''}`}
            editTxn={editTxn}
            initialTripId={initialTripId}
            preset={preset}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function QuickAddForm({ editTxn, onClose, initialTripId, preset }: { editTxn?: TransactionDTO; onClose: () => void; initialTripId?: string; preset?: QuickAddPreset }) {
  const { user } = useUi()
  const accounts = useAccounts()
  const categories = useCategories()
  const recent = useRecentTransactions(true)
  const trips = useTrips()
  const save = useSaveTransaction({})
  const del = useDeleteTransaction({ success: 'Transaction deleted' })

  const [directionValue, setDirectionValue] = useState<'out' | 'in'>(editTxn?.direction ?? preset?.direction ?? 'out')
  const [amount, setAmount] = useState(
    editTxn ? String(editTxn.amountPaise / 100) : preset?.amountPaise != null ? String(preset.amountPaise / 100) : '',
  )

  // Recent-first category order (task 1.2).
  const orderedCategories = useMemo(() => {
    const list = (categories.data ?? []).filter((c) => c.kind === (directionValue === 'out' ? 'expense' : 'income'))
    const used = (recent.data?.items ?? [])
      .filter((t) => t.direction === directionValue && t.categoryId)
      .map((t) => t.categoryId as string)
    const seen: string[] = []
    for (const id of used) if (!seen.includes(id)) seen.push(id)
    return [...list.filter((c) => seen.includes(c.id)), ...list.filter((c) => !seen.includes(c.id))]
  }, [categories.data, recent.data, directionValue])

  const [categoryId, setCategoryId] = useState<string | null>(
    // preset category only applies when it exists (kind may not match)
    editTxn?.categoryId ??
      (preset?.categoryId && (categories.data ?? []).some((c) => c.id === preset.categoryId) ? preset.categoryId : null),
  )
  // Account memory (last-used) is DERIVED, not mounted state: if the stored
  // id is stale (e.g. from another user/session) it falls back to the first
  // loaded account; while the query is in flight the value is simply null
  // and the Save button stays disabled (same as Phase 1, but self-healing).
  const [pickedAccountId, setPickedAccountId] = useState<string | null>(
    editTxn?.accountId ?? localStorage.getItem(LAST_ACCOUNT_KEY) ?? null,
  )
  const accountId = accounts.data?.some((a) => a.id === pickedAccountId)
    ? pickedAccountId
    : accounts.data?.[0]?.id ?? null
  const [date, setDate] = useState(editTxn?.date ?? preset?.date ?? todayISO(user.timezone))
  const [note, setNote] = useState(editTxn?.note ?? preset?.note ?? '')

  // Trip attribution (Phase 5.2): ongoing trips get chips; the last-used
  // trip is remembered like the last-used account. A trip passed from a
  // detail screen always wins until the user touches the chips (tri-state:
  // null = untouched, { v } = explicit pick/unpick).
  const ongoingTrips = (trips.data ?? []).filter((t) => t.phase === 'ongoing')
  const [tripPick, setTripPick] = useState<{ v: string | null } | null>(null)
  const rememberedTripId = useMemo(() => {
    if (editTxn?.tripId || initialTripId) return null // explicit context wins
    const stored = localStorage.getItem(LAST_TRIP_KEY)
    return stored && ongoingTrips.some((t) => t.id === stored) ? stored : null
  }, [ongoingTrips, editTxn?.tripId, initialTripId])
  const tripId = tripPick ? tripPick.v : (editTxn?.tripId ?? initialTripId ?? rememberedTripId)

  const paise = parseAmountToPaise(amount)
  const canSave = paise != null && !!accountId

  function onSave() {
    if (!canSave || !accountId || paise == null) return
    const source = editTxn?.source ?? preset?.source ?? 'manual'
    // Idempotency key (Decision #38): every NEW entry gets one so an offline
    // retry (or double tap) can never create a duplicate. Edits keep their id.
    const clientKey = editTxn ? null : newClientKey()
    // Offline: enqueue directly (instant feedback, survives tab close) —
    // the shell's useOfflineQueue replays it on reconnect.
    if (!editTxn && !navigator.onLine) {
      enqueueQuickAdd({
        accountId,
        categoryId,
        amountPaise: paise,
        direction: directionValue,
        date,
        note: note || null,
        source,
        tripId: tripId ?? null,
      })
      localStorage.setItem(LAST_ACCOUNT_KEY, accountId)
      toast.success('Saved offline — it will sync automatically when you’re back online')
      onClose()
      return
    }
    save.mutate(
      {
        id: editTxn?.id,
        accountId,
        categoryId,
        amountPaise: paise,
        direction: directionValue,
        date,
        note: note || null,
        source,
        tripId: tripId ?? null,
        clientKey,
      },
      {
        onSuccess: () => {
          localStorage.setItem(LAST_ACCOUNT_KEY, accountId)
          if (tripId) localStorage.setItem(LAST_TRIP_KEY, tripId)
          else localStorage.removeItem(LAST_TRIP_KEY)
          onClose()
        },
        onError: (err) => {
          // the hook queues offline saves (same condition); close so the
          // user sees the confirmation toast, keep open on server errors
          const status = (err as { status?: number }).status
          if (status === undefined && !navigator.onLine) {
            localStorage.setItem(LAST_ACCOUNT_KEY, accountId)
            onClose()
          }
        },
      },
    )
  }

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      {/* direction toggle */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Direction">
        {(['out', 'in'] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={directionValue === d}
            onClick={() => {
              setDirectionValue(d)
              setCategoryId(null)
            }}
            className={cn(
              'h-9 rounded-lg text-sm font-semibold transition-all',
              directionValue === d && (d === 'out' ? 'bg-expense text-white' : 'bg-income text-white'),
              directionValue !== d && 'text-muted-foreground',
            )}
          >
            {d === 'out' ? 'Expense' : 'Income'}
          </button>
        ))}
      </div>

      <AmountPad value={amount} onChange={setAmount} hint={directionValue === 'out' ? 'Spending' : 'Income'} />

      {/* category chips */}
      <div className="mt-4">
        <p className="mb-2 px-1 text-sm font-medium text-muted-foreground">Category</p>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {orderedCategories.map((c) => (
            <Chip key={c.id} emoji={c.emoji} label={c.name} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} />
          ))}
          {orderedCategories.length === 0 && (
            <span className="px-1 py-2 text-sm text-muted-foreground">
              {categories.isPending
                ? 'Loading categories…'
                : categories.isError
                  ? 'Categories could not be loaded'
                  : `No ${directionValue === 'out' ? 'expense' : 'income'} categories yet`}
            </span>
          )}
        </div>
      </div>

      {/* account chips */}
      <div className="mt-3">
        <p className="mb-2 px-1 text-sm font-medium text-muted-foreground">Account</p>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {(accounts.data ?? []).map((a) => (
            <Chip key={a.id} label={a.name} color={a.color} active={accountId === a.id} onClick={() => setPickedAccountId(a.id)} />
          ))}
          {(accounts.data ?? []).length === 0 && (
            <span className="px-1 py-2 text-sm text-muted-foreground">
              {accounts.isPending
                ? 'Loading accounts…'
                : accounts.isError
                  ? 'Accounts could not be loaded'
                  : 'Add an account first'}
            </span>
          )}
        </div>
      </div>

      {/* trip chips (Phase 5.2) — only when a trip is ongoing */}
      {ongoingTrips.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 px-1 text-sm font-medium text-muted-foreground">Trip (optional)</p>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {ongoingTrips.map((t) => (
              <Chip
                key={t.id}
                emoji={t.emoji}
                label={t.name}
                active={tripId === t.id}
                onClick={() => setTripPick({ v: tripId === t.id ? null : t.id })}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">Date</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl bg-card" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">Note (optional)</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cab to airport" className="h-11 rounded-xl" />
        </label>
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={onSave} disabled={!canSave || save.isPending} className="h-12 flex-1 rounded-xl text-base font-semibold">
          {save.isPending ? 'Saving…' : editTxn ? 'Save changes' : 'Save'}
        </Button>
        {editTxn && (
          <Button
            variant="ghost"
            disabled={del.isPending}
            className="h-12 rounded-xl px-4 text-expense hover:text-expense"
            onClick={() => {
              if (confirm('Delete this transaction? Balances will be adjusted.')) {
                del.mutate(editTxn.id, { onSuccess: onClose })
              }
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}

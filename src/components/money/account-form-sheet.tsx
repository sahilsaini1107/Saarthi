'use client'

// Account create/edit sheet (task 1.1). Mount-fresh form: no effect syncing.

import { useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/saarthi'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSaveAccount } from '@/hooks/queries'
import { JobPicker } from '@/components/money/job-picker'
import { suggestJobForAccount } from '@/lib/planner'
import { formatINR, parseAmountToPaise } from '@/lib/money'
import type { AccountWithUtilization } from '@/services/accounts'

const COLORS = ['#0D9488', '#16A34A', '#EF4444', '#F97316', '#A855F7', '#64748B']

export function AccountFormSheet({
  open,
  onOpenChange,
  account,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  account?: AccountWithUtilization | null // null = create
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{account ? 'Edit account' : 'Add account'}</DrawerTitle>
          <DrawerDescription>
            {account ? 'Update details — balance moves with transactions.' : 'Opening balance is optional; quick-add keeps it current.'}
          </DrawerDescription>
        </DrawerHeader>
        {open && (
          <AccountForm
            key={account?.id ?? 'new'}
            account={account ?? null}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function AccountForm({ account, onClose }: { account: AccountWithUtilization | null; onClose: () => void }) {
  const save = useSaveAccount({ success: account ? 'Account updated' : 'Account added' })
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<'savings' | 'cash' | 'credit_card'>(account?.type ?? 'savings')
  const [balance, setBalance] = useState(account ? String(account.balancePaise / 100) : '')
  const [limit, setLimit] = useState(account?.creditLimitPaise ? String(account.creditLimitPaise / 100) : '')
  const [statementDay, setStatementDay] = useState(account?.statementDay ? String(account.statementDay) : '')
  const [dueDay, setDueDay] = useState(account?.dueDay ? String(account.dueDay) : '')
  const [color, setColor] = useState(account?.color ?? COLORS[0])
  const [job, setJob] = useState(account?.job ?? null)

  const balancePaise = parseAmountToPaise(balance)
  const limitPaise = limit ? parseAmountToPaise(limit) : null
  const valid = name.trim().length > 0 && (type !== 'credit_card' || (limitPaise ?? 0) > 0)

  function onSave() {
    if (!valid) return
    save.mutate(
      {
        id: account?.id,
        name: name.trim(),
        type,
        ...(type === 'credit_card'
          ? { creditLimitPaise: limitPaise, balancePaise: balancePaise ?? 0 }
          : { balancePaise: account ? undefined : balancePaise ?? 0 }),
        statementDay: statementDay ? Number(statementDay) : null,
        dueDay: dueDay ? Number(dueDay) : null,
        color,
        job,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Savings" />
      </Field>
      <Field label="Type">
        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger className="h-11 w-full rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="savings">Savings</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="credit_card">Credit card</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {type !== 'credit_card' && (
        <Field label="Job · portfolio role" hint={type === 'savings' || type === 'cash' ? 'Suggested: 💧 Liquidity' : undefined}>
          <JobPicker value={job} suggested={suggestJobForAccount(type)} onChange={setJob} />
        </Field>
      )}

      {type === 'credit_card' ? (
        <>
          <Field label="Credit limit (₹)" hint={limitPaise ? `Limit: ${formatINR(limitPaise)}` : 'Required for utilization tracking'}>
            <Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="200000" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Statement day">
              <Input inputMode="numeric" value={statementDay} onChange={(e) => setStatementDay(e.target.value.replace(/\D/g, ''))} placeholder="5" />
            </Field>
            <Field label="Due day">
              <Input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ''))} placeholder="23" />
            </Field>
          </div>
          <Field label="Outstanding right now (₹)" hint={account ? 'Edit via transactions for a clean trail' : 'Optional'}>
            <Input inputMode="decimal" disabled={!!account} value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0" />
          </Field>
        </>
      ) : (
        !account && (
          <Field label="Opening balance (₹)">
            <Input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="10000" />
          </Field>
        )
      )}

      <Field label="Colour">
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
              className={`size-8 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-card' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>

      <Button onClick={onSave} disabled={!valid || save.isPending} className="mt-2 h-12 rounded-xl text-base font-semibold">
        {save.isPending ? 'Saving…' : account ? 'Save changes' : 'Add account'}
      </Button>
    </div>
  )
}

'use client'

// Bill create/edit sheet (task 1.6). Mount-fresh form: no effect syncing.

import { useMemo, useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/saarthi'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccounts, useCategories, useSaveBill } from '@/hooks/queries'
import { parseAmountToPaise } from '@/lib/money'
import { todayISO, toUTC } from '@/lib/date'
import { advanceDue, isoOf } from '@/lib/recurrence'
import type { BillWithMeta } from '@/services/bills'

const FREQ_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  custom_days: 'Every N days',
}

export function BillFormSheet({ open, onOpenChange, bill }: { open: boolean; onOpenChange: (o: boolean) => void; bill?: BillWithMeta | null }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{bill ? 'Edit bill' : 'Schedule a bill'}</DrawerTitle>
          <DrawerDescription>Recurring logic survives short months — a 31st stays a 31st where possible.</DrawerDescription>
        </DrawerHeader>
        {open && <BillForm key={bill?.id ?? 'new'} bill={bill ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function BillForm({ bill, onClose }: { bill: BillWithMeta | null; onClose: () => void }) {
  const save = useSaveBill({ success: bill ? 'Bill updated' : 'Bill scheduled' })
  const accounts = useAccounts()
  const categories = useCategories()
  const [name, setName] = useState(bill?.name ?? '')
  const [amount, setAmount] = useState(bill ? String(bill.amountPaise / 100) : '')
  const [frequency, setFrequency] = useState<string>(bill?.frequency ?? 'monthly')
  const [customDays, setCustomDays] = useState(bill?.customDays ? String(bill.customDays) : '30')
  const [nextDue, setNextDue] = useState(bill?.nextDue ?? todayISO('Asia/Kolkata'))
  const [remindDaysBefore, setRemindDaysBefore] = useState(String(bill?.remindDaysBefore ?? 1))
  const [categoryId, setCategoryId] = useState<string>(bill?.categoryId ?? 'none')
  const [accountId, setAccountId] = useState<string>(bill?.accountId ?? 'none')

  const amountPaise = parseAmountToPaise(amount)
  const valid = name.trim().length > 0 && !!amountPaise && /^\d{4}-\d{2}-\d{2}$/.test(nextDue) && (frequency !== 'custom_days' || (Number(customDays) >= 1 && Number(customDays) <= 365))

  // Show the following occurrence so users see the schedule logic live.
  const following = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) return null
    try {
      const due = toUTC(nextDue)
      const next = advanceDue(due, frequency as 'monthly' | 'quarterly' | 'annual' | 'custom_days', {
        customDays: frequency === 'custom_days' ? Number(customDays) || 30 : undefined,
      })
      return isoOf(next)
    } catch {
      return null
    }
  }, [nextDue, frequency, customDays])

  function onSave() {
    if (!amountPaise) return
    const payload = {
      name: name.trim(),
      amountPaise,
      frequency: frequency as 'monthly' | 'quarterly' | 'annual' | 'custom_days',
      customDays: frequency === 'custom_days' ? Number(customDays) : null,
      nextDue,
      remindDaysBefore: Number(remindDaysBefore) || 0,
      categoryId: categoryId === 'none' ? null : categoryId,
      accountId: accountId === 'none' ? null : accountId,
    }
    save.mutate(bill ? { id: bill.id, ...payload } : payload, { onSuccess: onClose })
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Broadband" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="799" />
        </Field>
        <Field label="Next due">
          <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className="h-11 rounded-xl" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequency">
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger className="h-11 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FREQ_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {frequency === 'custom_days' ? (
          <Field label="Every (days)">
            <Input inputMode="numeric" value={customDays} onChange={(e) => setCustomDays(e.target.value.replace(/\D/g, ''))} />
          </Field>
        ) : (
          <Field label="Remind days before">
            <Input inputMode="numeric" value={remindDaysBefore} onChange={(e) => setRemindDaysBefore(e.target.value.replace(/\D/g, ''))} />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-11 w-full rounded-xl">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {(categories.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Pay from account">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="h-11 w-full rounded-xl">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Default (first)</SelectItem>
              {(accounts.data ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {following && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          Following occurrence: <span className="font-semibold text-foreground">{following}</span>
        </p>
      )}

      <Button onClick={onSave} disabled={!valid || save.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {save.isPending ? 'Saving…' : bill ? 'Save changes' : 'Schedule bill'}
      </Button>
    </div>
  )
}

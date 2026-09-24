'use client'

// FD create/edit sheet with LIVE maturity preview (same unit-tested lib
// functions the server uses). Mount-fresh form: no effect syncing.

import { useMemo, useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Money } from '@/components/ui/saarthi'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useDeleteFd, useSaveFd } from '@/hooks/queries'
import { JobPicker } from '@/components/money/job-picker'
import { suggestJobForDeposit } from '@/lib/planner'
import { parseAmountToPaise } from '@/lib/money'
import { isoDayUTC, todayISO } from '@/lib/date'
import { maturityAmountPaise, maturityDateUTC } from '@/lib/fd'
import type { FdWithMeta } from '@/services/fds'

const COMPOUND_LABELS: Record<string, string> = {
  simple: 'Simple interest',
  annual: 'Annual',
  half_yearly: 'Half-yearly',
  quarterly: 'Quarterly (most banks)',
  monthly: 'Monthly',
}

export function FdFormSheet({ open, onOpenChange, fd }: { open: boolean; onOpenChange: (o: boolean) => void; fd?: FdWithMeta | null }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{fd ? 'Edit FD' : 'Track a fixed deposit'}</DrawerTitle>
          <DrawerDescription>Maturity date and amount are computed for you — never miscount a renewal again.</DrawerDescription>
        </DrawerHeader>
        {open && <FdForm key={fd?.id ?? 'new'} fd={fd ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function FdForm({ fd, onClose }: { fd: FdWithMeta | null; onClose: () => void }) {
  const { user } = useUi()
  const save = useSaveFd({ success: fd ? 'FD updated' : 'FD added to your ladder' })
  const del = useDeleteFd({ success: 'FD removed' })
  const [bank, setBank] = useState(fd?.bank ?? '')
  const [principal, setPrincipal] = useState(fd ? String(fd.principalPaise / 100) : '')
  const [rate, setRate] = useState(fd ? String(fd.ratePct) : '')
  const [tenure, setTenure] = useState(fd ? String(fd.tenureMonths) : '')
  const [startDate, setStartDate] = useState(fd?.startDate ?? todayISO(user.timezone))
  const [compounding, setCompounding] = useState<string>(fd?.compounding ?? 'quarterly')
  const [autoRenew, setAutoRenew] = useState(fd?.autoRenew ?? false)
  const [job, setJob] = useState(fd?.job ?? null)

  const preview = useMemo(() => {
    const P = parseAmountToPaise(principal)
    const r = Number(rate)
    const t = Number(tenure)
    if (!P || !Number.isFinite(r) || r <= 0 || !Number.isInteger(t) || t < 1) return null
    const c = compounding as Parameters<typeof maturityAmountPaise>[3]
    return {
      maturityDate: isoDayUTC(maturityDateUTC(startDate || todayISO(user.timezone), t)),
      maturityPaise: maturityAmountPaise(P, r, t, c),
      principalPaise: P,
    }
  }, [principal, rate, tenure, startDate, compounding])

  const valid = bank.trim().length > 0 && !!preview

  function onSave() {
    if (!preview) return
    save.mutate(
      fd
        ? { id: fd.id, bank: bank.trim(), ratePct: Number(rate), autoRenew, job }
        : {
            bank: bank.trim(),
            principalPaise: preview.principalPaise,
            ratePct: Number(rate),
            tenureMonths: Number(tenure),
            startDate,
            compounding,
            autoRenew,
            job,
          },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Bank / institution">
        <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. SBI" />
      </Field>
      <Field label="Job · portfolio role" hint="Suggested: 🛡️ Safety">
        <JobPicker value={job} suggested={suggestJobForDeposit()} onChange={setJob} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Principal (₹)">
          <Input inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="100000" />
        </Field>
        <Field label="Rate (% p.a.)">
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="7.1" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tenure (months)">
          <Input inputMode="numeric" value={tenure} onChange={(e) => setTenure(e.target.value.replace(/\D/g, ''))} placeholder="12" />
        </Field>
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 rounded-xl" />
        </Field>
      </div>
      <Field label="Compounding">
        <Select value={compounding} onValueChange={setCompounding}>
          <SelectTrigger className="h-11 w-full rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(COMPOUND_LABELS).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {!fd && (
        <div className="flex items-center justify-between rounded-xl border p-3">
          <div>
            <p className="text-sm font-medium">Auto-renew on maturity</p>
            <p className="text-xs text-muted-foreground">You will still get reminder nudges</p>
          </div>
          <Switch checked={autoRenew} onCheckedChange={setAutoRenew} />
        </div>
      )}

      {preview && (
        <div className="rounded-2xl bg-primary/5 p-4">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Maturity preview</p>
          <div className="mt-1.5 flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground">On {preview.maturityDate}</p>
              <Money paise={preview.maturityPaise} className="text-2xl font-bold" />
            </div>
            <p className="text-sm font-semibold text-income">
              +{((preview.maturityPaise - preview.principalPaise) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })} interest
            </p>
          </div>
        </div>
      )}

      <Button onClick={onSave} disabled={!valid || save.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {save.isPending ? 'Saving…' : fd ? 'Save changes' : 'Add to ladder'}
      </Button>
      {fd && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Remove the ${fd.bank} FD from your ladder?`)) del.mutate(fd.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          Remove FD
        </Button>
      )}
    </div>
  )
}

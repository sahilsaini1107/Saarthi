'use client'

// RD create/edit sheet with LIVE maturity preview (same unit-tested lib
// functions the server uses). Mount-fresh form: no effect syncing.

import { useMemo, useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Money } from '@/components/ui/saarthi'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useDeleteRd, useSaveRd } from '@/hooks/queries'
import { JobPicker } from '@/components/money/job-picker'
import { suggestJobForDeposit } from '@/lib/planner'
import { parseAmountToPaise } from '@/lib/money'
import { isoDayUTC, todayISO } from '@/lib/date'
import { rdMaturityAmountPaise, rdMaturityDateUTC } from '@/lib/rd'
import type { RdWithMeta } from '@/services/rds'

const COMPOUND_LABELS: Record<string, string> = {
  quarterly: 'Quarterly (most banks)',
  monthly: 'Monthly',
  annual: 'Annual',
  simple: 'Simple interest',
}

export function RdFormSheet({ open, onOpenChange, rd }: { open: boolean; onOpenChange: (o: boolean) => void; rd?: RdWithMeta | null }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{rd ? 'Edit RD' : 'Start a recurring deposit'}</DrawerTitle>
          <DrawerDescription>Monthly installments, maturity value — computed for you, installment bill included.</DrawerDescription>
        </DrawerHeader>
        {open && <RdForm key={rd?.id ?? 'new'} rd={rd ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function RdForm({ rd, onClose }: { rd: RdWithMeta | null; onClose: () => void }) {
  const { user } = useUi()
  const save = useSaveRd({ success: rd ? 'RD updated' : 'RD started — installment bill created' })
  const del = useDeleteRd({ success: 'RD removed (installment bill too)' })
  const [bank, setBank] = useState(rd?.bank ?? '')
  const [installment, setInstallment] = useState(rd ? String(rd.installmentPaise / 100) : '')
  const [rate, setRate] = useState(rd ? String(rd.ratePct) : '')
  const [tenure, setTenure] = useState(rd ? String(rd.tenureMonths) : '')
  const [startDate, setStartDate] = useState(rd?.startDate ?? todayISO(user.timezone))
  const [compounding, setCompounding] = useState<string>(rd?.compounding ?? 'quarterly')
  const [autoRenew, setAutoRenew] = useState(rd?.autoRenew ?? false)
  const [autoBill, setAutoBill] = useState(true)
  const [job, setJob] = useState(rd?.job ?? null)

  const preview = useMemo(() => {
    const inst = parseAmountToPaise(installment)
    const r = Number(rate)
    const t = Number(tenure)
    if (!inst || !Number.isFinite(r) || r <= 0 || !Number.isInteger(t) || t < 1) return null
    const c = compounding as Parameters<typeof rdMaturityAmountPaise>[3]
    const committed = inst * t
    const maturityPaise = rdMaturityAmountPaise(inst, r, t, c)
    return {
      maturityDate: isoDayUTC(rdMaturityDateUTC(startDate || todayISO(user.timezone), t)),
      maturityPaise,
      committed,
      installmentPaise: inst,
      interest: maturityPaise - committed,
    }
  }, [installment, rate, tenure, startDate, compounding, user.timezone])

  const valid = bank.trim().length > 0 && !!preview

  function onSave() {
    if (!preview) return
    save.mutate(
      rd
        ? { id: rd.id, bank: bank.trim(), ratePct: Number(rate), installmentPaise: preview.installmentPaise, autoRenew, job }
        : {
            bank: bank.trim(),
            installmentPaise: preview.installmentPaise,
            ratePct: Number(rate),
            tenureMonths: Number(tenure),
            startDate,
            compounding,
            autoRenew,
            autoBill,
            job,
          },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Bank / institution">
        <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. HDFC" />
      </Field>
      <Field label="Job · portfolio role" hint="Suggested: 🛡️ Safety">
        <JobPicker value={job} suggested={suggestJobForDeposit()} onChange={setJob} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly installment (₹)">
          <Input inputMode="decimal" value={installment} onChange={(e) => setInstallment(e.target.value)} placeholder="5000" />
        </Field>
        <Field label="Rate (% p.a.)">
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="7.5" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tenure (months)">
          <Input inputMode="numeric" value={tenure} onChange={(e) => setTenure(e.target.value.replace(/\D/g, ''))} placeholder="24" />
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
      {!rd && (
        <div className="flex items-center justify-between rounded-xl border p-3">
          <div>
            <p className="text-sm font-medium">Auto-create installment bill</p>
            <p className="text-xs text-muted-foreground">Monthly bill → one tap to log each installment</p>
          </div>
          <Switch checked={autoBill} onCheckedChange={setAutoBill} />
        </div>
      )}
      {!rd && (
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
              <p className="text-xs text-muted-foreground">
                On {preview.maturityDate} · you pay in ₹{(preview.committed / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <Money paise={preview.maturityPaise} className="text-2xl font-bold" />
            </div>
            <p className="text-sm font-semibold text-income">
              +{(preview.interest / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })} interest
            </p>
          </div>
        </div>
      )}

      <Button onClick={onSave} disabled={!valid || save.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {save.isPending ? 'Saving…' : rd ? 'Save changes' : 'Start RD'}
      </Button>
      {rd && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Remove the ${rd.bank} RD and its installment bill?`)) del.mutate(rd.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          Remove RD
        </Button>
      )}
    </div>
  )
}

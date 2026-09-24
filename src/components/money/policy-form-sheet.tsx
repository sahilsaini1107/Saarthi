'use client'

// Insurance policy create/edit sheet (Phase 7). Live annual-premium preview,
// drift-free next-premium schedule preview — same mount-fresh pattern as the
// bill form.

import { useMemo, useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/saarthi'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSavePolicy } from '@/hooks/queries'
import { parseAmountToPaise } from '@/lib/money'
import { formatINR } from '@/lib/money'
import { todayISO } from '@/lib/date'
import { nextPremiumDueUTC, PREMIUM_FREQUENCIES, INSURANCE_TYPES } from '@/lib/insurance'
import { isoDayUTC, toUTC } from '@/lib/date'
import type { InsurancePolicyDTO } from '@/lib/types'

const TYPE_LABELS: Record<string, string> = {
  term: 'Term life',
  health: 'Health',
  life: 'Life (ULIP/endowment)',
  vehicle: 'Vehicle',
  asset: 'Asset/home',
  other: 'Other',
}

const FREQ_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  annual: 'Annual',
}

export function PolicyFormSheet({ open, onOpenChange, policy }: { open: boolean; onOpenChange: (o: boolean) => void; policy?: InsurancePolicyDTO | null }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{policy ? 'Edit policy' : 'Add an insurance policy'}</DrawerTitle>
          <DrawerDescription>Premium reminders follow the same 30/15/7/1 ladder as deposits.</DrawerDescription>
        </DrawerHeader>
        {open && <PolicyForm key={policy?.id ?? 'new'} policy={policy ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function PolicyForm({ policy, onClose }: { policy: InsurancePolicyDTO | null; onClose: () => void }) {
  const { user } = useUi()
  const save = useSavePolicy({ success: policy ? 'Policy updated' : 'Policy added' })
  const [name, setName] = useState(policy?.name ?? '')
  const [type, setType] = useState<string>(policy?.type ?? 'health')
  const [insurer, setInsurer] = useState(policy?.insurer ?? '')
  const [policyNumber, setPolicyNumber] = useState(policy?.policyNumber ?? '')
  const [sumAssured, setSumAssured] = useState(policy ? String(policy.sumAssuredPaise / 100) : '')
  const [premium, setPremium] = useState(policy ? String(policy.premiumPaise / 100) : '')
  const [premiumFrequency, setPremiumFrequency] = useState<string>(policy?.premiumFrequency ?? 'annual')
  const [startDate, setStartDate] = useState(policy?.startDate ?? todayISO(user.timezone))
  const [nextPremiumDue, setNextPremiumDue] = useState(policy?.nextPremiumDue ?? todayISO(user.timezone))
  const [maturityDate, setMaturityDate] = useState(policy?.maturityDate ?? '')
  const [nominee, setNominee] = useState(policy?.nominee ?? '')

  const sumPaise = parseAmountToPaise(sumAssured)
  const premiumPaise = parseAmountToPaise(premium)
  const valid = name.trim().length > 0 && insurer.trim().length > 0 && !!sumPaise && !!premiumPaise && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(nextPremiumDue)

  // live previews: yearly outgo + the FOLLOWING premium due date
  const preview = useMemo(() => {
    if (!premiumPaise || !PREMIUM_FREQUENCIES.includes(premiumFrequency as never)) return null
    const perYear = { monthly: 12, quarterly: 4, half_yearly: 2, annual: 1 }[premiumFrequency] ?? 1
    const annual = premiumPaise * perYear
    let next: string | null = null
    if (/^\d{4}-\d{2}-\d{2}$/.test(nextPremiumDue)) {
      next = isoDayUTC(nextPremiumDueUTC(toUTC(nextPremiumDue), premiumFrequency as 'monthly' | 'quarterly' | 'half_yearly' | 'annual'))
    }
    return { annual, next }
  }, [premiumPaise, premiumFrequency, nextPremiumDue])

  function onSave() {
    if (!sumPaise || !premiumPaise) return
    const payload = {
      name: name.trim(),
      type,
      insurer: insurer.trim(),
      policyNumber: policyNumber.trim() || null,
      sumAssuredPaise: sumPaise,
      premiumPaise,
      premiumFrequency,
      startDate,
      nextPremiumDue,
      maturityDate: maturityDate || null,
      nominee: nominee.trim() || null,
    }
    save.mutate(policy ? { id: policy.id, ...payload } : payload, { onSuccess: onClose })
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="What is it for?">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Family health floater" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-11 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INSURANCE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Insurer">
          <Input value={insurer} onChange={(e) => setInsurer(e.target.value)} placeholder="e.g. LIC, HDFC Ergo" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sum assured (₹)">
          <Input inputMode="decimal" value={sumAssured} onChange={(e) => setSumAssured(e.target.value)} placeholder="1000000" />
        </Field>
        <Field label="Policy number" hint="Optional">
          <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="123456789" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Premium (₹)">
          <Input inputMode="decimal" value={premium} onChange={(e) => setPremium(e.target.value)} placeholder="25000" />
        </Field>
        <Field label="Premium frequency">
          <Select value={premiumFrequency} onValueChange={setPremiumFrequency}>
            <SelectTrigger className="h-11 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PREMIUM_FREQUENCIES.map((f) => (
                <SelectItem key={f} value={f}>
                  {FREQ_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {preview && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          ≈ <span className="font-semibold text-foreground">{formatINR(preview.annual)}</span> per year
          {preview.next && (
            <>
              {' '}· next premium after {nextPremiumDue} lands on <span className="font-semibold text-foreground">{preview.next}</span>
            </>
          )}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 rounded-xl" />
        </Field>
        <Field label="Next premium due">
          <Input type="date" value={nextPremiumDue} onChange={(e) => setNextPremiumDue(e.target.value)} className="h-11 rounded-xl" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Maturity date" hint="Blank for term plans">
          <Input type="date" value={maturityDate ?? ''} onChange={(e) => setMaturityDate(e.target.value)} className="h-11 rounded-xl" />
        </Field>
        <Field label="Nominee" hint="Optional">
          <Input value={nominee ?? ''} onChange={(e) => setNominee(e.target.value)} placeholder="Name" />
        </Field>
      </div>
      <Button className="mt-1 rounded-xl" disabled={!valid || save.isPending} onClick={onSave}>
        {save.isPending ? 'Saving…' : policy ? 'Save changes' : 'Add policy'}
      </Button>
    </div>
  )
}

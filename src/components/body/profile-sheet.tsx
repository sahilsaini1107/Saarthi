'use client'

// Body profile (Phase 22) — height, birth year, sex and goal weight. These are
// the facts a scale can't weigh, and they unlock BMI, BMR, the body-fat bands
// and the goal ETA. Every field is optional; the panel simply omits whatever
// it can't compute rather than guessing.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/saarthi'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useSaveBodyProfile } from '@/hooks/queries'
import type { BodyProfileDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

const SEXES = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
] as const

export function ProfileSheet({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  profile: BodyProfileDTO | undefined
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Your details</DrawerTitle>
          <DrawerDescription>Height, age and sex unlock BMI, BMR and the body-fat ranges.</DrawerDescription>
        </DrawerHeader>
        {open && <ProfileForm profile={profile} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function ProfileForm({ profile, onClose }: { profile: BodyProfileDTO | undefined; onClose: () => void }) {
  const save = useSaveBodyProfile({ success: 'Details saved' })
  const [height, setHeight] = useState(profile?.heightMilliCm != null ? String(profile.heightMilliCm / 1000) : '')
  const [birthYear, setBirthYear] = useState(profile?.birthYear != null ? String(profile.birthYear) : '')
  const [sex, setSex] = useState<string | null>(profile?.sex ?? null)
  const [goalWeight, setGoalWeight] = useState(profile?.goalWeightG != null ? String(profile.goalWeightG / 1000) : '')

  /** blank means "clear this" — null is a meaningful value, not a skip. */
  function milliOrNull(input: string): number | null {
    const t = input.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : null
  }

  function submit() {
    const year = birthYear.trim() === '' ? null : Number(birthYear)
    save.mutate(
      {
        heightMilliCm: milliOrNull(height),
        birthYear: year != null && Number.isInteger(year) ? year : null,
        sex,
        goalWeightG: milliOrNull(goalWeight),
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Height (cm)">
          <Input
            value={height}
            onChange={(e) => setHeight(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="178"
            className="h-11 rounded-xl text-center"
          />
        </Field>
        <Field label="Birth year">
          <Input
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            placeholder="2001"
            className="h-11 rounded-xl text-center"
          />
        </Field>
      </div>

      <Field label="Sex" hint="Body-fat and body-water ranges differ; “other” simply skips those bands.">
        <div className="flex gap-2">
          {SEXES.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setSex(sex === o.key ? null : o.key)}
              className={cn(
                'h-11 flex-1 rounded-xl border text-sm font-medium transition-all active:scale-95',
                sex === o.key ? 'border-primary bg-primary/10' : 'bg-card text-muted-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Goal weight (kg, optional)" hint="Shows how far off you are and an ETA at your current pace.">
        <Input
          value={goalWeight}
          onChange={(e) => setGoalWeight(e.target.value.replace(/[^0-9.]/g, ''))}
          inputMode="decimal"
          placeholder="70"
          className="h-11 w-32 rounded-xl text-center"
        />
      </Field>

      <Button disabled={save.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold" onClick={submit}>
        {save.isPending ? 'Saving…' : 'Save details'}
      </Button>
      <p className="pb-2 text-center text-[11px] text-muted-foreground">
        Leave a field blank to clear it — nothing here is required.
      </p>
    </div>
  )
}

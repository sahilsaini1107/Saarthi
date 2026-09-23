'use client'

// Whole-panel weigh-in entry (Phase 22). A smart scale hands you twenty
// numbers at once, so this takes them all in one pass and saves them in one
// call — a blank field is simply not saved, and clearing a field you had
// filled before removes that reading for the day.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/saarthi'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useSaveMetricsBulk } from '@/hooks/queries'
import { BODY_METRIC_GROUPS, bodyMetricMeta, type BodyMetricKindKey } from '@/lib/constants'
import type { BodyCompositionDTO } from '@/lib/types'

/** Kinds a scale reports vs ones you reach for a tape measure to get. */
const SCALE_GROUPS = ['headline', 'composition', 'fat_water', 'metabolic']
const TAPE_GROUPS = ['measurements']

export function CompositionSheet({
  open,
  onOpenChange,
  today,
  composition,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  today: string
  composition: BodyCompositionDTO | undefined
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Log a weigh-in</DrawerTitle>
          <DrawerDescription>
            Fill in whatever your scale gives you — blanks are skipped, and same-day entries replace each other.
          </DrawerDescription>
        </DrawerHeader>
        {open && <CompositionForm key={today} today={today} composition={composition} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function CompositionForm({
  today,
  composition,
  onClose,
}: {
  today: string
  composition: BodyCompositionDTO | undefined
  onClose: () => void
}) {
  const save = useSaveMetricsBulk({ success: 'Weigh-in saved' })
  const [date, setDate] = useState(today)
  const [mode, setMode] = useState<'scale' | 'tape'>('scale')
  const [values, setValues] = useState<Record<string, string>>({})

  const groups = BODY_METRIC_GROUPS.filter((g) => (mode === 'scale' ? SCALE_GROUPS : TAPE_GROUPS).includes(g.id))

  // Only kinds actually LOGGED on this date prefill. A derived figure (BMI,
  // BMR) must never be written back as if it were a reading.
  const loggedOnDate = new Map(
    (composition?.series ?? []).flatMap((s) => {
      const point = s.points.find((p) => p.iso === date)
      return point ? ([[s.kind, point.valueMilli]] as [string, number][]) : []
    }),
  )

  const filled = Object.entries(values).filter(([, v]) => v.trim() !== '')

  function submit() {
    const payload: Record<string, number | null> = {}
    for (const [kind, raw] of Object.entries(values)) {
      const trimmed = raw.trim()
      if (trimmed === '') {
        // a field the user emptied but that HAD a reading → clear it
        if (loggedOnDate.has(kind)) payload[kind] = null
        continue
      }
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n <= 0) continue
      payload[kind] = Math.round(n * 1000)
    }
    if (Object.keys(payload).length === 0) return
    save.mutate({ date, values: payload }, { onSuccess: onClose })
  }

  return (
    <div className="flex max-h-[74vh] flex-col gap-3 overflow-y-auto">
      <div className="flex items-center gap-2">
        <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="h-10 w-40" />
        <Chip active={mode === 'scale'} emoji="⚖️" label="Scale" onClick={() => setMode('scale')} className="h-9 text-xs" />
        <Chip active={mode === 'tape'} emoji="📏" label="Tape" onClick={() => setMode('tape')} className="h-9 text-xs" />
      </div>

      {groups.map((g) => (
        <section key={g.id}>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{g.label}</p>
          <div className="grid grid-cols-2 gap-2">
            {g.kinds.map((kind) => (
              <MetricField
                key={kind}
                kind={kind}
                value={values[kind] ?? ''}
                placeholder={loggedOnDate.has(kind) ? String((loggedOnDate.get(kind) as number) / 1000) : ''}
                onChange={(v) => setValues((cur) => ({ ...cur, [kind]: v }))}
              />
            ))}
          </div>
        </section>
      ))}

      <Button
        disabled={save.isPending || filled.length === 0}
        className="mt-1 h-12 rounded-xl text-base font-semibold"
        onClick={submit}
      >
        {save.isPending ? 'Saving…' : `Save ${filled.length || ''} reading${filled.length === 1 ? '' : 's'}`.trim()}
      </Button>
      <p className="pb-2 text-center text-[11px] text-muted-foreground">
        BMI, lean mass and BMR are worked out from your weight and profile — no need to type those.
      </p>
    </div>
  )
}

function MetricField({
  kind,
  value,
  placeholder,
  onChange,
}: {
  kind: BodyMetricKindKey
  value: string
  placeholder: string
  onChange: (v: string) => void
}) {
  const meta = bodyMetricMeta(kind)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {meta.emoji} {meta.label}
        {meta.unit ? ` (${meta.unit})` : ''}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        inputMode="decimal"
        placeholder={placeholder || '—'}
        className="h-10 rounded-xl text-center"
        aria-label={meta.label}
      />
    </label>
  )
}

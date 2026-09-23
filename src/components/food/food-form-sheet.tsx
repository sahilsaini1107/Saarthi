'use client'

// Add / edit one configurable food (Phase 21). The whole point is the line
// "100 g chana → 20 g protein": you configure a food once, and every plate
// built on it scales automatically.
//
// Macros are typed in grams and kcal, and converted to milli-units at the
// edge (Decision #21) so half portions stay exact.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip, Field } from '@/components/ui/saarthi'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useCreateFood, useUpdateFood } from '@/hooks/queries'
import { energyMismatch, FOOD_CATEGORIES, FOOD_UNITS, foodUnitMeta, PROTEIN_TIERS, formatMilli } from '@/lib/food'
import type { FoodItemDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

export function FoodFormSheet({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: FoodItemDTO | null
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{editing ? `Edit ${editing.name}` : 'Add a food'}</DrawerTitle>
          <DrawerDescription>
            Enter the macros exactly as the label states them — for a chosen amount, once.
          </DrawerDescription>
        </DrawerHeader>
        {open && <FoodForm key={editing?.id ?? 'new'} editing={editing} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

/** grams typed by the user → integer milli-units; blank/invalid → 0. */
function toMilli(input: string): number {
  const n = Number(input.trim())
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : 0
}

function FoodForm({ editing, onClose }: { editing: FoodItemDTO | null; onClose: () => void }) {
  const create = useCreateFood({ success: 'Added to your library' })
  const update = useUpdateFood({ success: 'Food updated' })
  const busy = create.isPending || update.isPending

  const [name, setName] = useState(editing?.name ?? '')
  const [brand, setBrand] = useState(editing?.brand ?? '')
  const [unit, setUnit] = useState(editing?.unit ?? 'g')
  const [basisQty, setBasisQty] = useState(String(editing?.basisQty ?? 100))
  const [kcal, setKcal] = useState(editing ? formatMilli(editing.caloriesMilliKcal) : '')
  const [protein, setProtein] = useState(editing ? formatMilli(editing.proteinMilliG) : '')
  const [carbs, setCarbs] = useState(editing ? formatMilli(editing.carbsMilliG) : '')
  const [fat, setFat] = useState(editing ? formatMilli(editing.fatMilliG) : '')
  const [fiber, setFiber] = useState(editing?.fiberMilliG != null ? formatMilli(editing.fiberMilliG) : '')
  const [category, setCategory] = useState(editing?.category ?? 'other')
  const [isVeg, setIsVeg] = useState(editing?.isVeg ?? true)
  const [tier, setTier] = useState(editing?.tier ?? '')
  const [note, setNote] = useState(editing?.note ?? '')

  const basis = Math.max(1, Math.floor(Number(basisQty) || 1))
  const payload = {
    name: name.trim(),
    brand: brand.trim() || null,
    unit,
    basisQty: basis,
    caloriesMilliKcal: toMilli(kcal),
    proteinMilliG: toMilli(protein),
    carbsMilliG: toMilli(carbs),
    fatMilliG: toMilli(fat),
    fiberMilliG: fiber.trim() === '' ? null : toMilli(fiber),
    category,
    isVeg,
    tier: tier || null,
    note: note.trim() || null,
  }

  // advisory only — labels round, and not every food obeys 4/4/9
  const warning = energyMismatch({ ...payload, basisQty: basis })
  const valid = payload.name.length > 0 && payload.caloriesMilliKcal + payload.proteinMilliG > 0

  function submit() {
    if (editing) update.mutate({ id: editing.id, ...payload }, { onSuccess: onClose })
    else create.mutate(payload, { onSuccess: onClose })
  }

  const unitShort = foodUnitMeta(unit).short

  return (
    <div className="flex max-h-[74vh] flex-col gap-3 overflow-y-auto">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Roasted chana" className="h-11 rounded-xl" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand (optional)">
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Amul…" className="h-11 rounded-xl" />
        </Field>
        <Field label="Measured in">
          <div className="flex gap-1.5">
            {FOOD_UNITS.map((u) => (
              <button
                key={u.key}
                type="button"
                onClick={() => {
                  setUnit(u.key)
                  setBasisQty(String(u.defaultBasis))
                }}
                className={cn(
                  'h-11 flex-1 rounded-xl border text-sm font-medium transition-all active:scale-95',
                  unit === u.key ? 'border-primary bg-primary/10' : 'bg-card text-muted-foreground',
                )}
              >
                {u.short}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="These macros are for…" hint={`Everything below describes ${basis} ${unitShort} of this food.`}>
        <div className="flex items-center gap-2">
          <Input
            value={basisQty}
            onChange={(e) => setBasisQty(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="h-11 w-24 rounded-xl text-center"
          />
          <span className="text-sm text-muted-foreground">{unitShort}</span>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories (kcal)">
          <Input value={kcal} onChange={(e) => setKcal(e.target.value)} inputMode="decimal" placeholder="364" className="h-11 rounded-xl text-center" />
        </Field>
        <Field label="Protein (g)">
          <Input value={protein} onChange={(e) => setProtein(e.target.value)} inputMode="decimal" placeholder="20" className="h-11 rounded-xl text-center" />
        </Field>
        <Field label="Carbs (g)">
          <Input value={carbs} onChange={(e) => setCarbs(e.target.value)} inputMode="decimal" placeholder="61" className="h-11 rounded-xl text-center" />
        </Field>
        <Field label="Fat (g)">
          <Input value={fat} onChange={(e) => setFat(e.target.value)} inputMode="decimal" placeholder="5" className="h-11 rounded-xl text-center" />
        </Field>
      </div>

      <Field label="Fibre (g, optional)">
        <Input value={fiber} onChange={(e) => setFiber(e.target.value)} inputMode="decimal" placeholder="17" className="h-11 w-28 rounded-xl text-center" />
      </Field>

      {warning && (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-[11px] text-warn">{warning}</p>
      )}

      <Field label="Category">
        <div className="flex flex-wrap gap-1.5">
          {FOOD_CATEGORIES.map((c) => (
            <Chip key={c.key} active={category === c.key} emoji={c.emoji} label={c.label} onClick={() => setCategory(c.key)} className="h-8 text-xs" />
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Diet">
          <div className="flex gap-1.5">
            {[
              { veg: true, label: '🟢 Veg' },
              { veg: false, label: '🔴 Non-veg' },
            ].map((o) => (
              <button
                key={String(o.veg)}
                type="button"
                onClick={() => setIsVeg(o.veg)}
                className={cn(
                  'h-10 flex-1 rounded-xl border text-xs font-medium transition-all active:scale-95',
                  isVeg === o.veg ? 'border-primary bg-primary/10' : 'bg-card text-muted-foreground',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Protein tier (optional)">
          <div className="flex gap-1.5">
            {PROTEIN_TIERS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTier(tier === t ? '' : t)}
                className={cn(
                  'h-10 flex-1 rounded-xl border text-xs font-bold transition-all active:scale-95',
                  tier === t ? 'border-primary bg-primary/10' : 'bg-card text-muted-foreground',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Note (optional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dry weight — triples after soaking" className="h-11 rounded-xl" />
      </Field>

      <Button disabled={!valid || busy} className="mt-1 h-12 rounded-xl text-base font-semibold" onClick={submit}>
        {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to library'}
      </Button>
      <p className="pb-2 text-center text-[11px] text-muted-foreground">
        Figures vary by brand and how it&apos;s cooked — check your pack and correct anything that looks off.
      </p>
    </div>
  )
}

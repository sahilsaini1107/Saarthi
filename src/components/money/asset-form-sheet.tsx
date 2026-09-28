'use client'

// Asset sheet (Phase 1.5): real estate, vehicles, machinery, gold, etc.
// Values are user-maintained — purchase value is optional so land-inherited
// or gifted assets don't demand numbers you don't have.

import { useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FormActions, FormCard, FormGrid, FormSheetBody } from '@/components/ui/saarthi'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS, type AssetCategoryKey } from '@/lib/constants'
import { useDeleteAsset, useSaveAsset } from '@/hooks/queries'
import { JobPicker } from '@/components/money/job-picker'
import { suggestJobForAsset } from '@/lib/planner'
import { parseAmountToPaise } from '@/lib/money'
import { todayISO } from '@/lib/date'
import type { AssetWithMeta } from '@/services/assets'

export { ASSET_CATEGORY_LABELS }

export function AssetFormSheet({ open, onOpenChange, asset }: { open: boolean; onOpenChange: (o: boolean) => void; asset?: AssetWithMeta | null }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{asset ? 'Edit asset' : 'Add a real asset'}</DrawerTitle>
          <DrawerDescription>Property, machines, gold — everything that counts toward net worth.</DrawerDescription>
        </DrawerHeader>
        {open && <AssetForm key={asset?.id ?? 'new'} asset={asset ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function AssetForm({ asset, onClose }: { asset: AssetWithMeta | null; onClose: () => void }) {
  const save = useSaveAsset({ success: asset ? 'Asset updated' : 'Asset added to net worth' })
  const del = useDeleteAsset({ success: 'Asset removed' })
  const [name, setName] = useState(asset?.name ?? '')
  const [category, setCategory] = useState<string>(asset?.category ?? 'real_estate')
  const [currentValue, setCurrentValue] = useState(asset ? String(asset.currentValuePaise / 100) : '')
  const [purchaseValue, setPurchaseValue] = useState(asset?.purchaseValuePaise ? String(asset.purchaseValuePaise / 100) : '')
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchaseDate ?? '')
  const [location, setLocation] = useState(asset?.location ?? '')
  const [notes, setNotes] = useState(asset?.notes ?? '')
  const [job, setJob] = useState(asset?.job ?? null)

  const parsedCurrent = parseAmountToPaise(currentValue)
  const parsedPurchase = purchaseValue ? parseAmountToPaise(purchaseValue) : null
  const valid = name.trim().length > 0 && !!parsedCurrent && (purchaseValue === '' || !!parsedPurchase)

  function onSave() {
    if (!parsedCurrent) return
    const base = {
      name: name.trim(),
      category: category as AssetCategoryKey,
      currentValuePaise: parsedCurrent,
      purchaseValuePaise: parsedPurchase ?? null,
      purchaseDate: purchaseDate || null,
      job,
      location: location.trim() || null,
      notes: notes.trim() || null,
    }
    if (asset) save.mutate({ id: asset.id, ...base }, { onSuccess: onClose })
    else save.mutate(base, { onSuccess: onClose })
  }

  return (
    <FormSheetBody>
      <FormCard title="Asset identity" description="Capture what it is, where it lives, and how it should count.">
        <div className="flex flex-col gap-3">
          <FormGrid>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2BHK Pune, Tata Safari" />
            </Field>
            <Field label="Category">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-11 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {ASSET_CATEGORY_LABELS[c].emoji} {ASSET_CATEGORY_LABELS[c].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FormGrid>
          <Field label="Location" hint="Optional">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Baner, Pune" />
          </Field>
        </div>
      </FormCard>

      <FormCard title="Valuation" description="Use realistic current value; purchase value is optional.">
        <div className="flex flex-col gap-3">
          <FormGrid>
            <Field label="Current value (₹)">
              <Input inputMode="decimal" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} placeholder="6500000" />
            </Field>
            <Field label="Bought for (₹)" hint="Optional">
              <Input inputMode="decimal" value={purchaseValue} onChange={(e) => setPurchaseValue(e.target.value)} placeholder="4800000" />
            </Field>
          </FormGrid>
          <Field label="Purchase date" hint="Optional">
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="h-11 rounded-xl" />
          </Field>
        </div>
      </FormCard>

      <FormCard title="Portfolio role" description="Separate growth assets, income assets, protection, and personal-use items.">
        <Field
          label="Job · portfolio role"
          hint={suggestJobForAsset(category) ? `Suggested: ${suggestJobForAsset(category) === 'growth' ? 'Growth' : suggestJobForAsset(category) === 'income' ? 'Income' : 'Protection'}` : 'Consumption assets can stay untagged'}
        >
          <JobPicker value={job} suggested={suggestJobForAsset(category)} onChange={setJob} />
        </Field>
      </FormCard>

      <FormCard title="Notes">
        <Field label="Notes" hint="Optional">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Valued at registry rate, 2026" />
        </Field>
      </FormCard>

      <FormActions>
        <Button onClick={onSave} disabled={!valid || save.isPending} className="h-12 rounded-xl text-base font-semibold">
          {save.isPending ? 'Saving…' : asset ? 'Save changes' : 'Add asset'}
        </Button>
        {asset && (
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm(`Remove ${asset.name} from your assets?`)) del.mutate(asset.id, { onSuccess: onClose })
            }}
            className="text-expense"
          >
            Remove asset
          </Button>
        )}
      </FormActions>
    </FormSheetBody>
  )
}

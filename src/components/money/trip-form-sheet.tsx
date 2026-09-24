'use client'

// Trip create/edit sheet (Phase 5.2). Phase is derived from dates, so the
// form only asks for the facts: name, dates, optional budget.

import { useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Money } from '@/components/ui/saarthi'
import { useDeleteTrip, useSaveTrip } from '@/hooks/queries'
import { parseAmountToPaise } from '@/lib/money'
import { todayISO } from '@/lib/date'
import { TRIP_EMOJIS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { TripSummary } from '@/services/trips'

export function TripFormSheet({
  open,
  onOpenChange,
  trip,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  trip?: TripSummary | null
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{trip ? 'Edit trip' : 'Plan a trip'}</DrawerTitle>
          <DrawerDescription>Budget your trip and tag expenses to it as you spend.</DrawerDescription>
        </DrawerHeader>
        {open && <TripForm key={trip?.id ?? 'new'} trip={trip ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function TripForm({ trip, onClose }: { trip: TripSummary | null; onClose: () => void }) {
  const { user } = useUi()
  const save = useSaveTrip({ success: trip ? 'Trip updated' : 'Trip planned' })
  const del = useDeleteTrip({ success: 'Trip removed — its expenses stay in the ledger' })
  const [name, setName] = useState(trip?.name ?? '')
  const [emoji, setEmoji] = useState<string>(trip?.emoji ?? '✈️')
  const [destination, setDestination] = useState(trip?.destination ?? '')
  const [startDate, setStartDate] = useState(trip?.startDate ?? todayISO(user.timezone))
  const [endDate, setEndDate] = useState<string>(trip?.endDate ?? '')
  const [budget, setBudget] = useState(trip?.budgetPaise ? String(trip.budgetPaise / 100) : '')
  const [notes, setNotes] = useState(trip?.notes ?? '')

  const budgetPaise = budget.trim() === '' ? null : parseAmountToPaise(budget)
  const valid = name.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && (budgetPaise === null || budgetPaise != null)

  function onSave() {
    if (!valid) return
    save.mutate(
      {
        id: trip?.id,
        name: name.trim(),
        emoji,
        destination: destination.trim() || null,
        startDate,
        endDate: endDate || null,
        budgetPaise: budgetPaise,
        notes: notes.trim() || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Emoji">
        <div className="flex flex-wrap gap-1.5">
          {TRIP_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              aria-label={`Emoji ${e}`}
              className={cn(
                'flex size-10 items-center justify-center rounded-xl border text-lg transition-all',
                emoji === e ? 'border-primary bg-primary/10' : 'hover:bg-accent',
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Trip name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Goa with friends" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Destination (optional)">
          <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Goa" />
        </Field>
        <Field label="Budget (optional)">
          <Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="30000" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 rounded-xl" />
        </Field>
        <Field label="End date (optional)" hint="Leave open if undecided">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-11 rounded-xl" />
        </Field>
      </div>

      <Field label="Notes (optional)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Flights booked · hotel pending" />
      </Field>

      {budgetPaise != null && (
        <div className="rounded-2xl bg-primary/5 p-4">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Trip budget</p>
          <Money paise={budgetPaise} className="text-xl font-bold" />
        </div>
      )}

      <Button onClick={onSave} disabled={!valid || save.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {save.isPending ? 'Saving…' : trip ? 'Save changes' : 'Plan trip'}
      </Button>

      {trip && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Remove "${trip.name}"? Expenses logged under it stay in your ledger.`)) del.mutate(trip.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          Remove trip
        </Button>
      )}
    </div>
  )
}

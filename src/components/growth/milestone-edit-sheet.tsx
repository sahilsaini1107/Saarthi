'use client'

// MilestoneEditSheet — rename a milestone, move its target date, or set
// planned hours (Phase 11). Planned hours drive the informational time bar
// on the milestone row; completion stays checklist-driven (Decision #18).

import { useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/saarthi'
import { useUpdateMilestone } from '@/hooks/queries'
import type { MilestoneDTO } from '@/lib/types'

export function MilestoneEditSheet({
  open,
  onOpenChange,
  milestone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  milestone: MilestoneDTO | null
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Edit milestone</DrawerTitle>
          <DrawerDescription>Rename it, set a target date, or plan the hours you want to put in.</DrawerDescription>
        </DrawerHeader>
        {open && milestone && (
          <MilestoneEditForm
            key={milestone.id}
            milestone={milestone}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function MilestoneEditForm({ milestone, onDone }: { milestone: MilestoneDTO; onDone: () => void }) {
  const update = useUpdateMilestone({ success: 'Milestone updated' })
  const [title, setTitle] = useState(milestone.title)
  const [targetDate, setTargetDate] = useState(milestone.targetDate ?? '')
  // planned hours edited in hours (display), stored as whole minutes
  const [hours, setHours] = useState(milestone.targetMinutes != null ? String(milestone.targetMinutes / 60) : '')

  const valid = title.trim().length > 0

  function save() {
    if (!valid) return
    let targetMinutes: number | null = null
    const cleaned = hours.replace(/[\s,]/g, '')
    if (cleaned) {
      if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return
      targetMinutes = Math.round(parseFloat(cleaned) * 60)
      if (targetMinutes > 100_000) return
    }
    update.mutate(
      { id: milestone.id, title: title.trim(), targetDate: targetDate || null, targetMinutes },
      { onSuccess: onDone },
    )
  }

  return (
    <div className="flex flex-col gap-3 pb-2">
      <Field label="Milestone">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Milestone title" maxLength={120} />
      </Field>
      <Field label="Target date (optional)">
        <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="h-11 rounded-xl" />
      </Field>
      <Field label="Planned hours (optional)" hint="e.g. 40 — shows a time bar as you journal; never forces completion">
        <Input
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          inputMode="decimal"
          placeholder="e.g. 40"
          className="h-11 rounded-xl"
        />
      </Field>
      <Button onClick={save} disabled={!valid || update.isPending} className="h-12 rounded-xl text-base font-semibold">
        {update.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </div>
  )
}

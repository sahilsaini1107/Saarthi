'use client'

// Goal create/edit sheet. Milestones & tasks are managed inline on the
// goal card (fast, keyboard-free flow), not in this sheet. Daily tracking
// (Phase 9) adds an optional quantified metric: ₹ money or a unit count.

import { useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from '@/components/ui/saarthi'
import { Switch } from '@/components/ui/switch'
import { useAddMilestone, useDeleteGoal, useSaveGoal } from '@/hooks/queries'
import { GOAL_COLORS, GOAL_EMOJIS } from '@/lib/constants'
import { JOB_META, JOBS } from '@/lib/planner'
import { countToMilli } from '@/lib/goals-grid'
import { parseAmountToPaise } from '@/lib/money'
import type { GoalDTO, GoalMetric, JobKey } from '@/lib/types'
import { cn } from '@/lib/utils'

const NO_JOB = '__none__'

export function GoalFormSheet({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  goal?: GoalDTO | null
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{goal ? 'Edit goal' : 'Set a new goal'}</DrawerTitle>
          <DrawerDescription>
            Big picture first — list the milestones here, then journal daily progress on each one from the card.
          </DrawerDescription>
        </DrawerHeader>
        {open && <GoalForm key={goal?.id ?? 'new'} goal={goal ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function GoalForm({ goal, onClose }: { goal: GoalDTO | null; onClose: () => void }) {
  const save = useSaveGoal({ success: goal ? 'Goal updated' : 'Goal set — make it real' })
  const addMilestone = useAddMilestone()
  const del = useDeleteGoal({ success: 'Goal removed' })
  const [title, setTitle] = useState(goal?.title ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [emoji, setEmoji] = useState(goal?.emoji ?? '🎯')
  const [color, setColor] = useState(goal?.color ?? GOAL_COLORS[0])
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  // Phase 11 — starter milestones for BIG goals (new goals only, one per line)
  const [starterMilestones, setStarterMilestones] = useState('')
  // Phase 9 — daily tracking
  const [metric, setMetric] = useState<GoalMetric | null>(goal?.metric ?? null)
  const [unitLabel, setUnitLabel] = useState(goal?.unitLabel ?? '')
  // Phase 10 — planner link (money goals only)
  const [job, setJob] = useState<JobKey | null>(goal?.job ?? null)
  // target shown in display units (₹ for money, units for count)
  const [targetValue, setTargetValue] = useState(
    goal?.targetValueMilli != null ? String(Math.round((goal.targetValueMilli / 1000) * 100) / 100) : '',
  )

  const valid = title.trim().length > 0

  async function onSave() {
    if (!valid) return
    // parse the optional target: money accepts 2 decimals, counts 3
    let targetValueMilli: number | null = null
    if (metric && targetValue.trim()) {
      if (metric === 'money') {
        const paise = parseAmountToPaise(targetValue)
        if (paise == null) return
        targetValueMilli = paise * 10
      } else {
        const cleaned = targetValue.replace(/[\s,]/g, '')
        if (!/^\d+(\.\d{1,3})?$/.test(cleaned)) return
        targetValueMilli = countToMilli(parseFloat(cleaned))
      }
    }
    // starter milestones: one per line, up to 10 (new goals only)
    const starterLines = goal
      ? []
      : starterMilestones
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 10)
    try {
      const created = await save.mutateAsync({
        ...(goal ? { id: goal.id } : {}),
        title: title.trim(),
        description: description.trim() || null,
        emoji,
        color,
        targetDate: targetDate || null,
        metric,
        unitLabel: metric === 'count' ? unitLabel.trim() || 'times' : null,
        targetValueMilli,
        job: metric === 'money' ? job : null,
      })
      for (const line of starterLines) {
        try {
          await addMilestone.mutateAsync({ goalId: created.id, title: line.slice(0, 120) })
        } catch {
          // a bad line must not lose the goal — the rest can be added on the card
        }
      }
      onClose()
    } catch {
      // the mutation hook already toasts the error
    }
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Goal">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Run a half marathon" />
      </Field>

      <Field label="Why it matters (optional)">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line of motivation" />
      </Field>

      <Field label="Icon">
        <div className="flex flex-wrap gap-2">
          {GOAL_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={cn(
                'flex size-10 items-center justify-center rounded-xl border text-lg transition-all active:scale-90',
                emoji === e ? 'border-primary bg-primary/10' : 'bg-card',
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Colour">
        <div className="flex gap-2">
          {GOAL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`colour ${c}`}
              onClick={() => setColor(c)}
              className={cn('size-8 rounded-full border-2 transition-transform active:scale-90', color === c ? 'border-foreground' : 'border-transparent')}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>

      <Field label="Target date (optional)" hint="Overdue and due-soon goals get flagged on your cards">
        <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="h-11 rounded-xl" />
      </Field>

      {!goal && (
        <Field
          label="Break it into milestones (optional)"
          hint="One per line, up to 10 — the parts of this goal you'll journal daily progress on"
        >
          <Textarea
            value={starterMilestones}
            onChange={(e) => setStarterMilestones(e.target.value)}
            placeholder={'e.g. Learn software development\nHTML & CSS basics\nJavaScript fundamentals\nBuild a first project'}
            rows={4}
            className="rounded-xl bg-muted/40 text-sm"
          />
        </Field>
      )}

      <Field
        label="Daily tracking"
        hint={
          metric === 'money'
            ? 'Log daily savings here — a GitHub-style grid tracks your effort'
            : metric === 'count'
              ? 'Log a number each day (km, pages, sessions…) and watch the grid fill'
              : 'Optional — turns the goal into a daily habit with an effort grid'
        }
      >
        <div className="flex gap-2">
          {([null, 'money', 'count'] as const).map((m) => (
            <button
              key={m ?? 'none'}
              type="button"
              onClick={() => setMetric(m)}
              className={cn(
                'h-9 flex-1 rounded-xl border text-xs font-semibold transition-colors',
                metric === m ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {m === null ? 'None' : m === 'money' ? '₹ Money' : 'Count'}
            </button>
          ))}
        </div>
      </Field>

      {metric === 'count' && (
        <Field label="Unit" hint="What one contribution counts — e.g. km, pages, sessions">
          <Input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="times" maxLength={16} className="h-11 rounded-xl" />
        </Field>
      )}

      {metric === 'money' && (
        <Field
          label="Portfolio job (optional)"
          hint="Tag which planner sleeve funds this goal — it shows on that job's card in the Planner"
        >
          <Select value={job ?? NO_JOB} onValueChange={(v) => setJob(v === NO_JOB ? null : (v as JobKey))}>
            <SelectTrigger className="h-11 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_JOB}>Not linked to the planner</SelectItem>
              {JOBS.map((j) => (
                <SelectItem key={j} value={j}>
                  {JOB_META[j].emoji} {JOB_META[j].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {metric && (
        <Field label={`Total target (optional, in ${metric === 'money' ? '₹' : 'units'})`} hint="The grid benchmarks your daily pace against it">
          <Input
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            inputMode="decimal"
            placeholder={metric === 'money' ? 'e.g. 100000' : 'e.g. 365'}
            className="h-11 rounded-xl"
          />
        </Field>
      )}

      {goal && (
        <div className="flex items-center justify-between rounded-xl border p-3">
          <div>
            <p className="text-sm font-medium">Archived</p>
            <p className="text-xs text-muted-foreground">Hidden from lists; history is kept</p>
          </div>
          <Switch
            checked={goal.status === 'archived'}
            onCheckedChange={(v) => {
              save.mutate({ id: goal.id, status: v ? 'archived' : 'active' })
              onClose()
            }}
          />
        </div>
      )}

      <Button onClick={onSave} disabled={!valid || save.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {save.isPending ? 'Saving…' : goal ? 'Save changes' : 'Set the goal'}
      </Button>
      {goal && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Delete "${goal.title}" with all milestones and tasks? This cannot be undone.`)) del.mutate(goal.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          Delete goal
        </Button>
      )}
    </div>
  )
}

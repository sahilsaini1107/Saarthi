'use client'

// Idea form (Phase 18) — the lean canvas in one drawer. ICE sliders show the
// live derived score so re-tuning instantly re-ranks the pipeline.

import { useState } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Field } from '@/components/ui/saarthi'
import { useCreateIdea, useDeleteIdea, useUpdateIdea } from '@/hooks/queries'
import { iceBand, iceScore, IDEA_CATEGORIES, IDEA_STATUSES, IDEA_STATUS_META } from '@/lib/ideas'
import { cn } from '@/lib/utils'
import type { IdeaDTO } from '@/lib/types'

const LEAN_TEXTS: { key: LeanKey; label: string; placeholder: string }[] = [
  { key: 'problem', label: 'Problem', placeholder: 'What hurts today — and for whom?' },
  { key: 'audience', label: 'Audience', placeholder: 'Who exactly has this problem first?' },
  { key: 'value', label: 'Unique value', placeholder: 'The promise — why you, why now?' },
  { key: 'solution', label: 'Solution', placeholder: 'The smallest thing that could work' },
  { key: 'revenue', label: 'Revenue', placeholder: 'How money arrives (or value, for personal ideas)' },
  { key: 'costs', label: 'Costs', placeholder: 'Time, money, energy — what it takes' },
  { key: 'metrics', label: 'Metrics', placeholder: 'How you would know it works' },
  { key: 'advantage', label: 'Unfair advantage', placeholder: 'The edge that is hard to copy' },
]

type LeanKey = 'problem' | 'audience' | 'value' | 'solution' | 'revenue' | 'costs' | 'metrics' | 'advantage'

export function IdeaFormSheet({
  open,
  onOpenChange,
  idea,
  prefill,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  idea?: IdeaDTO | null
  prefill?: { title: string }
}) {
  const isEdit = Boolean(idea)
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Edit idea' : 'New idea'}</DrawerTitle>
          <DrawerDescription>Capture the spark now, grow the canvas later. The pipeline: spark → exploring → planned → launched.</DrawerDescription>
        </DrawerHeader>
        {open && <IdeaForm key={isEdit ? idea!.id : prefill?.title ?? 'new'} idea={idea ?? null} prefill={prefill} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function IdeaForm({ idea, prefill, onClose }: { idea: IdeaDTO | null; prefill?: { title: string }; onClose: () => void }) {
  const isNew = !idea
  const create = useCreateIdea({ success: 'Spark captured 💡' })
  const save = useUpdateIdea({ success: 'Idea updated' })
  const del = useDeleteIdea({ success: 'Idea removed' })

  const [title, setTitle] = useState(isNew ? (prefill?.title ?? '') : idea.title)
  const [category, setCategory] = useState(isNew ? 'other' : idea.category)
  const [status, setStatus] = useState(isNew ? 'spark' : idea.status)
  const [nextStep, setNextStep] = useState(isNew ? '' : (idea.nextStep ?? ''))
  const [impact, setImpact] = useState(isNew ? 5 : idea.impact)
  const [confidence, setConfidence] = useState(isNew ? 5 : idea.confidence)
  const [effort, setEffort] = useState(isNew ? 5 : idea.effort)
  const [tags, setTags] = useState(isNew ? '' : idea.tags.join(', '))
  const [notes, setNotes] = useState(isNew ? '' : (idea.notes ?? ''))
  const [lean, setLean] = useState<Record<LeanKey, string>>(
    () =>
      ({
        problem: isNew ? '' : (idea.problem ?? ''),
        audience: isNew ? '' : (idea.audience ?? ''),
        value: isNew ? '' : (idea.value ?? ''),
        solution: isNew ? '' : (idea.solution ?? ''),
        revenue: isNew ? '' : (idea.revenue ?? ''),
        costs: isNew ? '' : (idea.costs ?? ''),
        metrics: isNew ? '' : (idea.metrics ?? ''),
        advantage: isNew ? '' : (idea.advantage ?? ''),
      }) as Record<LeanKey, string>,
  )
  const [canvasOpen, setCanvasOpen] = useState(!isNew && LEAN_TEXTS.some((f) => (idea[f.key] ?? '') !== ''))

  const score = iceScore(impact, confidence, effort)
  const band = iceBand(score)
  const pending = create.isPending || save.isPending
  const valid = title.trim().length > 0

  function onSave() {
    if (!valid) return
    const payload = {
      title: title.trim(),
      category,
      status,
      nextStep: nextStep.trim() || null,
      impact,
      confidence,
      effort,
      tags: tags.trim() || null,
      notes: notes.trim() || null,
      problem: lean.problem.trim() || null,
      audience: lean.audience.trim() || null,
      value: lean.value.trim() || null,
      solution: lean.solution.trim() || null,
      revenue: lean.revenue.trim() || null,
      costs: lean.costs.trim() || null,
      metrics: lean.metrics.trim() || null,
      advantage: lean.advantage.trim() || null,
    }
    if (isNew) create.mutate(payload, { onSuccess: onClose })
    else save.mutate({ id: idea.id, ...payload }, { onSuccess: onClose })
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Idea">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekly creator podcast for dev tools" autoFocus={isNew} />
      </Field>

      <Field label="Category">
        <div className="flex flex-wrap gap-2">
          {IDEA_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-all active:scale-95',
                category === c.key ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              <span aria-hidden>{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Stage">
        <div className="flex flex-wrap gap-2">
          {IDEA_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-all active:scale-95',
                status === s ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              <span aria-hidden>{IDEA_STATUS_META[s].emoji}</span> {IDEA_STATUS_META[s].label}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="ICE scoring"
        hint={score != null ? `Score ${score} — ${band === 'strong' ? 'strong bet' : band === 'promising' ? 'promising' : 'a seed worth watering'}` : undefined}
      >
        <div className="flex flex-col gap-2 rounded-xl bg-muted p-3">
          <Slider label={`Impact — ${impact}`} value={impact} onChange={setImpact} />
          <Slider label={`Confidence — ${confidence}`} value={confidence} onChange={setConfidence} />
          <Slider label={`Effort — ${effort}`} value={effort} onChange={setEffort} />
        </div>
      </Field>

      <Field label="Next physical action" hint="The one thing you could do in the next 15 minutes">
        <Input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="e.g. DM two potential listeners" />
      </Field>

      <button
        type="button"
        onClick={() => setCanvasOpen(!canvasOpen)}
        className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
      >
        Lean canvas {canvasOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {canvasOpen && (
        <div className="flex flex-col gap-3 rounded-xl bg-muted p-3">
          {LEAN_TEXTS.map((f) => (
            <Field key={f.key} label={f.label}>
              <Textarea value={lean[f.key]} onChange={(e) => setLean({ ...lean, [f.key]: e.target.value })} placeholder={f.placeholder} className="min-h-14 rounded-xl bg-card" />
            </Field>
          ))}
        </div>
      )}

      <Field label="Tags" hint="Comma-separated">
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="side-project, ai" />
      </Field>

      <Field label="Notes" hint="Research, links, open questions">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything you'd want to reread later…" className="min-h-16 rounded-xl" />
      </Field>

      <Button onClick={onSave} disabled={!valid || pending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {pending ? 'Saving…' : isNew ? 'Capture idea' : 'Save changes'}
      </Button>

      {!isNew && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Delete "${idea.title}"?`)) del.mutate(idea.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          <Trash2 className="mr-1 size-4" /> Delete idea
        </Button>
      )}
    </div>
  )
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input type="range" min={1} max={10} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" aria-label={label} />
    </label>
  )
}

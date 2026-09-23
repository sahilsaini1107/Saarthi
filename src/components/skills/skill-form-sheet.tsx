'use client'

// Skill form (Phase 17) — create/edit in one bottom drawer. Target level is
// the skill's own "what done looks like"; the ETA math aims at it.

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Field } from '@/components/ui/saarthi'
import { useCreateSkill, useDeleteSkill, useUpdateSkill } from '@/hooks/queries'
import { SKILL_CATEGORIES, MAX_LEVEL } from '@/lib/skills'
import { cn } from '@/lib/utils'
import type { SkillWithStats } from '@/lib/types'

export function SkillFormSheet({
  open,
  onOpenChange,
  skill,
  prefill,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  skill?: SkillWithStats | null
  prefill?: { name: string; category: string }
}) {
  const isEdit = Boolean(skill)
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Edit skill' : 'New skill'}</DrawerTitle>
          <DrawerDescription>
            XP = practice minutes. Level 10 is 75 focused hours — set a target you&apos;ll actually reach.
          </DrawerDescription>
        </DrawerHeader>
        {open && (
          <SkillForm
            key={isEdit ? skill!.id : prefill?.name ?? 'new'}
            skill={skill ?? null}
            prefill={prefill}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function SkillForm({ skill, prefill, onClose }: { skill: SkillWithStats | null; prefill?: { name: string; category: string }; onClose: () => void }) {
  const isNew = !skill
  const create = useCreateSkill({ success: 'Skill added' })
  const save = useUpdateSkill({ success: 'Skill updated' })
  const del = useDeleteSkill({ success: 'Skill removed' })
  const [name, setName] = useState(isNew ? (prefill?.name ?? '') : skill.name)
  const [category, setCategory] = useState(isNew ? (prefill?.category ?? 'other') : skill.category)
  const [targetLevel, setTargetLevel] = useState(isNew ? 10 : skill.targetLevel)
  const [notes, setNotes] = useState(isNew ? '' : (skill.notes ?? ''))
  const [status, setStatus] = useState(isNew ? 'active' : skill.status)
  const pending = create.isPending || save.isPending
  const valid = name.trim().length > 0

  function onSave() {
    if (!valid) return
    if (isNew) {
      create.mutate({ name: name.trim(), category, targetLevel, notes: notes.trim() || null }, { onSuccess: onClose })
    } else {
      save.mutate({ id: skill.id, name: name.trim(), category, targetLevel, notes: notes.trim() || null, status }, { onSuccess: onClose })
    }
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Skill">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Public speaking, Guitar, System design" />
      </Field>

      <Field label="Area">
        <div className="flex flex-wrap gap-2">
          {SKILL_CATEGORIES.map((c) => (
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

      <Field label={`Target level — ${targetLevel}`} hint="The ETA is calculated at this level. Change it any time.">
        <input
          type="range"
          min={1}
          max={MAX_LEVEL}
          value={targetLevel}
          onChange={(e) => setTargetLevel(Number(e.target.value))}
          className="w-full accent-primary"
          aria-label="Target level"
        />
      </Field>

      <Field label="Why it matters" hint="Optional — the pull you'll reread on low-energy days">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What becoming good at this unlocks…" className="min-h-16 rounded-xl" />
      </Field>

      {!isNew && (
        <Field label="Status">
          <div className="flex gap-2">
            {(['active', 'paused'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  'h-9 flex-1 rounded-full border text-sm font-medium capitalize transition-all active:scale-95',
                  status === s ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Button onClick={onSave} disabled={!valid || pending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {pending ? 'Saving…' : isNew ? 'Add skill' : 'Save changes'}
      </Button>

      {!isNew && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Delete "${skill.name}" and its full practice history?`)) del.mutate(skill.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          <Trash2 className="mr-1 size-4" /> Delete skill
        </Button>
      )}
    </div>
  )
}

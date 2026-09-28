'use client'

// Course create/edit sheet. The syllabus can be pasted in bulk — one topic
// per line — because typing 20 chapters one dialog at a time is misery.

import { useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FormActions, FormCard, FormGrid, FormSheetBody } from '@/components/ui/saarthi'
import { Textarea } from '@/components/ui/textarea'
import { useDeleteCourse, useSaveCourse } from '@/hooks/queries'
import { COURSE_COLORS, COURSE_EMOJIS } from '@/lib/constants'
import { todayISO } from '@/lib/date'
import type { CourseDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

export function CourseFormSheet({
  open,
  onOpenChange,
  course,
  tz,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  course?: CourseDTO | null
  tz: string
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{course ? 'Edit course' : 'Start a course'}</DrawerTitle>
          <DrawerDescription>
            List the syllabus and set a target — Saarthi paces you and schedules revisions.
          </DrawerDescription>
        </DrawerHeader>
        {open && <CourseForm key={course?.id ?? 'new'} course={course ?? null} tz={tz} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function CourseForm({ course, tz, onClose }: { course: CourseDTO | null; tz: string; onClose: () => void }) {
  const save = useSaveCourse({ success: course ? 'Course updated' : 'Course started' })
  const del = useDeleteCourse({ success: 'Course removed' })
  const [title, setTitle] = useState(course?.title ?? '')
  const [provider, setProvider] = useState(course?.provider ?? '')
  const [emoji, setEmoji] = useState(course?.emoji ?? '📚')
  const [color, setColor] = useState(course?.color ?? COURSE_COLORS[0])
  const [startDate, setStartDate] = useState(course?.startDate ?? todayISO(tz))
  const [targetEndDate, setTargetEndDate] = useState(course?.targetEndDate ?? '')
  const [topicsText, setTopicsText] = useState('')

  const valid = title.trim().length > 0

  function onSave() {
    if (!valid) return
    save.mutate(
      {
        ...(course ? { id: course.id } : {}),
        title: title.trim(),
        provider: provider.trim() || null,
        emoji,
        color,
        startDate,
        targetEndDate: targetEndDate || null,
        ...(course
          ? {}
          : { topics: topicsText.split('\n').map((t) => t.trim()).filter(Boolean) }),
      },
      { onSuccess: onClose },
    )
  }

  return (
    <FormSheetBody>
      <FormCard title="Course identity" description="Name the learning track and where it comes from.">
        <div className="flex flex-col gap-3">
          <Field label="Course">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. System Design basics" />
          </Field>
          <Field label="Provider / source" hint="Optional">
            <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Coursera, a book, YouTube…" />
          </Field>
        </div>
      </FormCard>

      <FormCard title="Look and pacing" description="The visual marker makes courses easier to scan. Dates power pacing.">
        <div className="flex flex-col gap-3">
          <Field label="Icon">
            <div className="flex flex-wrap gap-2">
              {COURSE_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={cn(
                    'flex size-10 items-center justify-center rounded-xl border text-lg transition-all active:scale-90',
                    emoji === e ? 'border-primary bg-primary/10' : 'bg-background',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Colour">
            <div className="flex gap-2">
              {COURSE_COLORS.map((c) => (
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
          <FormGrid>
            <Field label="Start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 rounded-xl" />
            </Field>
            <Field label="Target end" hint="Optional">
              <Input type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} className="h-11 rounded-xl" />
            </Field>
          </FormGrid>
        </div>
      </FormCard>

      {!course && (
        <FormCard title="Syllabus" description="Paste one topic per line to create the course structure immediately.">
          <Field label="Syllabus" hint="Optional">
            <Textarea
              value={topicsText}
              onChange={(e) => setTopicsText(e.target.value)}
              placeholder={'Intro & setup\nData structures\nAlgorithms\n…'}
              rows={5}
              className="rounded-xl"
            />
          </Field>
        </FormCard>
      )}

      <FormActions>
        <Button onClick={onSave} disabled={!valid || save.isPending} className="h-12 rounded-xl text-base font-semibold">
          {save.isPending ? 'Saving…' : course ? 'Save changes' : 'Start the course'}
        </Button>
        {course && (
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm(`Delete "${course.title}" with topics and sessions? This cannot be undone.`)) del.mutate(course.id, { onSuccess: onClose })
            }}
            className="text-expense"
          >
            Delete course
          </Button>
        )}
      </FormActions>
    </FormSheetBody>
  )
}

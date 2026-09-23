'use client'

// Reading session log sheet (Phase 16): minutes + optional pages, date
// defaults to today. Any past day is loggable; future days rejected upstream.

import { useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/saarthi'
import { useLogReadingSession } from '@/hooks/queries'
import { todayISO } from '@/lib/date'
import { isPageBased } from '@/lib/reading'
import type { BookDTO } from '@/lib/types'

export function SessionLogSheet({
  open,
  onOpenChange,
  book,
  tz,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  book: BookDTO
  tz: string
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Log a reading session</DrawerTitle>
          <DrawerDescription>
            {book.title} — every sitting counts toward the streak.
          </DrawerDescription>
        </DrawerHeader>
        {open && <SessionForm key={`${book.id}-${String(open)}`} book={book} tz={tz} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function SessionForm({ book, tz, onClose }: { book: BookDTO; tz: string; onClose: () => void }) {
  const log = useLogReadingSession({ success: 'Session logged' })
  const pageBased = isPageBased(book.format)
  const [date, setDate] = useState(todayISO(tz))
  const [minutes, setMinutes] = useState('')
  const [pages, setPages] = useState('')
  const [page, setPage] = useState(pageBased && book.totalPages > 0 ? String(Math.max(book.currentPage, 1)) : '')

  const minutesNum = Number(minutes) || 0
  const pagesNum = Number(pages) || 0
  const valid = date.length === 10 && (minutesNum > 0 || pagesNum > 0)

  function onSave() {
    if (!valid) return
    log.mutate(
      {
        id: book.id,
        date,
        minutes: minutesNum,
        pages: pageBased ? pagesNum : 0,
        currentPage: pageBased && page ? Number(page) || undefined : undefined,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={date} max={todayISO(tz)} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl" />
        </Field>
        <Field label="Minutes" hint="0–1440">
          <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 30" />
        </Field>
      </div>

      {pageBased && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pages read" hint="Optional">
            <Input inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 24" />
          </Field>
          <Field label="Now on page" hint={book.totalPages > 0 ? `of ${book.totalPages}` : 'Set total pages in edit'}>
            <Input inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 118" />
          </Field>
        </div>
      )}

      {!pageBased && (
        <p className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
          EPUB progress is saved automatically from the reader — just log your minutes here.
        </p>
      )}

      <Button onClick={onSave} disabled={!valid || log.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {log.isPending ? 'Saving…' : 'Log session'}
      </Button>
    </div>
  )
}

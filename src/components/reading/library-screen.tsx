'use client'

// Library (Phase 16) — the book shelf. Status filter chips, per-book
// progress, one-tap Read for EPUB/PDF, detail for everything.

import { useState } from 'react'
import { BookOpen, Plus } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorCard, ProgressBar, SkeletonRow } from '@/components/ui/saarthi'
import { BookFormSheet } from '@/components/reading/book-form-sheet'
import { useBooks } from '@/hooks/queries'
import { BOOK_STATUS_META, isPageBased, type BookStatus } from '@/lib/reading'
import { cn } from '@/lib/utils'
import type { BookDTO } from '@/lib/types'

const FILTERS: { key: 'all' | BookStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reading', label: '📖 Reading' },
  { key: 'to_read', label: '📦 To read' },
  { key: 'finished', label: '✅ Finished' },
  { key: 'abandoned', label: '🚫 Dropped' },
]

export function LibraryScreen() {
  const { user, navigate } = useUi()
  const books = useBooks()
  const [filter, setFilter] = useState<'all' | BookStatus>('all')
  const [formOpen, setFormOpen] = useState(false)

  if (books.isLoading) return <SkeletonRow />
  if (books.isError) return <ErrorCard message={(books.error as Error).message} onRetry={() => books.refetch()} />

  const list = books.data ?? []
  const shown = filter === 'all' ? list : list.filter((b) => b.status === filter)
  const reading = list.filter((b) => b.status === 'reading')
  const minutes7d = list.reduce((s, b) => s + b.minutes7d, 0)
  const bestStreak = list.reduce((m, b) => Math.max(m, b.streak), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">Read, highlight, and keep what matters.</p>
        </div>
        <Button size="sm" className="h-9 rounded-full" onClick={() => setFormOpen(true)}>
          <Plus className="mr-1 size-4" /> Add book
        </Button>
      </div>

      {list.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border bg-card p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{reading.length}</p>
              <p className="text-[10px] text-muted-foreground">reading now</p>
            </div>
            <div className="rounded-2xl border bg-card p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{minutes7d}m</p>
              <p className="text-[10px] text-muted-foreground">read · 7 days</p>
            </div>
            <div className="rounded-2xl border bg-card p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{bestStreak > 0 ? `🔥 ${bestStreak}` : '—'}</p>
              <p className="text-[10px] text-muted-foreground">day streak</p>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filter books">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === f.key ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}

      {list.length === 0 ? (
        <EmptyState
          emoji="📚"
          title="Your library awaits"
          body="Add a physical book to track pages, or upload an EPUB/PDF and read it right here — highlights, notes and bookmarks included."
          action={
            <Button className="mt-2 h-11 rounded-xl px-6" onClick={() => setFormOpen(true)}>
              <Plus className="mr-1 size-4" /> Add your first book
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState emoji="🗂️" title="Nothing here" body={`No ${filter === 'all' ? '' : BOOK_STATUS_META[filter].label.toLowerCase() + ' '}books yet.`} />
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((b) => (
            <BookCard key={b.id} book={b} onOpen={() => navigate(`/growth/library/${b.id}`)} onRead={() => navigate(`/growth/library/${b.id}/read`)} />
          ))}
        </div>
      )}

      <BookFormSheet open={formOpen} onOpenChange={setFormOpen} tz={user.timezone} />
    </div>
  )
}

function BookCard({ book, onOpen, onRead }: { book: BookDTO; onOpen: () => void; onRead: () => void }) {
  const canRead = book.hasFile && (book.format === 'epub' || book.format === 'pdf')
  const coverTone = book.status === 'finished' ? 'from-emerald-500/25 to-teal-500/10' : book.status === 'abandoned' ? 'from-muted to-muted' : 'from-orange-500/25 to-amber-500/10'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className="flex cursor-pointer gap-3 rounded-2xl border bg-card p-3 transition-colors hover:bg-accent"
    >
      <div
        aria-hidden
        className={cn('flex h-24 w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-br text-2xl shadow-inner', coverTone)}
      >
        {book.formatEmoji}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{book.title}</p>
            <p className="truncate text-xs text-muted-foreground">{book.author ?? 'Unknown author'}</p>
          </div>
          <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {book.statusEmoji} {book.statusLabel}
          </span>
        </div>

        {book.progressPct !== null ? (
          <div className="flex items-center gap-2">
            <ProgressBar value={book.progressPct} />
            <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">{Math.round(book.progressPct)}%</span>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            {isPageBased(book.format) ? 'Set the page count to track progress' : 'Open once to start tracking'}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            {book.streak > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5">🔥 {book.streak}d</span>}
            {book.minutes7d > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5">{book.minutes7d}m · 7d</span>}
            {book.rating != null && <span className="rounded-full bg-muted px-1.5 py-0.5">{'★'.repeat(book.rating)}</span>}
          </div>
          {canRead && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8 rounded-full px-3 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onRead()
              }}
            >
              <BookOpen className="mr-1 size-3.5" /> Read
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

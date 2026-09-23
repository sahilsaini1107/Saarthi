'use client'

// Book detail (Phase 16): progress control, reading stats, session log,
// and the three annotation tabs — highlights, margin notes, bookmarks.

import { useState } from 'react'
import { ArrowLeft, Bookmark as BookmarkIcon, BookOpen, Pencil, Quote as QuoteIcon, Star, Trash2 } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorCard, Field, ProgressBar, SkeletonRow, StatTile } from '@/components/ui/saarthi'
import { BookFormSheet } from '@/components/reading/book-form-sheet'
import { SessionLogSheet } from '@/components/reading/session-log-sheet'
import {
  useAddHighlight,
  useAddNote,
  useDeleteBookmark,
  useDeleteHighlight,
  useDeleteNote,
  useDeleteReadingSession,
  useBook,
  useQuoteFromHighlight,
  useUpdateBook,
  useUpdateBookProgress,
  useUpdateHighlight,
} from '@/hooks/queries'
import { HIGHLIGHT_COLORS, HIGHLIGHT_COLOR_CLASSES, isPageBased } from '@/lib/reading'
import { formatDayLabel } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { HighlightDTO } from '@/lib/types'

type Tab = 'highlights' | 'notes' | 'bookmarks'

export function BookDetailScreen({ bookId }: { bookId: string }) {
  const { user, navigate } = useUi()
  const book = useBook(bookId)
  const update = useUpdateBook()
  const progress = useUpdateBookProgress()
  const deleteSession = useDeleteReadingSession({ success: 'Session removed' })
  const [formOpen, setFormOpen] = useState(false)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('highlights')
  const [pageDraft, setPageDraft] = useState('')

  if (book.isLoading) return <SkeletonRow />
  if (book.isError) return <ErrorCard message={(book.error as Error).message} onRetry={() => book.refetch()} />
  const b = book.data
  if (!b) return null

  const pageBased = isPageBased(b.format)
  const canRead = b.hasFile && (b.format === 'epub' || b.format === 'pdf')

  function setStatus(status: string, extra?: { rating?: number | null; takeaway?: string | null }) {
    update.mutate({ id: b!.id, status, ...extra })
  }

  function setPage() {
    const p = Number(pageDraft)
    if (!Number.isFinite(p) || p <= 0) return
    progress.mutate({ id: b!.id, currentPage: Math.round(p) })
    setPageDraft('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <button type="button" onClick={() => navigate('/growth/library')} className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Library
        </button>
        <Button size="sm" variant="ghost" className="h-8 rounded-full px-3" onClick={() => setFormOpen(true)}>
          <Pencil className="mr-1 size-3.5" /> Edit
        </Button>
      </div>

      {/* hero */}
      <div className="flex gap-3 rounded-2xl border bg-card p-4">
        <div aria-hidden className="flex h-28 w-20 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-br from-orange-500/25 to-amber-500/10 text-3xl shadow-inner">
          {b.formatEmoji}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-lg font-bold leading-tight">{b.title}</h1>
          <p className="text-sm text-muted-foreground">{b.author ?? 'Unknown author'}</p>
          <div className="flex flex-wrap gap-1 pt-0.5">
            <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{b.formatLabel}</span>
            <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{b.statusEmoji} {b.statusLabel}</span>
            {b.tags.map((t) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">#{t}</span>
            ))}
          </div>
          {canRead && (
            <Button size="sm" className="mt-auto h-9 w-fit rounded-full px-4" onClick={() => navigate(`/growth/library/${b.id}/read`)}>
              <BookOpen className="mr-1 size-4" /> {b.progressPct && b.progressPct > 0 ? 'Continue reading' : 'Start reading'}
            </Button>
          )}
        </div>
      </div>

      {/* progress */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        {b.progressPct !== null && (
          <div className="flex items-center gap-3">
            <ProgressBar value={b.progressPct} />
            <span className="shrink-0 text-sm font-bold tabular-nums">{Math.round(b.progressPct)}%</span>
          </div>
        )}
        {pageBased && (
          <div className="flex items-end gap-2">
            <Field label={b.totalPages > 0 ? `Current page (of ${b.totalPages})` : 'Current page'}>
              <Input
                inputMode="numeric"
                value={pageDraft}
                onChange={(e) => setPageDraft(e.target.value.replace(/\D/g, ''))}
                placeholder={String(b.currentPage || 0)}
                className="h-10 w-32"
              />
            </Field>
            <Button size="sm" variant="secondary" className="h-10 rounded-xl" disabled={!pageDraft || progress.isPending} onClick={setPage}>
              Set
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {b.status === 'to_read' && (
            <Button size="sm" variant="secondary" className="h-9 rounded-full" onClick={() => setStatus('reading')}>▶ Start reading</Button>
          )}
          {b.status === 'reading' && (
            <Button size="sm" variant="secondary" className="h-9 rounded-full" onClick={() => setStatus('finished')}>✓ Mark finished</Button>
          )}
          {(b.status === 'finished' || b.status === 'abandoned') && (
            <Button size="sm" variant="secondary" className="h-9 rounded-full" onClick={() => setStatus('reading')}>↺ Re-open</Button>
          )}
          {b.status !== 'abandoned' && b.status !== 'finished' && (
            <Button size="sm" variant="ghost" className="h-9 rounded-full text-muted-foreground" onClick={() => setStatus('abandoned')}>Drop</Button>
          )}
          <Button size="sm" variant="secondary" className="h-9 rounded-full" onClick={() => setSessionOpen(true)}>+ Log session</Button>
        </div>
      </div>

      {/* finished: rating + takeaway */}
      {b.status === 'finished' && (
        <FinishCard rating={b.rating} takeaway={b.takeaway} onRate={(r, t) => update.mutate({ id: b.id, rating: r, takeaway: t })} />
      )}

      {/* stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatTile label="streak" value={b.streak > 0 ? `🔥${b.streak}` : '—'} />
        <StatTile label="min · 7d" value={String(b.minutes7d)} />
        <StatTile label="pages/day" value={b.pace !== null ? String(b.pace) : '—'} />
        <StatTile label="days left" value={b.eta !== null ? String(b.eta) : '—'} />
      </div>

      {/* sessions */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Recent sessions</p>
          <span className="text-xs text-muted-foreground">{b.sessionsCount} total · {b.minutesTotal}m</span>
        </div>
        {b.sessions.length === 0 ? (
          <p className="pt-2 text-xs text-muted-foreground">No sessions yet — log your first sitting above.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {b.sessions.slice(0, 7).map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                <span>{formatDayLabel(s.date)}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{s.minutes}m</span>
                  {s.pages > 0 && <span>· {s.pages}p</span>}
                  <button
                    type="button"
                    aria-label="Delete session"
                    className="text-muted-foreground hover:text-expense"
                    onClick={() => deleteSession.mutate({ id: b.id, sid: s.id })}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* annotations */}
      <div className="flex gap-1.5" role="tablist" aria-label="Annotation tabs">
        {(
          [
            { key: 'highlights', label: `Highlights (${b.highlights.length})` },
            { key: 'notes', label: `Notes (${b.notes.length})` },
            { key: 'bookmarks', label: `Bookmarks (${b.bookmarks.length})` },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.key ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'highlights' && <HighlightsTab bookId={b.id} highlights={b.highlights} canHaveCfi={b.format === 'epub'} />}
      {tab === 'notes' && <NotesTab bookId={b.id} notes={b.notes} />}
      {tab === 'bookmarks' && <BookmarksTab bookId={b.id} bookmarks={b.bookmarks} canRead={canRead} />}

      <BookFormSheet open={formOpen} onOpenChange={setFormOpen} book={b} tz={user.timezone} />
      <SessionLogSheet open={sessionOpen} onOpenChange={setSessionOpen} book={b} tz={user.timezone} />
    </div>
  )
}

// (sessions deletion is handled via useDeleteReadingSession in the screen above)

function FinishCard({ rating, takeaway, onRate }: { rating: number | null; takeaway: string | null; onRate: (r: number | null, t: string | null) => void }) {
  const [stars, setStars] = useState(rating ?? 0)
  const [lesson, setLesson] = useState(takeaway ?? '')
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <p className="text-sm font-semibold">Finished — what did it leave you with?</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setStars(n)}>
            <Star className={cn('size-6 transition-colors', n <= stars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
          </button>
        ))}
      </div>
      <Textarea value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="The one lesson worth keeping…" rows={2} />
      <Button size="sm" variant="secondary" className="h-9 w-fit rounded-full" onClick={() => onRate(stars || null, lesson.trim() || null)}>
        Save verdict
      </Button>
    </div>
  )
}

function HighlightsTab({ bookId, highlights, canHaveCfi }: { bookId: string; highlights: HighlightDTO[]; canHaveCfi: boolean }) {
  const del = useDeleteHighlight({ success: 'Highlight removed' })
  const update = useUpdateHighlight({ success: 'Highlight updated' })
  const quote = useQuoteFromHighlight()
  const add = useAddHighlight({ success: 'Highlight saved' })
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [mText, setMText] = useState('')
  const [mPage, setMPage] = useState('')

  return (
    <div className="flex flex-col gap-3">
      {!canHaveCfi && !manualOpen && (
        <Button size="sm" variant="outline" className="h-9 w-fit rounded-full" onClick={() => setManualOpen(true)}>
          + Add a passage
        </Button>
      )}
      {manualOpen && (
        <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
          <Field label="Passage">
            <Textarea value={mText} onChange={(e) => setMText(e.target.value)} placeholder="Type the words you want to keep…" rows={3} />
          </Field>
          <Field label="Page">
            <Input inputMode="numeric" value={mPage} onChange={(e) => setMPage(e.target.value.replace(/\D/g, ''))} className="h-10 w-28" />
          </Field>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!mText.trim() || !mPage || add.isPending}
              className="h-9 rounded-full"
              onClick={() =>
                add.mutate(
                  { bookId, text: mText.trim(), page: Number(mPage) || null },
                  {
                    onSuccess: () => {
                      setMText('')
                      setMPage('')
                      setManualOpen(false)
                    },
                  },
                )
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-9 rounded-full" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {highlights.length === 0 ? (
        <EmptyState
          emoji="🖍️"
          title="No highlights yet"
          body={canHaveCfi ? 'Select text while reading — it lands here with one tap.' : 'Use “Add a passage” to keep lines from a physical book.'}
        />
      ) : (
        highlights.map((h) => (
          <div key={h.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
            <div className="flex items-start gap-2">
              <span aria-hidden className={cn('mt-1 size-3 shrink-0 rounded-full', HIGHLIGHT_COLOR_CLASSES[h.color as keyof typeof HIGHLIGHT_COLOR_CLASSES] ?? HIGHLIGHT_COLOR_CLASSES.yellow)} />
              <p className="text-sm leading-relaxed">“{h.text}”</p>
            </div>
            {h.note && editing !== h.id && <p className="pl-5 text-xs text-muted-foreground">↳ {h.note}</p>}
            {editing === h.id && (
              <div className="flex flex-col gap-2 pl-5">
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Why does this matter?" />
                <div className="flex gap-2">
                  <Button size="sm" className="h-8 rounded-full px-3" onClick={() => update.mutate({ bookId, hid: h.id, note: draft.trim() || null }, { onSuccess: () => setEditing(null) })}>
                    Save note
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{h.page ? `p. ${h.page}` : 'EPUB'} · {h.chapter ?? ''}</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={() => quote.mutate(h.id)}>
                  <QuoteIcon className="mr-0.5 size-3" /> Quote
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-full px-2 text-xs"
                  onClick={() => {
                    setEditing(h.id)
                    setDraft(h.note ?? '')
                  }}
                >
                  <Pencil className="size-3" />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Delete highlight" className="h-7 rounded-full px-2 text-muted-foreground hover:text-expense" onClick={() => del.mutate({ bookId, hid: h.id })}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function NotesTab({ bookId, notes }: { bookId: string; notes: { id: string; page: number; text: string }[] }) {
  const add = useAddNote({ success: 'Note saved' })
  const del = useDeleteNote({ success: 'Note removed' })
  const [page, setPage] = useState('')
  const [text, setText] = useState('')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
        <div className="flex gap-2">
          <Field label="Page">
            <Input inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, ''))} className="h-10 w-24" />
          </Field>
          <div className="flex-1">
            <Field label="Margin note">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Your thought on this page…" />
            </Field>
          </div>
        </div>
        <Button
          size="sm"
          className="h-9 w-fit rounded-full"
          disabled={!text.trim() || !page || add.isPending}
          onClick={() => add.mutate({ bookId, page: Number(page), text: text.trim() }, { onSuccess: () => { setText(''); setPage('') } })}
        >
          Add note
        </Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState emoji="📝" title="No notes yet" body="Attach a thought to any page — perfect for PDFs and physical books." />
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-2 rounded-2xl border bg-card p-3">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground">p. {n.page}</p>
                <p className="text-sm">{n.text}</p>
              </div>
              <button type="button" aria-label="Delete note" className="text-muted-foreground hover:text-expense" onClick={() => del.mutate({ bookId, nid: n.id })}>
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BookmarksTab({ bookId, bookmarks, canRead }: { bookId: string; bookmarks: { id: string; page: number | null; label: string | null }[]; canRead: boolean }) {
  const del = useDeleteBookmark({ success: 'Bookmark removed' })
  const { navigate } = useUi()
  return (
    <div className="flex flex-col gap-2">
      {bookmarks.length === 0 ? (
        <EmptyState emoji="🔖" title="No bookmarks yet" body={canRead ? 'Tap the bookmark button inside the reader to save your spot.' : 'Bookmarks live inside the reader.'} />
      ) : (
        bookmarks.map((bm) => (
          <div key={bm.id} className="flex items-center justify-between rounded-2xl border bg-card p-3">
            <div className="flex items-center gap-2">
              <BookmarkIcon className="size-4 text-primary" />
              <div>
                <p className="text-sm font-medium">{bm.label ?? (bm.page ? `Page ${bm.page}` : 'Saved spot')}</p>
                {bm.page != null && bm.label && <p className="text-[10px] text-muted-foreground">p. {bm.page}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canRead && (
                <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={() => navigate(`/growth/library/${bookId}/read`)}>
                  Go
                </Button>
              )}
              <button type="button" aria-label="Delete bookmark" className="text-muted-foreground hover:text-expense" onClick={() => del.mutate({ bookId, bid: bm.id })}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

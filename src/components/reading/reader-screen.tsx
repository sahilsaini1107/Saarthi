'use client'

// In-app reader (Phase 16). EPUBs render through epub.js (loaded lazily,
// client-only) with text-selection highlights, notes, bookmarks, resume
// position and auto progress. PDFs render in the browser's own viewer via a
// sandbox-safe object URL, with page highlights, notes and bookmarks around them.
// Simpler interpretation (documented in PROGRESS.md): no DRM removal, PDF
// page position is user-set (iframes don't expose scroll), mobile browsers
// may hand PDFs to their native viewer.

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bookmark as BookmarkIcon, ExternalLink, List, Trash2, Type } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorCard, SkeletonRow } from '@/components/ui/saarthi'
import { SessionLogSheet } from '@/components/reading/session-log-sheet'
import { apiRaw } from '@/lib/client'
import { HIGHLIGHT_COLORS, HIGHLIGHT_COLOR_CLASSES, type HighlightColor } from '@/lib/reading'
import type { BookDetailDTO } from '@/lib/types'
import {
  useAddBookmark,
  useAddHighlight,
  useAddNote,
  useDeleteBookmark,
  useDeleteHighlight,
  useBook,
  useUpdateBookProgress,
  useUpdateHighlight,
} from '@/hooks/queries'
import { cn } from '@/lib/utils'

/* ---------- minimal epub.js surface (the lib's own types are fiddly) ---------- */

interface EpubRenditionLike {
  display: (arg?: string) => Promise<unknown>
  prev: () => Promise<unknown>
  next: () => Promise<unknown>
  resize: (w: number, h: number) => void
  themes: { fontSize: (size: string) => void; register: (name: string, rules: Record<string, Record<string, string>>) => void; select: (name: string) => void }
  on: (event: string, cb: (...args: unknown[]) => void) => void
  annotations: {
    add: (type: string, cfi: string, data: unknown, cb: () => void, options?: unknown, styles?: Record<string, string>) => void
    remove: (type: string, cfi: string) => void
  }
  destroy: () => void
}

interface EpubBookLike {
  ready: Promise<unknown>
  locations: { generate: (chars: number) => Promise<number>; percentageFromCfi: (cfi: string) => number | undefined }
  getRange: (cfi: string) => Promise<{ textContent?: string } | null>
  renderTo: (el: HTMLElement, opts: Record<string, unknown>) => EpubRenditionLike
  destroy: () => void
}

const FONT_SIZES = [90, 100, 115, 135]
const ANNOTATION_STYLES: Record<string, string> = { fill: '#facc15', 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply' }

export function ReaderScreen({ bookId }: { bookId: string }) {
  const { navigate, user } = useUi()
  const book = useBook(bookId)

  if (book.isLoading) return <SkeletonRow />
  if (book.isError) return <ErrorCard message={(book.error as Error).message} onRetry={() => book.refetch()} />
  const b = book.data
  if (!b) return null
  if (!b.hasFile || b.format === 'physical') {
    // Physical books and file-less entries have nothing to render here.
    navigate(`/growth/library/${bookId}`)
    return null
  }
  return b.format === 'epub' ? (
    <EpubReader key={b.id} bookId={b.id} tz={user.timezone} onBack={() => navigate(`/growth/library/${b.id}`)} />
  ) : (
    <PdfReader key={b.id} bookId={b.id} tz={user.timezone} onBack={() => navigate(`/growth/library/${b.id}`)} />
  )
}

/* ============================ shared annotations drawer ============================ */

function AnnotationsDrawer({
  open,
  onOpenChange,
  title,
  bookId,
  highlights,
  bookmarks,
  onGo,
  onDeleteHighlight,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  bookId: string
  highlights: { id: string; cfi: string | null; page: number | null; text: string; note: string | null; color: string }[]
  bookmarks: { id: string; cfi: string | null; page: number | null; label: string | null }[]
  onGo: (target: { cfi?: string | null; page?: number | null }) => void
  onDeleteHighlight: (hid: string) => void
}) {
  const delBookmark = useDeleteBookmark({ success: 'Bookmark removed' })
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle className="truncate">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pb-2">
          <p className="text-xs font-bold text-muted-foreground">HIGHLIGHTS</p>
          {highlights.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
          {highlights.map((h) => (
            <div key={h.id} className="rounded-xl border bg-card p-2.5">
              <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => onGo({ cfi: h.cfi, page: h.page })}>
                <span aria-hidden className={cn('mt-1 size-3 shrink-0 rounded-full', HIGHLIGHT_COLOR_CLASSES[h.color as HighlightColor] ?? HIGHLIGHT_COLOR_CLASSES.yellow)} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-3 text-xs leading-relaxed">{h.text}</span>
                  {h.page != null && <span className="mt-1 block text-[10px] text-muted-foreground">p. {h.page}</span>}
                </span>
              </button>
              {h.note && <p className="pl-5 text-[10px] text-muted-foreground">↳ {h.note}</p>}
              <div className="flex justify-end">
                <button type="button" aria-label="Delete highlight" className="text-muted-foreground hover:text-expense" onClick={() => onDeleteHighlight(h.id)}>
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
          <p className="pt-2 text-xs font-bold text-muted-foreground">BOOKMARKS</p>
          {bookmarks.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
          {bookmarks.map((bm) => (
            <div key={bm.id} className="flex items-center justify-between rounded-xl border bg-card p-2.5">
              <button type="button" className="flex items-center gap-2 text-left text-xs" onClick={() => onGo({ cfi: bm.cfi, page: bm.page })}>
                <BookmarkIcon className="size-3.5 text-primary" />
                {bm.label ?? (bm.page ? `Page ${bm.page}` : 'Saved spot')}
              </button>
              <button type="button" aria-label="Delete bookmark" className="text-muted-foreground hover:text-expense" onClick={() => delBookmark.mutate({ bookId, bid: bm.id })}>
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/* ================================ EPUB ================================ */

function EpubReader({ bookId, tz, onBack }: { bookId: string; tz: string; onBack: () => void }) {
  const book = useBook(bookId)
  const saveProgress = useUpdateBookProgress()
  const addHighlight = useAddHighlight({ success: 'Highlight saved' })
  const addBookmark = useAddBookmark({ success: 'Spot bookmarked' })
  const updateHighlight = useUpdateHighlight({ success: 'Note saved' })
  const delHighlight = useDeleteHighlight()

  const viewerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<EpubBookLike | null>(null)
  const renditionRef = useRef<EpubRenditionLike | null>(null)
  const lastSavedRef = useRef<string | null>(null)
  const currentCfiRef = useRef<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [percent, setPercent] = useState<number | null>(null)
  const [selection, setSelection] = useState<{ cfi: string; text: string } | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [fontSizeIdx, setFontSizeIdx] = useState(1)

  /* load + render once */
  useEffect(() => {
    let cancelled = false
    const b = book.data
    if (!b) return

    async function boot(data: BookDetailDTO) {
      try {
        const blob = await apiRaw(`/api/books/${bookId}/file`)
        if (cancelled) return
        const buf = await blob.arrayBuffer()
        const ePub = (await import('epubjs')).default
        if (cancelled) return
        const eb = ePub(buf) as unknown as EpubBookLike
        bookRef.current = eb
        // epub.js mis-measures '100%' inside the app shell — give it real pixels
        const el = viewerRef.current!
        const rendition = eb.renderTo(el, { width: el.clientWidth, height: el.clientHeight, spread: 'none' })
        renditionRef.current = rendition
        rendition.themes.register('saarthi', { body: { 'line-height': '1.6', 'font-family': 'serif' } })
        rendition.themes.select('saarthi')
        rendition.themes.fontSize(`${FONT_SIZES[fontSizeIdx]}%`)

        rendition.on('relocated', (...args: unknown[]) => {
          const loc = args[0] as { start?: { cfi?: string; percentage?: number | null } } | undefined
          const cfi = loc?.start?.cfi
          if (!cfi) return
          currentCfiRef.current = cfi
          // relocated carries the percent once locations are generated; the
          // Locations API differs across epub.js versions, so prefer the event
          const rawPct = typeof loc?.start?.percentage === 'number' ? loc.start.percentage : null
          const pct = rawPct !== null ? Math.round(rawPct * 10000) / 100 : null
          if (pct !== null) setPercent(pct)
          // save on change only — every page turn is one tiny POST, no debounce races
          if (lastSavedRef.current !== cfi) {
            lastSavedRef.current = cfi
            saveProgress.mutate({ id: bookId, position: cfi, ...(pct !== null ? { percent: pct } : {}) })
          }
        })

        rendition.on('selected', (...args: unknown[]) => {
          const cfiRange = args[0] as string
          eb.getRange(cfiRange)
            .then((range) => {
              const text = (range?.textContent ?? '').trim().slice(0, 2000)
              if (text) setSelection({ cfi: cfiRange, text })
            })
            .catch(() => undefined)
        })

        await rendition.display(data.position || undefined)
        // epub.js can size columns off the top window when mounted inside a
        // centered shell — re-pin to the real container once displayed
        rendition.resize(el.clientWidth, el.clientHeight)
        if (cancelled) return
        setStatus('ready')

        // page-ish locations power the percent readout (lazy, non-fatal).
        // After generation, recompute the percent for wherever the reader
        // currently is — the boot relocated fired before locations existed.
        eb.ready
          .then(() => eb.locations.generate(1024))
          .then(() => {
            const cfi = currentCfiRef.current
            if (cancelled || !cfi) return
            const raw = eb.locations.percentageFromCfi(cfi)
            if (typeof raw === 'number' && Number.isFinite(raw)) {
              const pct = Math.round(raw * 10000) / 100
              setPercent(pct)
              saveProgress.mutate({ id: bookId, percent: pct })
            }
          })
          .catch(() => undefined)

        // paint saved highlights
        for (const h of data.highlights) {
          if (h.cfi) rendition.annotations.add('highlight', h.cfi, h.id, () => setDrawerOpen(true), {}, { ...ANNOTATION_STYLES })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not open this EPUB')
          setStatus('error')
        }
      }
    }

    void boot(b)
    return () => {
      cancelled = true
      try {
        renditionRef.current?.destroy()
        bookRef.current?.destroy()
      } catch {
        // ignore teardown races
      }
      renditionRef.current = null
      bookRef.current = null
    }
  }, [bookId])

  function paint(h: { cfi: string | null; id?: string }) {
    if (h.cfi && renditionRef.current) {
      renditionRef.current.annotations.add('highlight', h.cfi, h.id ?? null, () => setDrawerOpen(true), {}, { ...ANNOTATION_STYLES })
    }
  }

  async function saveSelection(color: HighlightColor, withNote: boolean) {
    if (!selection) return
    try {
      const created = await addHighlight.mutateAsync({
        bookId,
        cfi: selection.cfi,
        text: selection.text,
        color,
        note: withNote ? noteDraft.trim() || null : null,
      })
      paint({ cfi: created.cfi, id: created.id })
    } catch {
      // toast surfaced by hook
    }
    clearSelection()
    setNoteDraft('')
    setNoteOpen(false)
  }

  function clearSelection() {
    const win = (viewerRef.current?.querySelector('iframe') as HTMLIFrameElement | null)?.contentWindow
    try {
      win?.getSelection()?.removeAllRanges()
    } catch {
      // cross-origin teardown races are fine to ignore
    }
    setSelection(null)
  }

  function bumpFont(delta: number) {
    const next = Math.min(FONT_SIZES.length - 1, Math.max(0, fontSizeIdx + delta))
    setFontSizeIdx(next)
    renditionRef.current?.themes.fontSize(`${FONT_SIZES[next]}%`)
  }

  function bookmarkSpot() {
    const cfi = (book.data?.position ?? '').trim()
    addBookmark.mutate({ bookId, cfi: cfi || null, label: cfi ? null : 'Saved spot' })
  }

  const b = book.data

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <button type="button" onClick={onBack} aria-label="Back to book" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{b?.title}</p>
        {percent !== null && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums">{Math.round(percent)}%</span>}
        <button type="button" aria-label="Change text size" onClick={() => bumpFont(1)} className="text-muted-foreground hover:text-foreground">
          <Type className="size-5" />
        </button>
        <button type="button" aria-label="Bookmark this spot" onClick={bookmarkSpot} className="text-muted-foreground hover:text-foreground">
          <BookmarkIcon className="size-5" />
        </button>
        <button type="button" aria-label="Highlights and bookmarks" onClick={() => setDrawerOpen(true)} className="text-muted-foreground hover:text-foreground">
          <List className="size-5" />
        </button>
      </div>

      <div className="relative h-[68vh] overflow-hidden rounded-2xl border bg-card">
        <div ref={viewerRef} className="h-full w-full" />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80">
            <p className="text-sm text-muted-foreground">Opening your book…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <ErrorCard message={error} onRetry={onBack} />
          </div>
        )}

        {/* selection toolbar */}
        {selection && (
          <div className="absolute inset-x-3 top-3 flex flex-col gap-2 rounded-2xl border bg-popover p-3 shadow-lg">
            {noteOpen ? (
              <>
                <Textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={2} autoFocus placeholder="Why does this matter?" />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {HIGHLIGHT_COLORS.map((c) => (
                      <button key={c} type="button" aria-label={`Save with ${c} pen`} className={cn('size-6 rounded-full border border-black/10', HIGHLIGHT_COLOR_CLASSES[c])} onClick={() => saveSelection(c, true)} />
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => setNoteOpen(false)}>Just highlight</Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button key={c} type="button" aria-label={`Highlight ${c}`} className={cn('size-6 rounded-full border border-black/10', HIGHLIGHT_COLOR_CLASSES[c])} onClick={() => saveSelection(c, false)} />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="secondary" className="h-7 rounded-full px-2 text-xs" onClick={() => setNoteOpen(true)}>
                    Note
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={clearSelection}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1">
        <Button size="sm" variant="secondary" className="h-9 rounded-full" onClick={() => setSessionOpen(true)}>
          + Log session
        </Button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" aria-label="Previous page" className="h-9 w-9 rounded-full p-0" onClick={() => renditionRef.current?.prev()}>
            <ArrowLeft className="size-4" />
          </Button>
          <Button size="sm" variant="outline" aria-label="Next page" className="h-9 w-9 rounded-full p-0" onClick={() => renditionRef.current?.next()}>
            <ArrowRight className="size-4" />
          </Button>
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">Progress saves automatically</p>
      </div>

      <AnnotationsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={b?.title ?? ''}
        bookId={bookId}
        highlights={b?.highlights ?? []}
        bookmarks={b?.bookmarks ?? []}
        onGo={(t) => {
          if (t.cfi) renditionRef.current?.display(t.cfi)
          setDrawerOpen(false)
        }}
        onDeleteHighlight={(hid) => {
          const h = b?.highlights.find((x) => x.id === hid)
          if (h?.cfi) renditionRef.current?.annotations.remove('highlight', h.cfi)
          delHighlight.mutate({ bookId, hid })
        }}
      />

      {b && <SessionLogSheet open={sessionOpen} onOpenChange={setSessionOpen} book={b} tz={tz} />}
    </div>
  )
}

/* ================================ PDF ================================ */

function PdfReader({ bookId, tz, onBack }: { bookId: string; tz: string; onBack: () => void }) {
  const book = useBook(bookId)
  const saveProgress = useUpdateBookProgress()
  const addBookmark = useAddBookmark({ success: 'Page bookmarked' })
  const addHighlight = useAddHighlight({ success: 'Highlight saved' })
  const delHighlight = useDeleteHighlight({ success: 'Highlight removed' })
  const addNote = useAddNote({ success: 'Note saved' })
  const [url, setUrl] = useState<string | null>(null)
  const [page, setPage] = useState('')
  const [highlightText, setHighlightText] = useState('')
  const [highlightNote, setHighlightNote] = useState('')
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('yellow')
  const [noteText, setNoteText] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    apiRaw(`/api/books/${bookId}/file`)
      .then((blob) => {
        if (cancelled) {
          URL.revokeObjectURL(URL.createObjectURL(blob))
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the PDF'))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [bookId])

  const b = book.data
  if (!b) return null

  function commitPage(p: number) {
    const clamped = Math.max(1, Math.round(p))
    saveProgress.mutate({ id: bookId, currentPage: clamped })
    setPage(String(clamped))
  }

  const activePage = Number(page) || b.currentPage || 1

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <button type="button" onClick={onBack} aria-label="Back to book" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{b.title}</p>
        <div className="flex items-center gap-1 rounded-full border px-2 py-0.5">
          <span className="text-[10px] text-muted-foreground">p.</span>
          <Input
            className="h-6 w-12 border-0 bg-transparent px-1 text-center text-xs tabular-nums"
            inputMode="numeric"
            value={page}
            placeholder={String(b.currentPage || 1)}
            onChange={(e) => setPage(e.target.value.replace(/\D/g, ''))}
            onBlur={() => page && commitPage(Number(page))}
            onKeyDown={(e) => e.key === 'Enter' && page && commitPage(Number(page))}
            aria-label="Current page"
          />
          {b.totalPages > 0 && <span className="text-[10px] text-muted-foreground">/ {b.totalPages}</span>}
        </div>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open in system viewer" className="text-muted-foreground hover:text-foreground">
            <ExternalLink className="size-5" />
          </a>
        )}
        <button
          type="button"
          aria-label="Bookmark this page"
          onClick={() => addBookmark.mutate({ bookId, page: Number(page) || b.currentPage || 1, label: null })}
          className="text-muted-foreground hover:text-foreground"
        >
          <BookmarkIcon className="size-5" />
        </button>
        <button type="button" aria-label="Notes and bookmarks" onClick={() => setDrawerOpen(true)} className="text-muted-foreground hover:text-foreground">
          <List className="size-5" />
        </button>
      </div>

      <div className="h-[68vh] overflow-hidden rounded-2xl border bg-card">
        {error ? (
          <div className="flex h-full items-center justify-center p-6">
            <ErrorCard message={error} onRetry={onBack} />
          </div>
        ) : url ? (
          <object key={page || b.currentPage || 'start'} title={b.title} data={`${url}#page=${activePage}`} type="application/pdf" className="h-full w-full">
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm font-semibold">This browser cannot embed PDFs here.</p>
              <p className="max-w-[32ch] text-xs text-muted-foreground">
                The file is loaded, but the built-in PDF plugin is unavailable. Open it from the top-right button and keep notes here by page.
              </p>
              <Button asChild size="sm" className="rounded-full">
                <a href={url} target="_blank" rel="noreferrer">Open PDF</a>
              </Button>
            </div>
          </object>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading PDF…</p>
          </div>
        )}
      </div>

      <section className="rounded-2xl border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Highlight on p. {activePage}</p>
          <div className="flex gap-1.5">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c} highlighter`}
                onClick={() => setHighlightColor(c)}
                className={cn('size-6 rounded-full border border-black/10', HIGHLIGHT_COLOR_CLASSES[c], highlightColor === c && 'ring-2 ring-primary ring-offset-2')}
              />
            ))}
          </div>
        </div>
        <Textarea
          value={highlightText}
          onChange={(e) => setHighlightText(e.target.value)}
          placeholder="Paste or type the passage you want to keep..."
          className="mt-2 min-h-20 rounded-xl"
        />
        <Input value={highlightNote} onChange={(e) => setHighlightNote(e.target.value)} placeholder="Optional note for this highlight..." className="mt-2 h-10 rounded-xl" />
        <Button
          size="sm"
          className="mt-2 h-9 rounded-xl"
          disabled={!highlightText.trim() || addHighlight.isPending}
          onClick={() =>
            addHighlight.mutate(
              { bookId, page: activePage, text: highlightText.trim(), note: highlightNote.trim() || null, color: highlightColor },
              {
                onSuccess: () => {
                  setHighlightText('')
                  setHighlightNote('')
                },
              },
            )
          }
        >
          Save highlight
        </Button>
      </section>

      <section className="flex items-center gap-2 px-1">
        <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={`Write a note on p. ${activePage}...`} className="h-10 rounded-xl" />
        <Button
          size="sm"
          className="h-10 shrink-0 rounded-xl"
          disabled={!noteText.trim()}
          onClick={() =>
            addNote.mutate(
              { bookId, page: activePage, text: noteText.trim() },
              { onSuccess: () => setNoteText('') },
            )
          }
        >
          Save
        </Button>
        <Button size="sm" variant="secondary" className="h-10 shrink-0 rounded-xl" onClick={() => setSessionOpen(true)}>
          + Session
        </Button>
      </section>

      <AnnotationsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={b.title}
        bookId={bookId}
        highlights={b.highlights}
        bookmarks={b.bookmarks}
        onGo={(t) => {
          if (t.page) commitPage(t.page)
          setDrawerOpen(false)
        }}
        onDeleteHighlight={(hid) => delHighlight.mutate({ bookId, hid })}
      />

      <SessionLogSheet open={sessionOpen} onOpenChange={setSessionOpen} book={b} tz={tz} />
    </div>
  )
}

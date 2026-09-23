'use client'

// Quotes vault (Phase 16) — lines worth carrying for life. A deterministic
// daily quote leads the screen; highlights from any book can be quoted into
// here in one tap.

import { useMemo, useState } from 'react'
import { Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { EmptyState, ErrorCard, Field, SkeletonRow } from '@/components/ui/saarthi'
import { useBooks, useCreateQuote, useDeleteQuote, useQuotes, useToday, useUpdateQuote } from '@/hooks/queries'
import { parseTags } from '@/lib/reading'
import { cn } from '@/lib/utils'
import type { QuoteDTO } from '@/lib/types'

export function QuotesScreen() {
  const { navigate } = useUi()
  const quotes = useQuotes()
  const today = useToday()
  const update = useUpdateQuote()
  const del = useDeleteQuote({ success: 'Quote removed' })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<QuoteDTO | null>(null)
  const [search, setSearch] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [tag, setTag] = useState<string | null>(null)

  const list = quotes.data ?? []
  const allTags = useMemo(() => [...new Set(list.flatMap((q) => q.tags))].slice(0, 12), [list])
  const shown = list.filter((q) => {
    if (favoritesOnly && !q.favorite) return false
    if (tag && !q.tags.includes(tag)) return false
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      const hay = `${q.text} ${q.author ?? ''} ${q.source ?? ''}`.toLowerCase()
      if (!hay.includes(s)) return false
    }
    return true
  })
  const dq = today.data?.dailyQuoteToday ?? null

  if (quotes.isLoading) return <SkeletonRow />
  if (quotes.isError) return <ErrorCard message={(quotes.error as Error).message} onRetry={() => quotes.refetch()} />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quotes</h1>
          <p className="text-sm text-muted-foreground">Words worth carrying for life.</p>
        </div>
        <Button
          size="sm"
          className="h-9 rounded-full"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="mr-1 size-4" /> New
        </Button>
      </div>

      {/* daily quote */}
      {dq && (
        <figure className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
          <figcaption className="mb-1 text-[10px] font-bold uppercase tracking-widest text-primary">Today&apos;s quote</figcaption>
          <blockquote className="text-[15px] font-medium leading-relaxed">“{dq.text}”</blockquote>
          {(dq.author || dq.source) && (
            <p className="pt-1.5 text-xs text-muted-foreground">— {dq.author ?? 'Unknown'}{dq.source ? ` · ${dq.source}` : ''}</p>
          )}
        </figure>
      )}

      {list.length > 0 && (
        <>
          <div className="flex gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quotes…" className="h-10 rounded-xl" />
            <button
              type="button"
              aria-label="Show favorites only"
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((v) => !v)}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors',
                favoritesOnly ? 'border-amber-400 bg-amber-400/10 text-amber-500' : 'bg-card text-muted-foreground',
              )}
            >
              <Star className={cn('size-4', favoritesOnly && 'fill-amber-400')} />
            </button>
          </div>
          {allTags.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag((cur) => (cur === t ? null : t))}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    tag === t ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
                  )}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {list.length === 0 ? (
        <EmptyState
          emoji="💬"
          title="Your vault is empty"
          body="Save lines that stop you mid-scroll — from books (quote a highlight), speeches, or people you admire. One shows up here every day."
          action={
            <Button className="mt-2 h-11 rounded-xl px-6" onClick={() => setFormOpen(true)}>
              <Plus className="mr-1 size-4" /> Add a quote
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState emoji="🔍" title="No matches" body="Try a different search or filter." />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((q) => (
            <li key={q.id} className="flex flex-col gap-1.5 rounded-2xl border bg-card p-4">
              <blockquote className="text-sm leading-relaxed">“{q.text}”</blockquote>
              {(q.author || q.source) && (
                <p className="text-xs text-muted-foreground">
                  — {q.author ?? 'Unknown'}
                  {q.source ? ` · ${q.source}` : ''}
                </p>
              )}
              {q.bookTitle && (
                <button type="button" onClick={() => q.bookId && navigate(`/growth/library/${q.bookId}`)} className="w-fit rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">
                  📖 {q.bookTitle}
                </button>
              )}
              {q.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {q.tags.map((t) => (
                    <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">#{t}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-end gap-1 pt-0.5">
                <button
                  type="button"
                  aria-label={q.favorite ? 'Unfavorite' : 'Favorite'}
                  aria-pressed={q.favorite}
                  onClick={() => update.mutate({ id: q.id, favorite: !q.favorite })}
                  className={cn('p-1', q.favorite ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground')}
                >
                  <Star className={cn('size-4', q.favorite && 'fill-amber-400')} />
                </button>
                <button
                  type="button"
                  aria-label="Edit quote"
                  className="p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEditing(q)
                    setFormOpen(true)
                  }}
                >
                  <Pencil className="size-4" />
                </button>
                <button type="button" aria-label="Delete quote" className="p-1 text-muted-foreground hover:text-expense" onClick={() => del.mutate(q.id)}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <QuoteFormSheet open={formOpen} onOpenChange={setFormOpen} quote={editing} />
    </div>
  )
}

function QuoteFormSheet({ open, onOpenChange, quote }: { open: boolean; onOpenChange: (o: boolean) => void; quote: QuoteDTO | null }) {
  const create = useCreateQuote({ success: 'Saved to your vault' })
  const update = useUpdateQuote({ success: 'Quote updated' })
  const del = useDeleteQuote({ success: 'Quote removed' })
  const books = useBooks()
  const [text, setText] = useState(quote?.text ?? '')
  const [author, setAuthor] = useState(quote?.author ?? '')
  const [source, setSource] = useState(quote?.source ?? '')
  const [tags, setTags] = useState(quote?.tags.join(', ') ?? '')
  const [favorite, setFavorite] = useState(quote?.favorite ?? false)
  const [bookId, setBookId] = useState(quote?.bookId ?? '')

  const valid = text.trim().length > 0

  function onSave() {
    if (!valid) return
    const payload = {
      text: text.trim(),
      author: author.trim() || null,
      source: source.trim() || null,
      tags: tags.trim() || null,
      favorite,
      bookId: bookId || null,
    }
    if (quote) update.mutate({ id: quote.id, ...payload }, { onSuccess: () => onOpenChange(false) })
    else create.mutate(payload, { onSuccess: () => onOpenChange(false) })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{quote ? 'Edit quote' : 'Save a quote'}</DrawerTitle>
          <DrawerDescription>The lines you re-read become the voice in your head. Choose well.</DrawerDescription>
        </DrawerHeader>
        {open && (
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto" key={quote?.id ?? 'new'}>
            <Field label="Quote">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="The words themselves…" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Author">
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. Naval Ravikant" />
              </Field>
              <Field label="Source">
                <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="speech, book, podcast…" />
              </Field>
            </div>
            <Field label="From your library" hint="Optional — link it to the book it came from">
              <select
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                className="h-11 w-full rounded-xl border bg-card px-3 text-sm"
                aria-label="Link to book"
              >
                <option value="">Not from a library book</option>
                {(books.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tags" hint="Comma-separated">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="mindset, money" />
            </Field>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <p className="text-sm font-medium">Favorite</p>
              <Switch checked={favorite} onCheckedChange={setFavorite} />
            </div>
            <Button onClick={onSave} disabled={!valid || create.isPending || update.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
              {quote ? 'Save changes' : 'Save quote'}
            </Button>
            {quote && quote.highlightId && (
              <p className="text-center text-[10px] text-muted-foreground">Quoted from a highlight · edits update this card only</p>
            )}
            {quote && (
              <Button
                variant="ghost"
                className="text-expense"
                onClick={() => {
                  if (confirm('Delete this quote?')) del.mutate(quote.id, { onSuccess: () => onOpenChange(false) })
                }}
              >
                Delete quote
              </Button>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

'use client'

// Content Library (Phase 18) — a private watch/read-later vault. YouTube plays
// in-app via a privacy-enhanced embed, articles open in a reader view (server
// extraction, cached), files stream from SQLite. Status: queue → in progress
// → done, with favorites pinned and an archive sink.

import { useState } from 'react'
import { ExternalLink, Pencil, Play, RefreshCw, Star, Trash2 } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorCard, SkeletonRow } from '@/components/ui/saarthi'
import { ContentFormSheet } from '@/components/content/content-form-sheet'
import { useContent, useDeleteContentFile, useFetchReader, useUpdateContent } from '@/hooks/queries'
import { todayISO } from '@/lib/date'
import { contentStats, formatBytes, youtubeEmbedUrl } from '@/lib/content'
import { cn } from '@/lib/utils'
import type { ContentItemDTO } from '@/lib/types'

type Filter = 'all' | 'inbox' | 'active' | 'done' | 'favorites' | 'archived'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'inbox', label: 'Queue' },
  { key: 'active', label: 'In progress' },
  { key: 'done', label: 'Done' },
  { key: 'favorites', label: '★' },
]

const STARTERS = [
  { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', label: 'a YouTube link' },
  { url: 'https://paulgraham.com/greatwork.html', label: 'an article' },
]

export function ContentScreen() {
  const { user } = useUi()
  const today = todayISO(user.timezone)
  const content = useContent()
  const update = useUpdateContent({ success: 'Updated' })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ContentItemDTO | 'new' | null>(null)
  const [prefillUrl, setPrefillUrl] = useState<string | undefined>(undefined)
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  if (content.isLoading) return <SkeletonRow />
  if (content.isError) return <ErrorCard message={(content.error as Error).message} onRetry={() => content.refetch()} />

  const list = content.data ?? []
  const stats = contentStats(
    list.map((c) => ({ kind: c.kind, status: c.status, favorite: c.favorite, addedOn: c.addedOn })),
    today,
  )
  const hasArchived = list.some((c) => c.status === 'archived')
  const shown = list.filter((c) => {
    if (filter === 'all') return c.status !== 'archived'
    if (filter === 'favorites') return c.favorite && c.status !== 'archived'
    return c.status === filter
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content Library</h1>
          <p className="text-sm text-muted-foreground">Your private vault — watch and read it all here.</p>
        </div>
        <Button
          size="sm"
          className="h-9 rounded-full"
          onClick={() => {
            setEditing('new')
            setFormOpen(true)
          }}
        >
          + Save
        </Button>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <StatTile value={stats.inbox} label="in queue" />
          <StatTile value={stats.active} label="in progress" />
          <StatTile value={stats.done} label="done" />
          <StatTile value={stats.addedThisWeek} label="added 7d" />
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          emoji="🎬"
          title="Nothing saved yet"
          body="Paste a YouTube link to watch it here, an article to read it in a clean view, or upload a file up to 15 MB. Quick start:"
          action={
            <div className="mt-3 flex flex-col gap-2">
              {STARTERS.map((s) => (
                <StarterButton
                  key={s.url}
                  label={s.label}
                  onPick={() => {
                    setPrefillUrl(s.url)
                    setEditing('new')
                    setFormOpen(true)
                  }}
                />
              ))}
              <Button
                size="sm"
                variant="outline"
                className="mt-1 self-center rounded-full"
                onClick={() => {
                  setPrefillUrl(undefined)
                  setEditing('new')
                  setFormOpen(true)
                }}
              >
                Add my own
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-5 gap-1 rounded-xl bg-muted p-1">
            {FILTERS.map((f) => (
              <FilterChip key={f.key} active={filter === f.key} label={f.label} onClick={() => setFilter(f.key)} />
            ))}
          </div>
          {hasArchived && (
            <button
              type="button"
              onClick={() => setFilter(filter === 'archived' ? 'all' : 'archived')}
              className={cn('self-start rounded-full border px-3 py-1 text-xs font-medium', filter === 'archived' ? 'border-transparent bg-primary text-primary-foreground' : 'text-muted-foreground')}
            >
              🗄️ Archived {stats.archived > 0 && `(${stats.archived})`}
            </button>
          )}

          <div className="flex flex-col gap-2">
            {shown.map((c) => (
              <ContentRow
                key={c.id}
                item={c}
                expanded={expanded === c.id}
                onToggleExpand={() => setExpanded(expanded === c.id ? null : c.id)}
                onEdit={() => {
                  setEditing(c)
                  setFormOpen(true)
                }}
                onStatus={(status) => update.mutate({ id: c.id, status })}
                onFavorite={() => update.mutate({ id: c.id, favorite: !c.favorite })}
              />
            ))}
            {shown.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
          </div>

          {stats.completionPct != null && (
            <p className="pt-1 text-center text-xs text-muted-foreground">
              {stats.completionPct}% of your library consumed{stats.oldestUnconsumedDays != null && stats.oldestUnconsumedDays >= 7 ? ` · oldest item waiting ${stats.oldestUnconsumedDays}d` : ''}
            </p>
          )}
        </>
      )}

      <ContentFormSheet
        open={formOpen}
        prefillUrl={prefillUrl}
        onOpenChange={(o) => {
          setFormOpen(o)
          if (!o) {
            setEditing(null)
            setPrefillUrl(undefined)
          }
        }}
        item={editing && editing !== 'new' ? editing : null}
      />
    </div>
  )
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3 text-center">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition-colors',
        active ? 'bg-card shadow-sm' : 'text-muted-foreground',
      )}
    >
      {label}
    </button>
  )
}

function StarterButton({ label, onPick }: { label: string; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="rounded-xl border bg-card px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent">
      + Paste {label}
    </button>
  )
}

/* ---------- row + viewers ---------- */

function ContentRow({
  item,
  expanded,
  onToggleExpand,
  onEdit,
  onStatus,
  onFavorite,
}: {
  item: ContentItemDTO
  expanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onStatus: (status: string) => void
  onFavorite: () => void
}) {
  return (
    <div className={cn('rounded-2xl border bg-card', item.status === 'archived' && 'opacity-60')}>
      <div className="flex items-center gap-3 p-3.5">
        <button type="button" aria-label="Toggle details" onClick={onToggleExpand} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-lg">
              {item.kindEmoji}
            </span>
            <p className="truncate text-sm font-semibold">{item.title}</p>
            {item.favorite && <Star className="size-3.5 shrink-0 fill-warn text-warn" />}
          </div>
          <p className="text-xs text-muted-foreground">
            {item.kindLabel} · {item.statusLabel}
            {item.ageDays > 0 && ` · saved ${item.ageDays}d ago`}
            {item.hasFile && ` · ${formatBytes(item.fileSize ?? 0)}`}
            {item.hasReader && ' · reader ready'}
          </p>
          {item.tags.length > 0 && <p className="mt-1 truncate text-[11px] text-primary/80">{item.tags.map((t) => `#${t}`).join(' ')}</p>}
        </button>
        <button type="button" aria-label={item.favorite ? 'Unfavorite' : 'Favorite'} onClick={onFavorite} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-warn">
          <Star className={cn('size-4', item.favorite && 'fill-warn text-warn')} />
        </button>
        <button type="button" aria-label="Edit" onClick={onEdit} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
          <Pencil className="size-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t px-3.5 py-3">
          <Viewer item={item} />
          <StatusActions item={item} onStatus={onStatus} />
        </div>
      )}
    </div>
  )
}

function Viewer({ item }: { item: ContentItemDTO }) {
  const update = useUpdateContent()
  const delFile = useDeleteContentFile({ success: 'File removed' })

  if (item.hasFile) {
    const src = `/api/content/${item.id}/file`
    return (
      <div className="flex flex-col gap-2">
        {item.fileView === 'video' && <video controls src={src} className="w-full rounded-xl bg-black" preload="metadata" />}
        {item.fileView === 'audio' && <audio controls src={src} className="w-full" />}
        {item.fileView === 'pdf' && <iframe src={src} title={item.title} className="h-72 w-full rounded-xl border" />}
        {item.fileView === 'image' && (
           
          <img src={src} alt={item.title} className="w-full rounded-xl" />
        )}
        {item.fileView === 'download' && (
          <a href={src} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <ExternalLink className="size-4" /> Open file
          </a>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {item.fileName} · {formatBytes(item.fileSize ?? 0)}
          </span>
          <button type="button" onClick={() => { if (confirm('Remove the attached file?')) delFile.mutate(item.id) }} className="flex items-center gap-1 text-expense">
            <Trash2 className="size-3.5" /> Remove file
          </button>
        </div>
      </div>
    )
  }

  if (item.youtubeId) {
    return (
      <div className="overflow-hidden rounded-xl border">
        <iframe
          src={youtubeEmbedUrl(item.youtubeId)}
          title={item.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full"
        />
      </div>
    )
  }

  if (item.kind === 'article' && item.url) {
    const url = item.url
    return <ArticleViewer id={item.id} url={url} fallbackTitle={item.title} />
  }

  if (item.url) {
    const url = item.url
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl bg-muted p-3">
        <p className="truncate text-xs text-muted-foreground">{item.url}</p>
        <button
          type="button"
          onClick={() => {
            // promote a YouTube link saved as "link" into a playable video
            if (item.youtubeId) update.mutate({ id: item.id, kind: 'video' })
            else window.open(url, '_blank', 'noreferrer')
          }}
          className="shrink-0 text-xs font-medium text-primary"
        >
          {item.youtubeId ? 'Play as video' : 'Open'}
        </button>
      </div>
    )
  }

  return <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">No link or file — just a note.</p>
}

function ArticleViewer({ id, url, fallbackTitle }: { id: string; url: string; fallbackTitle: string }) {
  const reader = useFetchReader({ success: 'Reader ready' })
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-9 flex-1 rounded-full"
          disabled={reader.isPending}
          onClick={() => {
            setOpen(true)
            reader.mutate({ id })
          }}
        >
          <Play className="mr-1 size-4" /> {reader.isPending ? 'Fetching…' : 'Read here'}
        </Button>
        <button
          type="button"
          aria-label="Refresh reader text"
          disabled={reader.isPending}
          onClick={() => {
            setOpen(true)
            reader.mutate({ id, refresh: true })
          }}
          className="flex h-9 items-center rounded-full border px-3 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={cn('size-3.5', reader.isPending && 'animate-spin')} />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium text-muted-foreground hover:bg-accent"
        >
          <ExternalLink className="size-3.5" /> Original
        </a>
      </div>
      {open && (
        <ReaderView
          loading={reader.isPending}
          failed={!reader.data && reader.isError}
          title={reader.data?.title}
          text={reader.data?.text}
          fallbackTitle={fallbackTitle}
        />
      )}
    </div>
  )
}

function ReaderView({
  loading,
  failed,
  title,
  text,
  fallbackTitle,
}: {
  loading: boolean
  failed: boolean
  title?: string
  text?: string
  fallbackTitle: string
}) {
  if (loading) {
    return <div className="animate-pulse rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">Fetching the article…</div>
  }
  if (failed || !text) {
    return <div className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">Couldn&apos;t load — try the original link.</div>
  }
  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-xl border bg-background p-4">
      <h3 className="pb-2 text-base font-bold leading-snug">{title || fallbackTitle}</h3>
      <div className="flex flex-col gap-3">
        {text.split('\n\n').map((para, i) => (
          <p key={i} className="text-sm leading-relaxed">
            {para}
          </p>
        ))}
      </div>
    </div>
  )
}

function StatusActions({ item, onStatus }: { item: ContentItemDTO; onStatus: (s: string) => void }) {
  const moves: { label: string; to: string; tone?: string }[] = []
  if (item.status === 'inbox') moves.push({ label: '▶ Start', to: 'active' }, { label: '✓ Done', to: 'done' })
  if (item.status === 'active') moves.push({ label: '✓ Done', to: 'done' }, { label: '↩ Back to queue', to: 'inbox' })
  if (item.status === 'done') moves.push({ label: '↩ Revisit', to: 'active' })
  if (item.status !== 'archived') moves.push({ label: '🗄️ Archive', to: 'archived' })
  else moves.push({ label: '↩ Restore', to: 'inbox' })
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {moves.map((m) => (
        <button
          key={m.to + m.label}
          type="button"
          onClick={() => onStatus(m.to)}
          className={cn(
            'h-9 rounded-full border px-3.5 text-xs font-semibold transition-all active:scale-95',
            m.to === 'done' ? 'border-transparent bg-income text-white' : m.to === 'archived' ? 'text-muted-foreground hover:bg-accent' : 'border-transparent bg-primary text-primary-foreground',
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

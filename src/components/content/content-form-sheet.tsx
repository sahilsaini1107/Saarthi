'use client'

// Content form (Phase 18) — paste a link (kind auto-detects) or pick a file.
// The <10s path: paste URL → title falls back to hostname → save.

import { useState } from 'react'
import { Paperclip, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Field } from '@/components/ui/saarthi'
import { useCreateContent, useDeleteContent, useUpdateContent, useUploadContentFile } from '@/hooks/queries'
import { CONTENT_KINDS, isHttpUrl, youtubeId } from '@/lib/content'
import { cn } from '@/lib/utils'
import type { ContentItemDTO } from '@/lib/types'

const STATUS_CHIPS = ['inbox', 'active', 'done'] as const

export function ContentFormSheet({
  open,
  onOpenChange,
  item,
  prefillUrl,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  item?: ContentItemDTO | null
  prefillUrl?: string
}) {
  const isEdit = Boolean(item)
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Edit item' : 'Save to library'}</DrawerTitle>
          <DrawerDescription>Paste a YouTube link for the in-app player, an article for reader view, or upload a file.</DrawerDescription>
        </DrawerHeader>
        {open && <ContentForm key={isEdit ? item!.id : prefillUrl ?? 'new'} item={item ?? null} prefillUrl={prefillUrl} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function ContentForm({ item, prefillUrl, onClose }: { item: ContentItemDTO | null; prefillUrl?: string; onClose: () => void }) {
  const isNew = !item
  const create = useCreateContent({ success: 'Saved to library' })
  const save = useUpdateContent({ success: 'Item updated' })
  const del = useDeleteContent({ success: 'Item removed' })
  const upload = useUploadContentFile({ success: 'File attached' })

  const [url, setUrl] = useState(item?.url ?? prefillUrl ?? '')
  const [kind, setKind] = useState<string>(item?.kind ?? 'auto')
  const [title, setTitle] = useState(item?.title ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [tags, setTags] = useState(item?.tags.join(', ') ?? '')
  const [status, setStatus] = useState(item?.status ?? 'inbox')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const detected: string = isNew
    ? kind === 'auto'
      ? youtubeId(url)
        ? 'video'
        : isHttpUrl(url)
          ? 'article'
          : 'link'
      : kind
    : kind
  const previewId = youtubeId(url)
  const valid = isNew ? isHttpUrl(url) || file != null : title.trim().length > 0
  const pending = create.isPending || save.isPending || uploading

  function fileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result)
        resolve(result.slice(result.indexOf(',') + 1))
      }
      reader.onerror = () => reject(new Error('Could not read the file'))
      reader.readAsDataURL(f)
    })
  }

  async function onSave() {
    if (!valid) return
    try {
      if (isNew) {
        const created = await create.mutateAsync({
          url: url.trim() || null,
          kind: detected,
          title: title.trim() || null, // server falls back to the hostname
          notes: notes.trim() || null,
          tags: tags.trim() || null,
        })
        if (file) {
          setUploading(true)
          await upload.mutateAsync({ id: created.id, fileName: file.name, mime: file.type || 'application/octet-stream', dataBase64: await fileToBase64(file) })
          setUploading(false)
        }
      } else {
        await save.mutateAsync({
          id: item.id,
          url: url.trim() || null,
          kind,
          title: title.trim(),
          notes: notes.trim() || null,
          tags: tags.trim() || null,
          status,
        })
      }
      onClose()
    } catch {
      setUploading(false)
      // toast already surfaced by the hook
    }
  }

  const fileOk = file ? isUploadableMime(file.type) : false
  const kindSelected = (k: string) => (isNew ? (kind === 'auto' ? false : kind === k) : kind === k)

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Link" hint={previewId ? 'YouTube detected — plays right inside Saarthi' : undefined}>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=… or an article" inputMode="url" />
      </Field>

      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {isNew && (
            <button
              type="button"
              onClick={() => setKind('auto')}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-all active:scale-95',
                kind === 'auto' ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              ✨ Auto{kind === 'auto' && <span className="text-xs opacity-80"> → {detected}</span>}
            </button>
          )}
          {CONTENT_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-all active:scale-95',
                kindSelected(k.key) ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              <span aria-hidden>{k.emoji}</span> {k.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Title" hint="Optional for links — the hostname fills in">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. That talk that changed everything" />
      </Field>

      {!isNew && (
        <Field label="Where is it?">
          <div className="flex gap-2">
            {STATUS_CHIPS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  'h-9 flex-1 rounded-full border text-sm font-medium capitalize transition-all active:scale-95',
                  status === s ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
                )}
              >
                {s === 'inbox' ? 'In queue' : s === 'active' ? 'In progress' : 'Done'}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Why save it" hint="Optional — the takeaway you want to remember">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Key idea, timestamp, who sent it…" className="min-h-16 rounded-xl" />
      </Field>

      <Field label="Tags" hint="Comma-separated — interview, mindset, system-design">
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tag1, tag2" />
      </Field>

      {isNew && (
        <Field label="Or attach a file" hint="Video, audio, PDF or image · up to 15 MB">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground transition-colors hover:bg-accent">
            <Paperclip className="size-4 shrink-0" />
            <span className="truncate">{file ? file.name : 'Choose a file…'}</span>
            <input
              type="file"
              className="hidden"
              accept="video/*,audio/*,application/pdf,image/*"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
              }}
            />
          </label>
          {file && !fileOk && <p className="text-xs text-expense">That file type isn&apos;t supported — pick video, audio, PDF or an image.</p>}
        </Field>
      )}

      <Button onClick={onSave} disabled={!valid || pending || (file != null && !fileOk)} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {pending ? 'Saving…' : isNew ? 'Save to library' : 'Save changes'}
      </Button>

      {!isNew && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Delete "${item.title}"?`)) del.mutate(item.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          <Trash2 className="mr-1 size-4" /> Delete item
        </Button>
      )}
    </div>
  )
}

function isUploadableMime(mime: string): boolean {
  return mime.startsWith('video/') || mime.startsWith('audio/') || mime === 'application/pdf' || mime.startsWith('image/')
}

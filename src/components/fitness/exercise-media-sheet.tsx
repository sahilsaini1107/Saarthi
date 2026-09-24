'use client'

// Exercise media sheet (Phase 19) — attach a YouTube form video or a photo
// to an exercise. Media lives on the exercise itself, so every plan and
// session using that exercise shows it.

import { useRef, useState } from 'react'
import { Image as ImageIcon, Trash2, Youtube } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Field } from '@/components/ui/saarthi'
import { useClearExerciseMedia, useSetExerciseMedia } from '@/hooks/queries'
import { formatBytes, youtubeId } from '@/lib/content'
import { compressImageFile } from '@/lib/image-compress'
import { cn } from '@/lib/utils'

export interface ExerciseMediaState {
  youtubeId: string | null
  hasPhoto: boolean
}

/**
 * Refused before we try to decode it — not an upload limit (compression
 * handles that), just a guard against a pathological file eating memory.
 */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024

interface PickedPhoto {
  fileName: string
  mime: string
  base64: string
  bytes: number
  originalBytes: number
}

export function ExerciseMediaSheet({
  open,
  onOpenChange,
  exerciseId,
  exerciseName,
  media,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  exerciseId: string
  exerciseName: string
  media: ExerciseMediaState | null
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Media — {exerciseName}</DrawerTitle>
          <DrawerDescription>Attach a form-check photo or a YouTube demo. It plays right here, inside Saarthi.</DrawerDescription>
        </DrawerHeader>
        {open && <MediaForm key={exerciseId} exerciseId={exerciseId} media={media} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function MediaForm({ exerciseId, media, onClose }: { exerciseId: string; media: ExerciseMediaState | null; onClose: () => void }) {
  const setMedia = useSetExerciseMedia({ success: 'Media saved' })
  const clear = useClearExerciseMedia({ success: 'Media removed' })
  const [url, setUrl] = useState('')
  const [photo, setPhoto] = useState<PickedPhoto | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const detected = url.trim() ? youtubeId(url) : null

  async function saveYouTube() {
    setBusy(true)
    try {
      await setMedia.mutateAsync({ exerciseId, youtubeUrl: url.trim() })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  /**
   * Compress on pick, not on save: the size line below then reflects what will
   * actually be sent, and a bad file is caught before the Attach button is hit.
   */
  async function onPickPhoto(f: File | null) {
    setPhotoError(null)
    setPhoto(null)
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setPhotoError('That file is not an image.')
      return
    }
    if (f.size > MAX_SOURCE_BYTES) {
      setPhotoError(`That file is ${formatBytes(f.size)} — too large to open.`)
      return
    }
    setCompressing(true)
    try {
      const result = await compressImageFile(f)
      setPhoto({
        fileName: result.fileName,
        mime: result.mime,
        base64: result.base64,
        bytes: result.bytes,
        originalBytes: result.originalBytes,
      })
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'That photo could not be processed.')
    } finally {
      setCompressing(false)
    }
  }

  async function savePhoto() {
    if (!photo) return
    setBusy(true)
    try {
      await setMedia.mutateAsync({
        exerciseId,
        photo: { fileName: photo.fileName, mime: photo.mime, dataBase64: photo.base64 },
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between rounded-xl bg-muted p-3 text-xs">
        <span className="text-muted-foreground">
          {media?.youtubeId || media?.hasPhoto
            ? `Attached: ${media?.youtubeId ? 'YouTube video' : ''}${media?.youtubeId && media?.hasPhoto ? ' + ' : ''}${media?.hasPhoto ? 'photo' : ''}`
            : 'No media attached yet.'}
        </span>
        {(media?.youtubeId || media?.hasPhoto) && (
          <button
            type="button"
            onClick={() => {
              if (confirm('Remove all media from this exercise?')) clear.mutate(exerciseId, { onSuccess: onClose })
            }}
            className="flex items-center gap-1 font-medium text-expense"
          >
            <Trash2 className="size-3.5" /> Remove all
          </button>
        )}
      </div>

      <Field label="YouTube demo video" hint={detected ? '✓ Video detected — plays in-app' : 'Paste a watch / youtu.be / shorts link'}>
        <div className="flex gap-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" inputMode="url" />
          <Button size="sm" className="h-9 shrink-0 rounded-full" disabled={!detected || busy} onClick={saveYouTube}>
            <Youtube className="mr-1 size-4" /> Attach
          </Button>
        </div>
      </Field>

      <Field label="Form-check photo" hint="Resized on your device before upload">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              'flex h-9 flex-1 items-center gap-2 rounded-full border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent',
              photoError && 'border-expense text-expense',
            )}
          >
            <ImageIcon className="size-4 shrink-0" />
            <span className="truncate">
              {compressing ? 'Preparing…' : photo ? photo.fileName : 'Choose a photo…'}
            </span>
          </button>
          <Button
            size="sm"
            className="h-9 shrink-0 rounded-full"
            disabled={!photo || busy || compressing}
            onClick={savePhoto}
          >
            Attach
          </Button>
        </div>
        {photoError && <p className="text-xs text-expense">{photoError}</p>}
        {photo && !photoError && (
          <p className="text-[11px] text-muted-foreground">
            {photo.originalBytes > photo.bytes
              ? `Compressed ${formatBytes(photo.originalBytes)} → ${formatBytes(photo.bytes)}`
              : `Ready · ${formatBytes(photo.bytes)}`}
          </p>
        )}
      </Field>
    </div>
  )
}

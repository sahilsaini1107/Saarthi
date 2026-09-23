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
import { youtubeId } from '@/lib/content'
import { cn } from '@/lib/utils'

export interface ExerciseMediaState {
  youtubeId: string | null
  hasPhoto: boolean
}

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
  const [photo, setPhoto] = useState<File | null>(null)
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

  async function savePhoto() {
    if (!photo) return
    setBusy(true)
    try {
      await setMedia.mutateAsync({
        exerciseId,
        photo: { fileName: photo.name, mime: photo.type || 'image/jpeg', dataBase64: await fileToBase64(photo) },
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const photoOk = photo ? photo.type.startsWith('image/') && photo.size <= 5 * 1024 * 1024 : false

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

      <Field label="Form-check photo" hint="JPEG/PNG/WebP · up to 5 MB">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              'flex h-9 flex-1 items-center gap-2 rounded-full border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent',
              photo && !photoOk && 'border-expense text-expense',
            )}
          >
            <ImageIcon className="size-4 shrink-0" />
            <span className="truncate">{photo ? photo.name : 'Choose a photo…'}</span>
          </button>
          <Button size="sm" className="h-9 shrink-0 rounded-full" disabled={!photoOk || busy} onClick={savePhoto}>
            Attach
          </Button>
        </div>
        {photo && !photoOk && <p className="text-xs text-expense">Pick an image file up to 5 MB.</p>}
      </Field>
    </div>
  )
}

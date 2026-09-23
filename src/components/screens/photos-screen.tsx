'use client'

// Progress photos (Phase 24) — a dated gallery and a side-by-side compare.
//
// Photos are the honest record the scale can't give you: recomposition moves
// the mirror long before it moves the number. Each shot snapshots the weight
// from the nearest weigh-in on or before that day, so the comparison always
// carries the right figure even if a reading is corrected later.

import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, Trash2, X } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip, EmptyState, ErrorCard, Field, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useAddProgressPhoto, useDeleteProgressPhoto, useProgressPhotos } from '@/hooks/queries'
import { formatMilli } from '@/lib/body'
import { formatDayLabel, todayISO } from '@/lib/date'
import type { ProgressPhotoDayDTO, ProgressPhotoDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

const POSE_LABELS: Record<string, string> = { front: 'Front', side: 'Side', back: 'Back', other: 'Other' }

export function PhotosScreen() {
  const { user, navigate } = useUi()
  const today = todayISO(user.timezone)
  const photos = useProgressPhotos()
  const [tab, setTab] = useState<'gallery' | 'compare'>('gallery')
  const [uploadOpen, setUploadOpen] = useState(false)

  const days = photos.data?.days ?? []

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate('/growth/body')}
        className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Body
      </button>
      <header className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Progress photos</h1>
          <p className="text-sm text-muted-foreground">What the scale can&apos;t show you.</p>
        </div>
        <Button size="sm" className="h-9 shrink-0 rounded-full" onClick={() => setUploadOpen(true)}>
          <Camera className="mr-1 size-4" /> Add
        </Button>
      </header>

      {days.length > 1 && (
        <div className="flex gap-2">
          <Chip active={tab === 'gallery'} emoji="🖼️" label="Gallery" onClick={() => setTab('gallery')} />
          <Chip active={tab === 'compare'} emoji="↔️" label="Compare" onClick={() => setTab('compare')} />
        </div>
      )}

      {photos.isLoading ? (
        <SkeletonRow />
      ) : photos.isError ? (
        <ErrorCard message={(photos.error as Error).message} onRetry={() => photos.refetch()} />
      ) : days.length === 0 ? (
        <EmptyState
          emoji="📸"
          title="No photos yet"
          body="Same spot, same light, same time of day — once a fortnight is plenty. Recomposition shows up in the mirror long before the scale moves."
          action={
            <Button size="sm" className="mt-2 rounded-full" onClick={() => setUploadOpen(true)}>
              <Camera className="mr-1 size-4" /> Take the first one
            </Button>
          }
        />
      ) : tab === 'compare' && days.length > 1 ? (
        <CompareTab days={days} />
      ) : (
        <GalleryTab days={days} />
      )}

      <p className="px-1 text-[11px] text-muted-foreground">
        Photos are stored inside your own Saarthi database and served only to your signed-in session — never cached,
        never uploaded anywhere else.
      </p>

      <UploadSheet open={uploadOpen} onOpenChange={setUploadOpen} today={today} />
    </div>
  )
}

/* ---------- gallery ---------- */

function GalleryTab({ days }: { days: ProgressPhotoDayDTO[] }) {
  return (
    <div className="flex flex-col gap-4">
      {days.map((d) => (
        <section key={d.date}>
          <SectionHeader
            title={`${formatDayLabel(d.date)}${d.weightG != null ? ` · ${formatMilli(d.weightG)} kg` : ''}`}
          />
          <div className="grid grid-cols-3 gap-2">
            {d.photos.map((p) => (
              <PhotoTile key={p.id} photo={p} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function PhotoTile({ photo }: { photo: ProgressPhotoDTO }) {
  const del = useDeleteProgressPhoto({ success: 'Photo deleted' })
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card">
      <img src={`/api/photos/${photo.id}/file`} alt={`${POSE_LABELS[photo.pose] ?? photo.pose} on ${photo.date}`} className="aspect-[3/4] w-full object-cover" />
      <span className="absolute left-1 top-1 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-bold uppercase">
        {POSE_LABELS[photo.pose] ?? photo.pose}
      </span>
      <button
        type="button"
        aria-label={confirming ? 'Confirm delete photo' : 'Delete photo'}
        disabled={del.isPending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true)
            return
          }
          del.mutate(photo.id, { onSettled: () => setConfirming(false) })
        }}
        className={cn(
          'absolute right-1 top-1 rounded-full bg-background/80 p-1 text-muted-foreground hover:text-expense',
          confirming && 'bg-expense text-white',
        )}
      >
        <Trash2 className="size-3" />
      </button>
      {photo.note && <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">{photo.note}</p>}
    </div>
  )
}

/* ---------- compare ---------- */

function CompareTab({ days }: { days: ProgressPhotoDayDTO[] }) {
  // days arrive newest-first; default to oldest vs newest, the comparison
  // people actually want to see
  const [leftDate, setLeftDate] = useState(days[days.length - 1].date)
  const [rightDate, setRightDate] = useState(days[0].date)
  const [pose, setPose] = useState('front')

  const left = days.find((d) => d.date === leftDate)
  const right = days.find((d) => d.date === rightDate)

  // only offer poses that exist on BOTH sides — a compare with one empty half
  // is not a comparison
  const shared = useMemo(() => {
    const l = new Set(left?.photos.map((p) => p.pose) ?? [])
    return (right?.photos ?? []).map((p) => p.pose).filter((p) => l.has(p))
  }, [left, right])

  const activePose = shared.includes(pose) ? pose : shared[0]
  const leftPhoto = left?.photos.find((p) => p.pose === activePose)
  const rightPhoto = right?.photos.find((p) => p.pose === activePose)

  const deltaG =
    left?.weightG != null && right?.weightG != null ? right.weightG - left.weightG : null
  const daysApart = Math.round(
    (Date.parse(`${rightDate}T00:00:00Z`) - Date.parse(`${leftDate}T00:00:00Z`)) / 86_400_000,
  )

  return (
    <div className="flex flex-col gap-3">
      {shared.length > 1 && (
        <div className="flex gap-1.5">
          {shared.map((p) => (
            <Chip
              key={p}
              active={activePose === p}
              label={POSE_LABELS[p] ?? p}
              onClick={() => setPose(p)}
              className="h-8 text-xs"
            />
          ))}
        </div>
      )}

      {shared.length === 0 ? (
        <EmptyState compact emoji="↔️" title="No matching pose" body="Those two days don't share a pose to compare." />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <ComparePane label="Before" photo={leftPhoto} weightG={left?.weightG ?? null} date={leftDate} />
          <ComparePane label="After" photo={rightPhoto} weightG={right?.weightG ?? null} date={rightDate} />
        </div>
      )}

      <section className="rounded-2xl border bg-card p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">
            {Math.abs(daysApart)} day{Math.abs(daysApart) === 1 ? '' : 's'} apart
          </span>
          {deltaG != null && (
            <span className={cn('font-semibold tabular-nums', deltaG > 0 ? 'text-income' : deltaG < 0 ? 'text-warn' : '')}>
              {deltaG > 0 ? '+' : ''}
              {formatMilli(deltaG)} kg
            </span>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <DayPicker label="Before" value={leftDate} days={days} onChange={setLeftDate} />
          <DayPicker label="After" value={rightDate} days={days} onChange={setRightDate} />
        </div>
      </section>
    </div>
  )
}

function ComparePane({
  label,
  photo,
  weightG,
  date,
}: {
  label: string
  photo: ProgressPhotoDTO | undefined
  weightG: number | null
  date: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {photo ? (
        <img src={`/api/photos/${photo.id}/file`} alt={`${label} — ${date}`} className="aspect-[3/4] w-full object-cover" />
      ) : (
        <div className="flex aspect-[3/4] items-center justify-center bg-muted text-xs text-muted-foreground">
          no photo
        </div>
      )}
      <div className="px-2 py-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xs font-semibold">{formatDayLabel(date)}</p>
        {weightG != null && <p className="text-[11px] tabular-nums text-muted-foreground">{formatMilli(weightG)} kg</p>}
      </div>
    </div>
  )
}

function DayPicker({
  label,
  value,
  days,
  onChange,
}: {
  label: string
  value: string
  days: ProgressPhotoDayDTO[]
  onChange: (d: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-xl border bg-card px-2 text-xs"
      >
        {days.map((d) => (
          <option key={d.date} value={d.date}>
            {formatDayLabel(d.date)}
            {d.weightG != null ? ` · ${formatMilli(d.weightG)} kg` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ---------- upload ---------- */

function UploadSheet({ open, onOpenChange, today }: { open: boolean; onOpenChange: (o: boolean) => void; today: string }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Add a progress photo</DrawerTitle>
          <DrawerDescription>
            Same spot, same light, same time of day — consistency is what makes the comparison honest.
          </DrawerDescription>
        </DrawerHeader>
        {open && <UploadForm today={today} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function UploadForm({ today, onClose }: { today: string; onClose: () => void }) {
  const add = useAddProgressPhoto({ success: 'Photo saved' })
  const fileRef = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState(today)
  const [pose, setPose] = useState('front')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<{ name: string; mime: string; base64: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    if (!f.type.startsWith('image/')) {
      setError('That file is not an image.')
      return
    }
    if (f.size > 8 * 1024 * 1024) {
      setError('That photo is larger than 8 MB — try a smaller one.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setPreview(dataUrl)
      setFile({ name: f.name, mime: f.type, base64: dataUrl.split(',')[1] ?? '' })
    }
    reader.readAsDataURL(f)
  }

  function submit() {
    if (!file) return
    add.mutate(
      { date, pose, fileName: file.name, mime: file.mime, dataBase64: file.base64, note: note.trim() || null },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="flex max-h-[72vh] flex-col gap-3 overflow-y-auto">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex aspect-[3/4] max-h-64 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-card"
      >
        {preview ? (
            <img src={preview} alt="Preview" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
            <Camera className="size-6" />
            Choose a photo
          </span>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />

      {error && <p className="rounded-xl bg-expense/10 px-3 py-2 text-[11px] text-expense">{error}</p>}
      {preview && (
        <button
          type="button"
          onClick={() => {
            setPreview(null)
            setFile(null)
            if (fileRef.current) fileRef.current.value = ''
          }}
          className="self-start text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          <X className="mr-0.5 inline size-3" /> clear photo
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl" />
        </Field>
        <Field label="Pose">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(POSE_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPose(key)}
                className={cn(
                  'h-9 flex-1 rounded-xl border px-2 text-xs font-medium transition-all active:scale-95',
                  pose === key ? 'border-primary bg-primary/10' : 'bg-card text-muted-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Note (optional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Week 4 · morning, fasted" className="h-11 rounded-xl" />
      </Field>

      <Button disabled={!file || add.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold" onClick={submit}>
        {add.isPending ? 'Saving…' : 'Save photo'}
      </Button>
      <p className="pb-2 text-center text-[11px] text-muted-foreground">
        One photo per pose per day — re-shooting the same pose replaces it. Your weight on that day is attached
        automatically.
      </p>
    </div>
  )
}

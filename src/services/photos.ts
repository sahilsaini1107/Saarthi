// Progress photos (Phase 24). User-scoped throughout; bytes live in SQLite
// exactly like Exercise.photoData — this app has no media folder, and these are
// the most private images it holds.
//
// Decision #82 — the weight is SNAPSHOTTED onto the photo at upload time, from
// the nearest weigh-in on or before that date. A comparison view that had to
// guess which weigh-in a photo belonged to would drift as soon as a reading
// was corrected or deleted.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { todayISO, toUTC } from '@/lib/date'
import type { ProgressPhotoDTO, ProgressPhotosPayloadDTO } from '@/lib/types'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_PHOTO_BYTES = 8 * 1024 * 1024 // 8 MB — a phone photo, not a RAW file

export const PHOTO_POSES = ['front', 'side', 'back', 'other'] as const
export type PhotoPose = (typeof PHOTO_POSES)[number]

export function isPose(s: string): s is PhotoPose {
  return (PHOTO_POSES as readonly string[]).includes(s)
}

export interface PhotoInput {
  date: string
  pose?: string
  fileName?: string
  mime: string
  dataBase64: string
  note?: string | null
}

function shape(p: {
  id: string
  date: Date
  pose: string
  photoMime: string
  photoName: string | null
  weightG: number | null
  note: string | null
  createdAt: Date
}): ProgressPhotoDTO {
  return {
    id: p.id,
    date: p.date.toISOString().slice(0, 10),
    pose: p.pose,
    mime: p.photoMime,
    fileName: p.photoName,
    weightG: p.weightG,
    note: p.note,
    createdAt: p.createdAt.toISOString(),
  }
}

/** Metadata only — the bytes are served separately by /api/photos/:id/file. */
const META_SELECT = {
  id: true,
  date: true,
  pose: true,
  photoMime: true,
  photoName: true,
  weightG: true,
  note: true,
  createdAt: true,
} as const

export async function listPhotos(userId: string): Promise<ProgressPhotosPayloadDTO> {
  const rows = await db.progressPhoto.findMany({
    where: { userId },
    orderBy: [{ date: 'desc' }, { pose: 'asc' }],
    select: META_SELECT,
  })
  const photos = rows.map(shape)
  // group by day so the gallery and the before/after picker share one shape
  const byDate = new Map<string, ProgressPhotoDTO[]>()
  for (const p of photos) {
    const list = byDate.get(p.date) ?? []
    list.push(p)
    byDate.set(p.date, list)
  }
  return {
    photos,
    days: [...byDate.entries()].map(([date, items]) => ({
      date,
      photos: items,
      weightG: items.find((i) => i.weightG != null)?.weightG ?? null,
    })),
    poses: [...PHOTO_POSES],
  }
}

export async function addPhoto(userId: string, input: PhotoInput, tz: string): Promise<ProgressPhotosPayloadDTO> {
  const today = todayISO(tz)
  if (!ISO_RE.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (input.date > today) throw new HttpError('Cannot add a photo for a future day', 422)
  const pose = input.pose ?? 'front'
  if (!isPose(pose)) throw new HttpError('Pose must be front, side, back or other', 422)
  if (!input.mime.startsWith('image/')) throw new HttpError('Only image files are supported', 415)
  if (input.note != null && input.note.length > 300) throw new HttpError('Note must be 300 characters or fewer', 422)

  const buf = Buffer.from(input.dataBase64, 'base64')
  if (buf.length === 0) throw new HttpError('Photo is empty', 422)
  if (buf.length > MAX_PHOTO_BYTES) throw new HttpError('Photo is larger than 8 MB', 413)

  // nearest weigh-in ON or BEFORE the photo's date — never a later one, which
  // would attribute a weight the body did not have when the photo was taken
  const weigh = await db.bodyMetric.findFirst({
    where: { userId, kind: 'weight', date: { lte: toUTC(input.date) } },
    orderBy: { date: 'desc' },
    select: { valueMilli: true },
  })

  await db.progressPhoto.upsert({
    where: { userId_date_pose: { userId, date: toUTC(input.date), pose } },
    create: {
      userId,
      date: toUTC(input.date),
      pose,
      photoData: buf,
      photoMime: input.mime,
      photoName: input.fileName?.slice(0, 200) ?? null,
      weightG: weigh?.valueMilli ?? null,
      note: input.note?.trim() || null,
    },
    update: {
      photoData: buf,
      photoMime: input.mime,
      photoName: input.fileName?.slice(0, 200) ?? null,
      weightG: weigh?.valueMilli ?? null,
      note: input.note?.trim() || null,
    },
  })
  return listPhotos(userId)
}

export async function getPhotoFile(
  userId: string,
  photoId: string,
): Promise<{ fileName: string; mime: string; data: Uint8Array }> {
  const row = await db.progressPhoto.findFirst({
    where: { id: photoId, userId },
    select: { photoData: true, photoMime: true, photoName: true },
  })
  if (!row) throw new HttpError('Photo not found', 404)
  return {
    fileName: row.photoName ?? 'progress',
    mime: row.photoMime,
    data: new Uint8Array(Buffer.from(row.photoData as Buffer)),
  }
}

export async function deletePhoto(userId: string, photoId: string): Promise<ProgressPhotosPayloadDTO> {
  const existing = await db.progressPhoto.findFirst({ where: { id: photoId, userId }, select: { id: true } })
  if (!existing) throw new HttpError('Photo not found', 404)
  await db.progressPhoto.delete({ where: { id: photoId } })
  return listPhotos(userId)
}

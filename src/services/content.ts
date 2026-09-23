// Content Library service (Phase 18): CRUD + file blobs + reader fetch.
// Every query is user-scoped (RLS-equivalent). All URL/YouTube/extraction/stat
// math is pure in lib/content.ts — this layer fetches, validates and shapes.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { isoDayUTC, todayISO } from '@/lib/date'
import {
  contentKindMeta,
  contentStats,
  CONTENT_STATUS_META,
  defaultTitleFor,
  extractArticle,
  fileView,
  isAcceptedUploadMime,
  isContentKind,
  isContentStatus,
  isHttpUrl,
  isPrivateHost,
  MIN_ARTICLE_CHARS,
  youtubeId,
  type ContentLike,
} from '@/lib/content'
import { parseTags } from '@/lib/reading'
import type { ContentItemDTO } from '@/lib/types'

const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15 MB — same cap as books (Decision #57)
const MAX_FETCH_BYTES = 3 * 1024 * 1024 // HTML read cap for the reader fetch
const FETCH_TIMEOUT_MS = 10_000

export interface ContentInput {
  title?: string | null
  kind?: string
  url?: string | null
  notes?: string | null
  tags?: string | null
  status?: string
  favorite?: boolean
}

type ContentRow = {
  id: string
  title: string
  kind: string
  url: string | null
  notes: string | null
  tags: string | null
  status: string
  favorite: boolean
  fileName: string | null
  fileMime: string | null
  fileSize: number | null
  readerTitle: string | null
  readerFetchedAt: Date | null
  consumedAt: Date | null
  createdAt: Date
  fileData?: unknown
}

function validate(input: ContentInput & { title: string }) {
  if (!input.title.trim()) throw new HttpError('Title is required', 422)
  if (input.title.trim().length > 200) throw new HttpError('Title must be 200 characters or fewer', 422)
  if (input.url != null && input.url.length > 1000) throw new HttpError('URL must be 1000 characters or fewer', 422)
  if (input.url != null && input.url !== '' && !isHttpUrl(input.url)) throw new HttpError('URL must be a valid http(s) link', 422)
  if (input.notes != null && input.notes.length > 1000) throw new HttpError('Notes must be 1000 characters or fewer', 422)
  if (input.tags != null && input.tags.length > 200) throw new HttpError('Tags must be 200 characters or fewer', 422)
  if (input.kind != null && !isContentKind(input.kind)) throw new HttpError('Unknown content kind', 422)
  if (input.status != null && !isContentStatus(input.status)) throw new HttpError('Unknown content status', 422)
  if (input.kind === 'video' && input.url) {
    if (!youtubeId(input.url)) throw new HttpError('Video kind needs a YouTube link (watch, youtu.be, shorts, embed…)', 422)
  }
}

/** kind auto-detection when the caller doesn't pick one: YouTube → video, other URL → article. */
export function detectKind(url: string | null | undefined, hasFile: boolean): string {
  if (hasFile) return 'file'
  if (url && youtubeId(url)) return 'video'
  if (url) return 'article'
  return 'link'
}

function shape(row: ContentRow, today: string): ContentItemDTO {
  const vid = row.url ? youtubeId(row.url) : null
  const addedOn = isoDayUTC(row.createdAt)
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    kindLabel: contentKindMeta(row.kind).label,
    kindEmoji: contentKindMeta(row.kind).emoji,
    url: row.url,
    // exposed for any kind whose URL parses — a "link" pasted as YouTube can still embed
    youtubeId: vid,
    notes: row.notes,
    tags: parseTags(row.tags),
    status: row.status,
    statusLabel: CONTENT_STATUS_META[row.status as keyof typeof CONTENT_STATUS_META]?.label ?? row.status,
    favorite: row.favorite,
    hasFile: row.fileMime != null,
    fileName: row.fileName,
    fileMime: row.fileMime,
    fileSize: row.fileSize,
    fileView: row.fileMime ? fileView(row.fileMime) : null,
    hasReader: row.readerFetchedAt != null,
    readerTitle: row.readerTitle,
    readerFetchedAt: row.readerFetchedAt ? row.readerFetchedAt.toISOString() : null,
    readerFetchedOn: row.readerFetchedAt ? isoDayUTC(row.readerFetchedAt) : null,
    consumedAt: row.consumedAt ? row.consumedAt.toISOString() : null,
    addedOn,
    ageDays: Math.max(0, Math.round((Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${addedOn}T00:00:00.000Z`)) / 86_400_000)),
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listContent(userId: string, tz: string, opts?: { includeArchived?: boolean }): Promise<ContentItemDTO[]> {
  const rows = await db.contentItem.findMany({
    where: { userId, ...(opts?.includeArchived ? {} : { status: { not: 'archived' } }) },
    orderBy: { createdAt: 'desc' },
  })
  const today = todayISO(tz)
  const items = rows.map((r) => shape(r, today))
  // archived sink to the end, favorites first within each group
  return items.sort(
    (a, b) =>
      Number(a.status === 'archived') - Number(b.status === 'archived') ||
      Number(b.favorite) - Number(a.favorite) ||
      b.createdAt.localeCompare(a.createdAt),
  )
}

export async function createContent(userId: string, input: ContentInput, tz: string): Promise<ContentItemDTO> {
  const url = input.url?.trim() || null
  const hasFile = false
  const kind = input.kind ?? detectKind(url, hasFile)
  const title = (input.title?.trim() || (url ? defaultTitleFor(url) : '')).trim()
  validate({ ...input, title, url, kind })
  if (!title) throw new HttpError('Title is required', 422)
  const row = await db.contentItem.create({
    data: {
      userId,
      title,
      kind,
      url,
      notes: input.notes?.trim() || null,
      tags: input.tags?.trim() || null,
      status: input.status ?? 'inbox',
      favorite: input.favorite ?? false,
    },
  })
  return shape(row, todayISO(tz))
}

export async function updateContent(userId: string, id: string, input: ContentInput, tz: string): Promise<ContentItemDTO> {
  const existing = await db.contentItem.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Content not found', 404)
  const url = input.url !== undefined ? input.url?.trim() || null : existing.url
  const merged = {
    title: (input.title ?? existing.title).trim(),
    kind: input.kind ?? existing.kind,
    url,
    notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
    tags: input.tags !== undefined ? input.tags?.trim() || null : existing.tags,
    status: input.status ?? existing.status,
    favorite: input.favorite ?? existing.favorite,
  }
  validate({ ...merged, title: merged.title })
  // changing the URL invalidates a cached reader view of the old URL
  const urlChanged = url !== existing.url
  const row = await db.contentItem.update({
    where: { id },
    data: {
      title: merged.title,
      kind: merged.kind,
      url: merged.url,
      notes: merged.notes,
      tags: merged.tags,
      status: merged.status,
      favorite: merged.favorite,
      ...(merged.status === 'done' && existing.status !== 'done' ? { consumedAt: new Date() } : {}),
      ...(merged.status !== 'done' && existing.status === 'done' ? { consumedAt: null } : {}),
      ...(urlChanged ? { readerText: null, readerTitle: null, readerFetchedAt: null } : {}),
    },
  })
  return shape(row, todayISO(tz))
}

export async function deleteContent(userId: string, id: string): Promise<void> {
  const existing = await db.contentItem.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Content not found', 404)
  await db.contentItem.delete({ where: { id } })
}

/* ---------- file blob (books Decision #57 pattern) ---------- */

export async function saveFile(
  userId: string,
  id: string,
  input: { fileName: string; mime: string; dataBase64: string },
  tz: string,
): Promise<ContentItemDTO> {
  const existing = await db.contentItem.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Content not found', 404)
  if (!isAcceptedUploadMime(input.mime)) throw new HttpError('Only video, audio, PDF or image files are supported', 415)
  const data = Buffer.from(input.dataBase64, 'base64')
  if (data.length === 0) throw new HttpError('File is empty', 422)
  if (data.length > MAX_FILE_BYTES) throw new HttpError('File is larger than 15 MB', 413)
  const row = await db.contentItem.update({
    where: { id },
    data: {
      kind: 'file',
      fileData: data,
      fileName: input.fileName,
      fileMime: input.mime,
      fileSize: data.length,
    },
  })
  return shape(row, todayISO(tz))
}

export async function deleteFile(userId: string, id: string, tz: string): Promise<ContentItemDTO> {
  const existing = await db.contentItem.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Content not found', 404)
  const url = existing.url
  const row = await db.contentItem.update({
    where: { id },
    data: { kind: detectKind(url, false), fileData: null, fileName: null, fileMime: null, fileSize: null },
  })
  return shape(row, todayISO(tz))
}

export async function getContentFile(userId: string, id: string): Promise<{ fileName: string; mime: string; data: Uint8Array }> {
  const row = await db.contentItem.findFirst({
    where: { id, userId },
    select: { fileName: true, fileMime: true, fileData: true },
  })
  if (!row || !row.fileData || !row.fileMime) throw new HttpError('File not found', 404)
  return {
    fileName: row.fileName ?? 'file',
    mime: row.fileMime,
    data: new Uint8Array(Buffer.from(row.fileData as Buffer)),
  }
}

/* ---------- reader view (server-side extraction, cached) ---------- */

export interface ReaderPayload {
  id: string
  url: string
  title: string
  text: string
}

export async function fetchReader(userId: string, id: string, opts?: { refresh?: boolean }): Promise<ReaderPayload> {
  const row = await db.contentItem.findFirst({ where: { id, userId } })
  if (!row) throw new HttpError('Content not found', 404)
  if (!row.url) throw new HttpError('This item has no link to fetch', 422)
  const url = row.url
  if (!isHttpUrl(url)) throw new HttpError('URL must be a valid http(s) link', 422)
  if (isPrivateHost(new URL(url).hostname)) throw new HttpError('Private network URLs are not allowed', 422)

  if (!opts?.refresh && row.readerText && row.readerText.length >= MIN_ARTICLE_CHARS) {
    return { id: row.id, url, title: row.readerTitle ?? row.title, text: row.readerText }
  }

  let html: string
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaarthiReader/1.0; +personal-life-os)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    })
    if (!res.ok) throw new HttpError(`The site responded ${res.status} — open the original link instead`, 502)
    const ctype = (res.headers.get('content-type') ?? '').toLowerCase()
    if (!ctype.includes('html') && !ctype.includes('text/plain')) {
      throw new HttpError('That link is not an HTML page — open it externally', 415)
    }
    const raw = await res.text()
    html = raw.slice(0, MAX_FETCH_BYTES)
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError('Could not fetch the page — check the link or open it externally', 502)
  }

  const extracted = extractArticle(html)
  if (extracted.text.length < MIN_ARTICLE_CHARS) {
    throw new HttpError('Could not extract readable text — open the original link instead', 502)
  }
  await db.contentItem.update({
    where: { id },
    data: {
      readerText: extracted.text,
      readerTitle: extracted.title,
      readerFetchedAt: new Date(),
    },
  })
  return { id: row.id, url, title: extracted.title ?? row.title, text: extracted.text }
}

/** Cached text without a network round-trip (reader screen re-open). */
export async function getCachedReader(userId: string, id: string): Promise<ReaderPayload | null> {
  const row = await db.contentItem.findFirst({ where: { id, userId }, select: { id: true, url: true, title: true, readerText: true, readerTitle: true } })
  if (!row || !row.readerText) return null
  return { id: row.id, url: row.url ?? '', title: row.readerTitle ?? row.title, text: row.readerText }
}

/* ---------- Today snapshot ---------- */

export interface ContentToday {
  total: number
  queue: number
  active: number
  done: number
  addedThisWeek: number
  completionPct: number | null
  oldestUnconsumedDays: number | null
  /** the oldest unconsumed item — the "start here" nudge (null when clear) */
  nextUp: { id: string; title: string; kind: string; kindEmoji: string; ageDays: number } | null
  favorites: number
}

export async function contentForToday(userId: string, tz: string): Promise<ContentToday> {
  const rows = await db.contentItem.findMany({
    where: { userId },
    select: { id: true, title: true, kind: true, status: true, favorite: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const today = todayISO(tz)
  const likes: (ContentLike & { id: string; title: string; kind: string })[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    status: r.status,
    favorite: r.favorite,
    addedOn: isoDayUTC(r.createdAt),
  }))
  const stats = contentStats(likes, today)
  const oldest = likes
    .filter((l) => l.status !== 'archived' && l.status !== 'done')
    .sort((a, b) => a.addedOn.localeCompare(b.addedOn))[0]
  return {
    total: stats.total,
    queue: stats.inbox,
    active: stats.active,
    done: stats.done,
    addedThisWeek: stats.addedThisWeek,
    completionPct: stats.completionPct,
    oldestUnconsumedDays: stats.oldestUnconsumedDays,
    nextUp: oldest
      ? { id: oldest.id, title: oldest.title, kind: oldest.kind, kindEmoji: contentKindMeta(oldest.kind).emoji, ageDays: stats.oldestUnconsumedDays ?? 0 }
      : null,
    favorites: stats.favorites,
  }
}

// Books, Reader & Quotes service (Phase 16): library CRUD, file storage,
// reading sessions, highlights, bookmarks, notes, and the quotes vault.
// Every query is user-scoped (RLS-equivalent). All streak/pace/rotation math
// is pure in lib/reading.ts — this layer only fetches, validates and shapes.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { isoDayUTC, shiftISO, todayISO, toUTC } from '@/lib/date'
import {
  BOOK_FORMAT_META,
  BOOK_STATUS_META,
  isBookFormat,
  isBookStatus,
  isHighlightColor,
  minutesInWindow,
  parseTags,
  pickDailyQuote,
  pagesPace,
  progressPct,
  readingStreak,
  serializeTags,
  etaDays,
  type BookFormat,
  type BookStatus,
} from '@/lib/reading'
import type { BookDTO, BookDetailDTO, HighlightDTO, BookmarkDTO, NoteDTO, QuoteDTO, SessionDTO } from '@/lib/types'

const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15 MB — personal EPUBs/PDFs are 0.5–8 MB
const MAX_POSITION_LEN = 2000 // EPUB CFI strings

/* ---------- validation helpers ---------- */

function requireTitle(title: string | undefined | null): string {
  const t = (title ?? '').trim()
  if (!t) throw new HttpError('Title is required', 422)
  if (t.length > 200) throw new HttpError('Title must be 200 characters or fewer', 422)
  return t
}

function cleanAuthor(author: string | null | undefined): string | null {
  if (author == null) return null
  const a = author.trim()
  if (!a) return null
  if (a.length > 120) throw new HttpError('Author must be 120 characters or fewer', 422)
  return a
}

function cleanTags(tags: string | null | undefined): string | null {
  if (tags == null) return null
  const s = serializeTags(parseTags(tags))
  return s || null
}

function intInRange(v: unknown, label: string, min: number, max: number): number {
  const n = typeof v === 'number' ? Math.round(v) : Number.NaN
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(`${label} must be between ${min} and ${max}`, 422)
  return n
}

function guardFormat(format: string): BookFormat {
  if (!isBookFormat(format)) throw new HttpError('format must be physical | epub | pdf', 422)
  return format
}

function guardStatus(status: string): BookStatus {
  if (!isBookStatus(status)) throw new HttpError('status must be to_read | reading | finished | abandoned', 422)
  return status
}

function guardColor(color: string): string {
  if (!isHighlightColor(color)) throw new HttpError('color must be yellow | green | blue | pink | purple', 422)
  return color
}

/* ---------- shaping ---------- */

interface BookRow {
  id: string
  title: string
  author: string | null
  format: string
  status: string
  totalPages: number
  currentPage: number
  percent: number | null
  fileName: string | null
  fileSize: number | null
  rating: number | null
  takeaway: string | null
  tags: string | null
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function shapeBook(
  b: BookRow,
  stats: {
    minutesTotal: number
    minutes7d: number
    streak: number
    pace: number | null
    eta: number | null
    lastReadAt: string | null
    sessionsCount: number
  },
): BookDTO {
  const format = isBookFormat(b.format) ? b.format : 'physical'
  const status = isBookStatus(b.status) ? b.status : 'to_read'
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    format,
    formatLabel: BOOK_FORMAT_META[format].label,
    formatEmoji: BOOK_FORMAT_META[format].emoji,
    status,
    statusLabel: BOOK_STATUS_META[status].label,
    statusEmoji: BOOK_STATUS_META[status].emoji,
    totalPages: b.totalPages,
    currentPage: b.currentPage,
    percent: b.percent,
    hasFile: b.fileName != null,
    fileName: b.fileName,
    fileSize: b.fileSize,
    rating: b.rating,
    takeaway: b.takeaway,
    tags: parseTags(b.tags),
    startedAt: b.startedAt ? isoDayUTC(b.startedAt) : null,
    finishedAt: b.finishedAt ? isoDayUTC(b.finishedAt) : null,
    createdAt: b.createdAt.toISOString(),
    progressPct: progressPct(format, { currentPage: b.currentPage, totalPages: b.totalPages, percent: b.percent }),
    ...stats,
  }
}

/* ---------- library CRUD ---------- */

export interface BookInput {
  title: string
  author?: string | null
  format?: string
  status?: string
  totalPages?: number
  tags?: string | null
}

export async function createBook(userId: string, input: BookInput, tz: string): Promise<BookDTO> {
  const title = requireTitle(input.title)
  const author = cleanAuthor(input.author)
  const format = guardFormat(input.format ?? 'physical')
  const status = guardStatus(input.status ?? 'to_read')
  const totalPages = intInRange(input.totalPages ?? 0, 'Total pages', 0, 20000)
  const now = new Date()
  const row = await db.book.create({
    data: {
      userId,
      title,
      author,
      format,
      status,
      totalPages,
      tags: cleanTags(input.tags),
      startedAt: status === 'reading' ? now : null,
      finishedAt: status === 'finished' ? now : null,
    },
  })
  return shapeBook(row, { minutesTotal: 0, minutes7d: 0, streak: 0, pace: null, eta: null, lastReadAt: null, sessionsCount: 0 })
}

export async function updateBook(userId: string, id: string, input: Partial<BookInput> & { currentPage?: number; rating?: number | null; takeaway?: string | null; status?: string }, tz: string): Promise<BookDTO> {
  const existing = await db.book.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Book not found', 404)

  const title = input.title !== undefined ? requireTitle(input.title) : existing.title
  const author = input.author !== undefined ? cleanAuthor(input.author) : existing.author
  const format = input.format !== undefined ? guardFormat(input.format) : (isBookFormat(existing.format) ? existing.format : 'physical')
  const status = input.status !== undefined ? guardStatus(input.status) : (isBookStatus(existing.status) ? existing.status : 'to_read')
  const totalPages = input.totalPages !== undefined ? intInRange(input.totalPages, 'Total pages', 0, 20000) : existing.totalPages
  const tags = input.tags !== undefined ? cleanTags(input.tags) : existing.tags

  // current page clamps to the (possibly new) total
  let currentPage = existing.currentPage
  if (input.currentPage !== undefined) {
    currentPage = Math.max(0, Math.round(input.currentPage))
    if (totalPages > 0) currentPage = Math.min(currentPage, totalPages)
  }

  const now = new Date()
  const startedAt = existing.startedAt ?? (status === 'reading' ? now : null)
  const finishedAt = status === 'finished' ? (existing.finishedAt ?? now) : null
  const rating = input.rating !== undefined ? normalizeRatingOrNull(input.rating) : existing.rating
  const takeaway = input.takeaway !== undefined ? cleanTakeaway(input.takeaway) : existing.takeaway

  const row = await db.book.update({
    where: { id },
    data: { title, author, format, status, totalPages, currentPage, tags, startedAt, finishedAt, rating, takeaway },
  })
  const stats = await statsForBook(userId, row, tz)
  return shapeBook(row, stats)
}

function normalizeRatingOrNull(rating: number | null | undefined): number | null {
  if (rating === null || rating === undefined) return null
  const n = Math.round(rating)
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new HttpError('Rating must be 1–5', 422)
  return n
}

function cleanTakeaway(takeaway: string | null | undefined): string | null {
  if (takeaway == null) return null
  const t = takeaway.trim()
  if (!t) return null
  if (t.length > 500) throw new HttpError('Takeaway must be 500 characters or fewer', 422)
  return t
}

/** Unified stats fetch (used by detail/list after writes). */
async function statsForBook(userId: string, b: { id: string; format: string; status: string; totalPages: number; currentPage: number; percent: number | null; startedAt: Date | null }, tz: string) {
  const format = isBookFormat(b.format) ? b.format : 'physical'
  const status = isBookStatus(b.status) ? b.status : 'to_read'
  const today = todayISO(tz)
  const rows = await db.readingSession.findMany({
    where: { userId, bookId: b.id },
    select: { date: true, minutes: true, pages: true },
    orderBy: { date: 'asc' },
  })
  const pure = rows.map((r) => ({ date: isoDayUTC(r.date), minutes: r.minutes, pages: r.pages }))
  const agg = await db.readingSession.aggregate({ where: { userId, bookId: b.id }, _sum: { minutes: true }, _count: true })
  const pace = status === 'reading' ? pagesPace(pure, today, b.startedAt ? isoDayUTC(b.startedAt) : null, 14) : null
  const eta = status === 'reading' && isPageBasedSafe(format) ? etaDays(format, { currentPage: b.currentPage, totalPages: b.totalPages, status }, pace) : null
  const last = pure.reduce<string | null>((acc, s) => (!acc || s.date > acc ? s.date : acc), null)
  return {
    minutesTotal: agg._sum.minutes ?? 0,
    minutes7d: minutesInWindow(pure, shiftISO(today, -6), today, today),
    streak: readingStreak(pure, today),
    pace,
    eta,
    lastReadAt: last,
    sessionsCount: agg._count,
  }
}

function isPageBasedSafe(format: BookFormat): boolean {
  return format === 'physical' || format === 'pdf'
}

export async function deleteBook(userId: string, id: string): Promise<void> {
  const existing = await db.book.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Book not found', 404)
  await db.book.delete({ where: { id } })
}

export async function listBooks(userId: string, tz: string, opts?: { status?: string }): Promise<BookDTO[]> {
  const where: { userId: string; status?: string } = { userId }
  if (opts?.status) where.status = guardStatus(opts.status)
  const rows = await db.book.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
  })
  const out: BookDTO[] = []
  for (const row of rows) out.push(shapeBook(row, await statsForBook(userId, row, tz)))
  return out
}

export async function getBook(userId: string, id: string, tz: string): Promise<BookDetailDTO> {
  const row = await db.book.findFirst({ where: { id, userId } })
  if (!row) throw new HttpError('Book not found', 404)
  const [sessions, highlights, bookmarks, notes] = await Promise.all([
    db.readingSession.findMany({ where: { userId, bookId: id }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 60 }),
    db.highlight.findMany({ where: { userId, bookId: id }, orderBy: { createdAt: 'desc' } }),
    db.bookBookmark.findMany({ where: { userId, bookId: id }, orderBy: { createdAt: 'desc' } }),
    db.bookNote.findMany({ where: { userId, bookId: id }, orderBy: [{ page: 'asc' }, { createdAt: 'desc' }] }),
  ])
  const stats = await statsForBook(userId, row, tz)
  const sessionRows: SessionDTO[] = sessions.map((s) => ({ id: s.id, bookId: id, date: isoDayUTC(s.date), minutes: s.minutes, pages: s.pages }))
  const highlightRows: HighlightDTO[] = highlights.map(shapeHighlight)
  const bookmarkRows: BookmarkDTO[] = bookmarks.map((bm) => ({
    id: bm.id,
    bookId: bm.bookId,
    cfi: bm.cfi,
    page: bm.page,
    label: bm.label,
    createdAt: bm.createdAt.toISOString(),
  }))
  const noteRows: NoteDTO[] = notes.map((n) => ({
    id: n.id,
    bookId: n.bookId,
    page: n.page,
    text: n.text,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }))
  return {
    ...shapeBook(row, stats),
    position: row.position,
    sessions: sessionRows,
    highlights: highlightRows,
    bookmarks: bookmarkRows,
    notes: noteRows,
  }
}

/* ---------- file storage (epub / pdf) ---------- */

const EPUB_MIME = 'application/epub+zip'
const PDF_MIME = 'application/pdf'

export async function saveBookFile(userId: string, id: string, input: { fileName: string; mime: string; dataBase64: string }, tz: string): Promise<BookDTO> {
  const existing = await db.book.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Book not found', 404)
  const format = isBookFormat(existing.format) ? existing.format : 'physical'
  if (format === 'physical') throw new HttpError('Files belong to epub/pdf books', 422)

  const mime = input.mime === EPUB_MIME || input.mime === PDF_MIME ? input.mime : format === 'epub' ? EPUB_MIME : PDF_MIME
  if (format === 'epub' && mime !== EPUB_MIME) throw new HttpError('This book is an EPUB — upload an .epub file', 422)
  if (format === 'pdf' && mime !== PDF_MIME) throw new HttpError('This book is a PDF — upload a .pdf file', 422)
  const fileName = (input.fileName ?? '').trim().slice(0, 200) || (format === 'epub' ? 'book.epub' : 'book.pdf')

  let data: Buffer
  try {
    data = Buffer.from(input.dataBase64, 'base64')
  } catch {
    throw new HttpError('Invalid file payload (base64 expected)', 422)
  }
  if (data.length === 0) throw new HttpError('File is empty', 422)
  if (data.length > MAX_FILE_BYTES) throw new HttpError('File is larger than 15 MB', 413)

  const row = await db.book.update({
    where: { id },
    data: { fileData: new Uint8Array(data), fileName, fileMime: mime, fileSize: data.length },
  })
  return shapeBook(row, await statsForBook(userId, row, tz))
}

export async function getBookFile(userId: string, id: string): Promise<{ fileName: string; mime: string; data: Uint8Array }> {
  const row = await db.book.findFirst({ where: { id, userId }, select: { fileData: true, fileName: true, fileMime: true } })
  if (!row) throw new HttpError('Book not found', 404)
  if (!row.fileData) throw new HttpError('No file uploaded for this book', 404)
  return {
    fileName: row.fileName ?? 'book',
    mime: row.fileMime ?? 'application/octet-stream',
    data: row.fileData,
  }
}

/* ---------- progress & sessions ---------- */

export async function updateProgress(
  userId: string,
  id: string,
  input: { currentPage?: number; percent?: number; position?: string | null },
  tz: string,
): Promise<BookDTO> {
  const existing = await db.book.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Book not found', 404)
  const format = isBookFormat(existing.format) ? existing.format : 'physical'

  const data: { currentPage?: number; percent?: number | null; position?: string | null } = {}
  if (input.currentPage !== undefined) {
    if (format === 'epub') throw new HttpError('EPUBs track progress by percent, not pages', 422)
    let cp = intInRange(input.currentPage, 'Current page', 0, 20000)
    if (existing.totalPages > 0) cp = Math.min(cp, existing.totalPages)
    data.currentPage = cp
  }
  if (input.percent !== undefined) {
    if (format !== 'epub') throw new HttpError('Percent progress applies to EPUBs only', 422)
    const p = Number(input.percent)
    if (!Number.isFinite(p) || p < 0 || p > 100) throw new HttpError('Percent must be 0–100', 422)
    data.percent = Math.round(p * 100) / 100
  }
  if (input.position !== undefined) {
    if (input.position && input.position.length > MAX_POSITION_LEN) throw new HttpError('Position too long', 422)
    data.position = input.position?.trim() || null
  }

  const now = new Date()
  const row = await db.book.update({
    where: { id },
    data: {
      ...data,
      status: existing.status === 'to_read' ? 'reading' : existing.status,
      startedAt: existing.startedAt ?? (existing.status === 'to_read' ? now : null),
    },
  })
  return shapeBook(row, await statsForBook(userId, row, tz))
}

export interface SessionInput {
  date: string
  minutes: number
  pages?: number
  currentPage?: number
}

export async function logSession(userId: string, bookId: string, input: SessionInput, tz: string): Promise<SessionDTO> {
  const book = await db.book.findFirst({ where: { id: bookId, userId } })
  if (!book) throw new HttpError('Book not found', 404)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new HttpError('date must be YYYY-MM-DD', 422)
  if (input.date > todayISO(tz)) throw new HttpError('Cannot log a future day', 422)
  const minutes = intInRange(input.minutes, 'Minutes', 0, 1440)
  const pages = intInRange(input.pages ?? 0, 'Pages', 0, 5000)
  if (minutes === 0 && pages === 0) throw new HttpError('Log some minutes or pages', 422)

  const format = isBookFormat(book.format) ? book.format : 'physical'
  const row = await db.readingSession.create({
    data: { userId, bookId, date: toUTC(input.date), minutes, pages },
  })

  // side effects: status promotion + optional current-page bump
  const now = new Date()
  const data: { status?: string; startedAt?: Date; currentPage?: number } = {}
  if (book.status === 'to_read') {
    data.status = 'reading'
    data.startedAt = book.startedAt ?? now
  }
  if (input.currentPage !== undefined && format !== 'epub') {
    let cp = Math.max(0, Math.round(input.currentPage))
    if (book.totalPages > 0) cp = Math.min(cp, book.totalPages)
    data.currentPage = cp
  }
  if (Object.keys(data).length > 0) await db.book.update({ where: { id: bookId }, data })

  return { id: row.id, bookId, date: isoDayUTC(row.date), minutes, pages }
}

export async function deleteSession(userId: string, bookId: string, sessionId: string): Promise<void> {
  const session = await db.readingSession.findFirst({ where: { id: sessionId, bookId, userId } })
  if (!session) throw new HttpError('Session not found', 404)
  await db.readingSession.delete({ where: { id: sessionId } })
}

/* ---------- highlights / bookmarks / notes ---------- */

function shapeHighlight(h: {
  id: string
  bookId: string
  cfi: string | null
  page: number | null
  text: string
  note: string | null
  color: string
  chapter: string | null
  createdAt: Date
}): HighlightDTO {
  return {
    id: h.id,
    bookId: h.bookId,
    cfi: h.cfi,
    page: h.page,
    text: h.text,
    note: h.note,
    color: isHighlightColor(h.color) ? h.color : 'yellow',
    chapter: h.chapter,
    createdAt: h.createdAt.toISOString(),
  }
}

export interface HighlightInput {
  cfi?: string | null
  page?: number | null
  text: string
  note?: string | null
  color?: string
  chapter?: string | null
}

async function cleanHighlightInput(input: HighlightInput): Promise<{ cfi: string | null; page: number | null; text: string; note: string | null; color: string; chapter: string | null }> {
  const text = (input.text ?? '').trim()
  if (!text) throw new HttpError('Highlighted text is required', 422)
  if (text.length > 2000) throw new HttpError('Highlight must be 2000 characters or fewer', 422)
  if (input.note != null && input.note.trim().length > 1000) throw new HttpError('Note must be 1000 characters or fewer', 422)
  const cfi = input.cfi?.trim() || null
  if (cfi && cfi.length > MAX_POSITION_LEN) throw new HttpError('CFI too long', 422)
  const page = input.page != null ? intInRange(input.page, 'Page', 1, 200000) : null
  if (!cfi && page === null) throw new HttpError('A highlight needs a location (cfi or page)', 422)
  const chapter = input.chapter?.trim().slice(0, 200) || null
  return { cfi, page, text, note: input.note?.trim() || null, color: guardColor(input.color ?? 'yellow'), chapter }
}

export async function addHighlight(userId: string, bookId: string, input: HighlightInput): Promise<HighlightDTO> {
  const book = await db.book.findFirst({ where: { id: bookId, userId } })
  if (!book) throw new HttpError('Book not found', 404)
  const clean = await cleanHighlightInput(input)
  const row = await db.highlight.create({ data: { userId, bookId, ...clean } })
  return shapeHighlight(row)
}

export async function updateHighlight(userId: string, bookId: string, highlightId: string, input: { note?: string | null; color?: string }): Promise<HighlightDTO> {
  const existing = await db.highlight.findFirst({ where: { id: highlightId, bookId, userId } })
  if (!existing) throw new HttpError('Highlight not found', 404)
  const note = input.note !== undefined ? (input.note?.trim() || null) : existing.note
  if (note && note.length > 1000) throw new HttpError('Note must be 1000 characters or fewer', 422)
  const color = input.color !== undefined ? guardColor(input.color) : existing.color
  const row = await db.highlight.update({ where: { id: highlightId }, data: { note, color } })
  return shapeHighlight(row)
}

export async function deleteHighlight(userId: string, bookId: string, highlightId: string): Promise<void> {
  const existing = await db.highlight.findFirst({ where: { id: highlightId, bookId, userId } })
  if (!existing) throw new HttpError('Highlight not found', 404)
  await db.highlight.delete({ where: { id: highlightId } })
}

export async function addBookmark(userId: string, bookId: string, input: { cfi?: string | null; page?: number | null; label?: string | null }): Promise<BookmarkDTO> {
  const book = await db.book.findFirst({ where: { id: bookId, userId } })
  if (!book) throw new HttpError('Book not found', 404)
  const cfi = input.cfi?.trim() || null
  if (cfi && cfi.length > MAX_POSITION_LEN) throw new HttpError('CFI too long', 422)
  const page = input.page != null ? intInRange(input.page, 'Page', 1, 200000) : null
  if (!cfi && page === null) throw new HttpError('A bookmark needs a location (cfi or page)', 422)
  const label = input.label?.trim().slice(0, 80) || null
  const row = await db.bookBookmark.create({ data: { userId, bookId, cfi, page, label } })
  return { id: row.id, bookId, cfi: row.cfi, page: row.page, label: row.label, createdAt: row.createdAt.toISOString() }
}

export async function deleteBookmark(userId: string, bookId: string, bookmarkId: string): Promise<void> {
  const existing = await db.bookBookmark.findFirst({ where: { id: bookmarkId, bookId, userId } })
  if (!existing) throw new HttpError('Bookmark not found', 404)
  await db.bookBookmark.delete({ where: { id: bookmarkId } })
}

export async function addNote(userId: string, bookId: string, input: { page: number; text: string }): Promise<NoteDTO> {
  const book = await db.book.findFirst({ where: { id: bookId, userId } })
  if (!book) throw new HttpError('Book not found', 404)
  const page = intInRange(input.page, 'Page', 1, 200000)
  const text = (input.text ?? '').trim()
  if (!text) throw new HttpError('Note text is required', 422)
  if (text.length > 2000) throw new HttpError('Note must be 2000 characters or fewer', 422)
  const row = await db.bookNote.create({ data: { userId, bookId, page, text } })
  return { id: row.id, bookId, page: row.page, text: row.text, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

export async function updateNote(userId: string, bookId: string, noteId: string, input: { text?: string; page?: number }): Promise<NoteDTO> {
  const existing = await db.bookNote.findFirst({ where: { id: noteId, bookId, userId } })
  if (!existing) throw new HttpError('Note not found', 404)
  const text = input.text !== undefined ? (input.text ?? '').trim() : existing.text
  if (!text) throw new HttpError('Note text is required', 422)
  if (text.length > 2000) throw new HttpError('Note must be 2000 characters or fewer', 422)
  const page = input.page !== undefined ? intInRange(input.page, 'Page', 1, 200000) : existing.page
  const row = await db.bookNote.update({ where: { id: noteId }, data: { text, page } })
  return { id: row.id, bookId, page: row.page, text: row.text, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

export async function deleteNote(userId: string, bookId: string, noteId: string): Promise<void> {
  const existing = await db.bookNote.findFirst({ where: { id: noteId, bookId, userId } })
  if (!existing) throw new HttpError('Note not found', 404)
  await db.bookNote.delete({ where: { id: noteId } })
}

/* ---------- quotes vault ---------- */

export interface QuoteInput {
  text: string
  author?: string | null
  source?: string | null
  bookId?: string | null
  tags?: string | null
  favorite?: boolean
}

function shapeQuote(q: {
  id: string
  text: string
  author: string | null
  source: string | null
  bookId: string | null
  highlightId: string | null
  tags: string | null
  favorite: boolean
  createdAt: Date
}, book?: { title: string; author: string | null } | null): QuoteDTO {
  return {
    id: q.id,
    text: q.text,
    author: q.author,
    source: q.source,
    bookId: q.bookId,
    bookTitle: book?.title ?? null,
    bookAuthor: book?.author ?? null,
    highlightId: q.highlightId,
    tags: parseTags(q.tags),
    favorite: q.favorite,
    createdAt: q.createdAt.toISOString(),
  }
}

export async function listQuotes(userId: string, opts?: { favorite?: boolean; bookId?: string; tag?: string }): Promise<QuoteDTO[]> {
  const where: { userId: string; favorite?: boolean; bookId?: string } = { userId }
  if (opts?.favorite !== undefined) where.favorite = opts.favorite
  if (opts?.bookId) where.bookId = opts.bookId
  const rows = await db.quote.findMany({
    where,
    orderBy: [{ favorite: 'desc' }, { createdAt: 'desc' }],
    include: { book: { select: { title: true, author: true } } },
  })
  let out = rows.map((r) => shapeQuote(r, r.book))
  if (opts?.tag) {
    const tag = opts.tag.toLowerCase()
    out = out.filter((q) => q.tags.some((t) => t.toLowerCase() === tag))
  }
  return out
}

export async function createQuote(userId: string, input: QuoteInput): Promise<QuoteDTO> {
  const text = (input.text ?? '').trim()
  if (!text) throw new HttpError('Quote text is required', 422)
  if (text.length > 1000) throw new HttpError('Quote must be 1000 characters or fewer', 422)
  const author = cleanAuthor(input.author)
  const source = input.source != null ? (input.source.trim() || null) : null
  if (source && source.length > 200) throw new HttpError('Source must be 200 characters or fewer', 422)
  let bookId: string | null = null
  let book: { title: string; author: string | null } | null = null
  if (input.bookId) {
    const b = await db.book.findFirst({ where: { id: input.bookId, userId }, select: { id: true, title: true, author: true } })
    if (!b) throw new HttpError('Book not found', 404)
    bookId = b.id
    book = { title: b.title, author: b.author }
  }
  const row = await db.quote.create({
    data: { userId, text, author, source, bookId, tags: cleanTags(input.tags), favorite: input.favorite ?? false },
  })
  return shapeQuote(row, book)
}

export async function updateQuote(userId: string, id: string, input: Partial<QuoteInput>): Promise<QuoteDTO> {
  const existing = await db.quote.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Quote not found', 404)
  const data: { text?: string; author?: string | null; source?: string | null; tags?: string | null; favorite?: boolean; bookId?: string | null } = {}
  if (input.text !== undefined) {
    const text = input.text.trim()
    if (!text) throw new HttpError('Quote text is required', 422)
    if (text.length > 1000) throw new HttpError('Quote must be 1000 characters or fewer', 422)
    data.text = text
  }
  if (input.author !== undefined) data.author = cleanAuthor(input.author)
  if (input.source !== undefined) {
    const s = input.source?.trim() || null
    if (s && s.length > 200) throw new HttpError('Source must be 200 characters or fewer', 422)
    data.source = s
  }
  if (input.tags !== undefined) data.tags = cleanTags(input.tags)
  if (input.favorite !== undefined) data.favorite = input.favorite
  if (input.bookId !== undefined) {
    if (input.bookId === null) {
      data.bookId = null
    } else {
      const b = await db.book.findFirst({ where: { id: input.bookId, userId }, select: { id: true } })
      if (!b) throw new HttpError('Book not found', 404)
      data.bookId = b.id
    }
  }
  const row = await db.quote.update({
    where: { id },
    data,
    include: { book: { select: { title: true, author: true } } },
  })
  return shapeQuote(row, row.book)
}

export async function deleteQuote(userId: string, id: string): Promise<void> {
  const existing = await db.quote.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Quote not found', 404)
  await db.quote.delete({ where: { id } })
}

/** Born from a highlight: carries text + book provenance into the vault. Idempotent. */
export async function quoteFromHighlight(userId: string, highlightId: string): Promise<{ quote: QuoteDTO; created: boolean }> {
  const highlight = await db.highlight.findFirst({
    where: { id: highlightId, userId },
    include: { book: { select: { id: true, title: true, author: true } } },
  })
  if (!highlight) throw new HttpError('Highlight not found', 404)

  const existing = await db.quote.findUnique({ where: { highlightId }, include: { book: { select: { title: true, author: true } } } })
  if (existing) return { quote: shapeQuote(existing, existing.book), created: false }

  const book = highlight.book
  const row = await db.quote.create({
    data: {
      userId,
      text: highlight.text.slice(0, 1000),
      author: book?.author ?? null,
      source: book?.title ?? null,
      bookId: book?.id ?? null,
      highlightId: highlight.id,
      tags: null,
    },
    include: { book: { select: { title: true, author: true } } },
  })
  return { quote: shapeQuote(row, row.book), created: true }
}

/* ---------- Today payloads ---------- */

/** The book to nudge on Today: the one most recently read (status = reading). */
export async function readingForToday(userId: string, tz: string) {
  const today = todayISO(tz)
  const reading = await db.book.findMany({
    where: { userId, status: 'reading' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  })
  if (reading.length === 0) return null
  // pick the one with the most recent session (fall back to updatedAt)
  const rows = await db.readingSession.findMany({
    where: { userId, bookId: { in: reading.map((b) => b.id) } },
    select: { bookId: true, date: true, minutes: true, pages: true },
  })
  const lastByBook = new Map<string, string>()
  const todayMinutesByBook = new Map<string, number>()
  for (const r of rows) {
    const d = isoDayUTC(r.date)
    if (!lastByBook.has(r.bookId) || d > lastByBook.get(r.bookId)!) lastByBook.set(r.bookId, d)
    if (d === today) todayMinutesByBook.set(r.bookId, (todayMinutesByBook.get(r.bookId) ?? 0) + r.minutes)
  }
  const current = reading.slice().sort((a, b) => (lastByBook.get(b.id) ?? '').localeCompare(lastByBook.get(a.id) ?? ''))[0]
  const format = isBookFormat(current.format) ? current.format : 'physical'
  const status = isBookStatus(current.status) ? current.status : 'reading'
  const bookRows = rows.filter((r) => r.bookId === current.id).map((r) => ({ date: isoDayUTC(r.date), minutes: r.minutes, pages: r.pages }))
  return {
    bookId: current.id,
    title: current.title,
    author: current.author,
    format,
    statusLabel: BOOK_STATUS_META[status].label,
    progressPct: progressPct(format, { currentPage: current.currentPage, totalPages: current.totalPages, percent: current.percent }),
    progressLabel:
      format === 'epub'
        ? current.percent != null
          ? `${Math.round(current.percent)}% read`
          : 'Not started'
        : current.totalPages > 0
          ? `p. ${current.currentPage} of ${current.totalPages}`
          : current.currentPage > 0
            ? `p. ${current.currentPage}`
            : 'Not started',
    minutesToday: todayMinutesByBook.get(current.id) ?? 0,
    minutes7d: minutesInWindow(bookRows, shiftISO(today, -6), today, today),
    streak: readingStreak(bookRows, today),
  }
}

/** Deterministic daily quote for the Today card (null when the vault is empty). */
export async function dailyQuoteForToday(userId: string, tz: string) {
  const quotes = await db.quote.findMany({ where: { userId }, select: { id: true, text: true, author: true, source: true, favorite: true } })
  const pick = pickDailyQuote(
    quotes.map((q) => ({ id: q.id, text: q.text, author: q.author, source: q.source, favorite: q.favorite })),
    todayISO(tz),
  )
  return pick ?? null
}

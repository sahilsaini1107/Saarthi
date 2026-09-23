// Content Library (Phase 18) — YouTube parsing, article extraction, queue math.
// All pure functions with injectable "today" where time matters (same pattern
// as lib/skills.ts, Decision #8).
//
// Semantics (simpler interpretation, documented in PROGRESS.md):
//  - kinds: video = YouTube embed (ID derived from the URL, never stored),
//    article = link with an in-app reader view, link = open externally,
//    file = uploaded to SQLite (15 MB cap, books Decision #57 pattern).
//  - status pipeline: inbox (saved for later) → active (watching/reading) →
//    done (+ archived hides it). "done" stamps consumedAt; leaving clears it.
//  - reader view = readability-lite: pure string extraction from fetched HTML
//    (strip scripts/styles/chrome, keep headings/paragraphs/lists, decode the
//    common entities). No external dependency, fully unit-tested offline.
//  - private-network hosts are refused for server-side fetches (SSRF guard).

import { shiftISO, type ISODate } from './date'
import { parseTags } from './reading'

/* ---------- kinds & statuses ---------- */

export const CONTENT_KINDS = [
  { key: 'video', label: 'Video', emoji: '🎬' },
  { key: 'article', label: 'Article', emoji: '📰' },
  { key: 'link', label: 'Link', emoji: '🔗' },
  { key: 'file', label: 'File', emoji: '📎' },
] as const

export type ContentKind = (typeof CONTENT_KINDS)[number]['key']

export function isContentKind(k: string): k is ContentKind {
  return CONTENT_KINDS.some((c) => c.key === k)
}

export function contentKindMeta(key: string): { label: string; emoji: string } {
  return CONTENT_KINDS.find((c) => c.key === key) ?? CONTENT_KINDS[2]
}

export const CONTENT_STATUSES = ['inbox', 'active', 'done', 'archived'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export function isContentStatus(s: string): s is ContentStatus {
  return (CONTENT_STATUSES as readonly string[]).includes(s)
}

export const CONTENT_STATUS_META: Record<ContentStatus, { label: string; emoji: string }> = {
  inbox: { label: 'In queue', emoji: '📥' },
  active: { label: 'In progress', emoji: '▶️' },
  done: { label: 'Done', emoji: '✅' },
  archived: { label: 'Archived', emoji: '🗄️' },
}

/* ---------- YouTube ---------- */

/**
 * Extract a YouTube video ID from the common URL shapes:
 * youtube.com/watch?v=ID · youtu.be/ID · /shorts/ID · /embed/ID · /live/ID ·
 * m.youtube.com · youtube-nocookie.com · plain 11-char ID passthrough.
 * Returns null for non-YouTube links — a video without a parsed ID is 422.
 */
export function youtubeId(raw: string): string | null {
  const url = raw.trim()
  if (!url) return null
  // bare ID (11 chars, YouTube alphabet) — passthrough convenience
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url
  let host: string
  let path: string
  let search: URLSearchParams
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    path = parsed.pathname
    search = parsed.searchParams
  } catch {
    return null
  }
  const okHost =
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host === 'youtu.be'
  if (!okHost) return null
  if (host === 'youtu.be') {
    const id = path.split('/')[1] ?? ''
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  }
  const v = search.get('v')
  if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v
  const seg = path.split('/').filter(Boolean)
  for (const marker of ['shorts', 'embed', 'live', 'v']) {
    const idx = seg.indexOf(marker)
    if (idx >= 0 && seg[idx + 1] && /^[A-Za-z0-9_-]{11}$/.test(seg[idx + 1])) return seg[idx + 1]
  }
  return null
}

/** Privacy-enhanced embed URL for an in-app player. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0`
}

/** Poster thumbnail for cards (browser falls back to the emoji tile offline). */
export function youtubeThumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
}

/* ---------- links & files ---------- */

/** http(s) URL check for anything the server will store or fetch. */
export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * SSRF guard: is this hostname a private / loopback / link-local target the
 * server must never fetch on the user's behalf? Also catches cloud metadata.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '::1' || h === '[::1]' || h === '::' || h === '0.0.0.0') return true
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true // IPv6 ULA / link-local
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true // link-local, incl. cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  }
  return false
}

/** How an uploaded file is presented in-app. */
export type FileView = 'video' | 'audio' | 'pdf' | 'image' | 'download'

export function fileView(mime: string): FileView {
  const m = (mime || '').toLowerCase()
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf') return 'pdf'
  if (m.startsWith('image/')) return 'image'
  return 'download'
}

/** Uploads the library accepts (video/audio/pdf/image — anything else is 415). */
export function isAcceptedUploadMime(mime: string): boolean {
  return fileView(mime) !== 'download'
}

/** Human byte size ("1.4 MB", "820 KB"). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`
}

/** Default title when the user just pastes a URL: the hostname. */
export function defaultTitleFor(url: string): string {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./, '')
    const vid = youtubeId(url)
    return vid ? 'YouTube video' : host || 'Untitled'
  } catch {
    return 'Untitled'
  }
}

/* ---------- queue math ---------- */

export interface ContentLike {
  kind: string
  status: string
  favorite: boolean
  /** ISO day the item was added (calendar day of createdAt) */
  addedOn: ISODate
}

export interface ContentStats {
  total: number
  inbox: number
  active: number
  done: number
  archived: number
  favorites: number
  /** items added within the trailing 7 days ending today (inclusive) */
  addedThisWeek: number
  /** done ÷ non-archived × 100, 2-decimal; null when nothing non-archived */
  completionPct: number | null
  /** age in days of the oldest non-archived item not yet done; null when none */
  oldestUnconsumedDays: number | null
}

/** days between two ISO days (negative when before). */
export function daysBetweenISO(from: ISODate, to: ISODate): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000)
}

export function contentStats(items: readonly ContentLike[], today: ISODate): ContentStats {
  let inbox = 0
  let active = 0
  let done = 0
  let archived = 0
  let favorites = 0
  let addedThisWeek = 0
  let oldest: number | null = null
  const weekStart = shiftISO(today, -6)
  for (const it of items) {
    if (it.status === 'archived') archived++
    else if (it.status === 'done') done++
    else if (it.status === 'active') active++
    else inbox++
    if (it.favorite) favorites++
    if (it.addedOn >= weekStart && it.addedOn <= today) addedThisWeek++
    if (it.status !== 'archived' && it.status !== 'done') {
      const age = daysBetweenISO(it.addedOn, today)
      if (oldest === null || age > oldest) oldest = age
    }
  }
  const live = inbox + active + done
  return {
    total: items.length,
    inbox,
    active,
    done,
    archived,
    favorites,
    addedThisWeek,
    completionPct: live > 0 ? Math.round((done / live) * 100 * 100) / 100 : null,
    oldestUnconsumedDays: oldest,
  }
}

export { parseTags }

/* ---------- article extraction (readability-lite) ---------- */

export interface ExtractedArticle {
  title: string | null
  text: string
}

const MAX_ARTICLE_CHARS = 80_000

/** Decode the HTML entities a text extractor actually meets. */
export function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    mdash: '—',
    ndash: '–',
    hellip: '…',
    rsquo: '\u2019',
    lsquo: '\u2018',
    ldquo: '\u201c',
    rdquo: '\u201d',
  }
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => named[name.toLowerCase()] ?? m)
}

function safeCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 1 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return ''
  return String.fromCodePoint(cp)
}

function collapseSpaces(s: string): string {
  return s.replace(/[\t\r ]+/g, ' ').trim()
}

/**
 * Extract readable text from an HTML page string — no DOM, pure regex passes:
 * title → drop comments/scripts/chrome → prefer <article>, else the <p>-densest
 * container is skipped in favor of the whole body (simplicity over cleverness)
 * → block tags become paragraph breaks → tags stripped → entities decoded.
 */
export function extractArticle(html: string): ExtractedArticle {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? collapseSpaces(decodeEntities(titleMatch[1])).slice(0, 300) || null : null

  let work = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|form|select|button|template|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')

  // prefer explicit <article> blocks — keep the longest one if several exist
  const articles = [...work.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)].map((m) => m[1])
  if (articles.length > 0) {
    work = articles.reduce((a, b) => (b.length > a.length ? b : a))
  } else {
    const body = work.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (body) work = body[1]
  }

  const text = decodeEntities(
    work
      .replace(/<br[^>]*>/gi, '\n')
      .replace(/<\/(p|h[1-6]|li|blockquote|div|section|tr|pre)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((line) => collapseSpaces(line))
    .filter((line) => line.length > 0)
    .join('\n\n')
    .slice(0, MAX_ARTICLE_CHARS)

  return { title, text }
}

/** Minimum extracted text we accept before calling the fetch a failure. */
export const MIN_ARTICLE_CHARS = 80

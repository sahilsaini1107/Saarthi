// Deterministic capture parsing (Phase 6): turn free text — a voice
// transcript, a pasted bank SMS or a forwarded WhatsApp message — into a
// transaction draft. Pure and injectable-clock, so every rule is unit-tested.
//
// Layering: THIS parser is the backbone (explainable, offline, tested). The
// LLM (services/capture.ts) is only a fallback for text the rules cannot
// confidently parse, and its output is validated + merged over these rules.
// "Deterministic first" keeps every draft auditable (Decision #29).

import { ISODate } from './date'
import { toPaise } from './money'

export type CaptureDirection = 'in' | 'out'

export interface CaptureDraft {
  direction: CaptureDirection | null
  amountPaise: number | null
  /** always a concrete calendar date (today fallback), ISO YYYY-MM-DD */
  dateISO: ISODate
  /** merchant / narration extracted from the text */
  note: string | null
  /** 0..1 — how much the rules actually matched (amount+direction weigh most) */
  confidence: number
  matched: { amount: boolean; direction: boolean; date: boolean; note: boolean }
}

/* ------------------------------------------------------------------ */
/* Amount                                                             */
/* ------------------------------------------------------------------ */

const AMOUNT_SUFFIXES: Array<[RegExp, number]> = [
  [/(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)\b/i, 10_000_000],
  [/(\d+(?:\.\d+)?)\s*(?:l|lakh|lakhs|lac|lacs)\b/i, 100_000],
  [/(\d+(?:\.\d+)?)\s*k\b/i, 1_000],
]

/**
 * Parse an amount token to integer paise. Understands Indian/western digit
 * grouping ("1,23,456.78"), currency marks ("₹250", "Rs. 250/-"), and scale
 * suffixes ("1.5k", "2.4 lakh", "1.2cr"). Returns null when the text holds
 * no parsable positive amount.
 */
export function parseCaptureAmount(text: string): number | null {
  const cleaned = text
    .replace(/[₹$]/g, ' ')
    .replace(/\brs\.?\s*/gi, ' ')
    .replace(/\/-/g, ' ')
    .replace(/(?<=\d),(?=\d)/g, '') // digit grouping — Indian (1,23,456) and western (1,234,567)

  // scale suffixes first ("1.5k" must not parse as 1.5)
  for (const [re, mult] of AMOUNT_SUFFIXES) {
    const m = cleaned.match(re)
    if (m) {
      const paise = toPaise(parseFloat(m[1]) * mult)
      if (paise > 0) return paise
    }
  }

  // plain decimal number with optional decimals
  const m = cleaned.match(/(?:^|[\s:])(\d+(?:\.\d{1,2})?)(?=$|[\s.,:;!?]|paise|rupees)/)
  if (m) {
    const paise = toPaise(parseFloat(m[1]))
    if (paise > 0) return paise
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Dates                                                              */
/* ------------------------------------------------------------------ */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function isoOf(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}

function parseDayMonth(day: number, month: number, today: Date): ISODate | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  const thisYear = today.getUTCFullYear()
  // most recent past occurrence: this year, else last year (expenses are
  // almost never forward-dated without an explicit year)
  let d = new Date(Date.UTC(thisYear, month - 1, day))
  if (d.getTime() > today.getTime()) d = new Date(Date.UTC(thisYear - 1, month - 1, day))
  return isoOf(d)
}

/**
 * Resolve a date phrase to an ISO calendar date relative to `today` (UTC
 * midnight). Handles: today / yesterday / day-before-yesterday, "last
 * Friday", "5 Aug" / "Aug 5" (+optional year), "5/9" (DD/MM, Indian
 * convention), "5-9-2026", "2026-09-05". Returns null when nothing parses.
 */
export function parseCaptureDate(text: string, today: Date): ISODate | null {
  const t = text.toLowerCase()

  // order matters: "day before yesterday" contains "yesterday"
  if (/\bday before yesterday\b/.test(t)) return isoOf(new Date(today.getTime() - 2 * 86_400_000))
  if (/\btoday\b|\btonight\b/.test(t)) return isoOf(today)
  if (/\byesterday\b|\blast night\b/.test(t)) return isoOf(new Date(today.getTime() - 86_400_000))

  // "last friday" / "on monday"
  const wd = t.match(/\b(?:last\s+|on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1])
    // days back from today (1..7): today itself matches as 7 back when named?
    // "on friday" said ON friday means today; "last friday" means 7 back.
    const todayWd = today.getUTCDay()
    let back = (todayWd - target + 7) % 7
    if (back === 0) back = /\blast\b/.test(wd[0]) ? 7 : 0
    return isoOf(new Date(today.getTime() - back * 86_400_000))
  }

  // ISO 2026-09-05
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
    if (!Number.isNaN(d.getTime())) return isoOf(d)
  }

  // "5 aug 2026" / "5th aug" / "aug 5" / "sep 05, 2026"
  const dmy = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\b(?:[,\s]+(\d{4}))?/)
  const mdy = t.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:[,\s]+(\d{4}))?/)
  const monthFromWord = (w: string): number | null => {
    const i = MONTHS.indexOf(w.slice(0, 3))
    return i === -1 ? null : i + 1
  }
  for (const m of [dmy, mdy]) {
    if (!m) continue
    const isDMY = m === dmy
    const day = isDMY ? +m[1] : +m[2]
    const month = monthFromWord(isDMY ? m[2] : m[1])
    if (month == null) continue
    if (m[3]) {
      const d = new Date(Date.UTC(+m[3], month - 1, day))
      if (!Number.isNaN(d.getTime())) return isoOf(d)
    }
    const resolved = parseDayMonth(day, month, today)
    if (resolved) return resolved
  }

  // numeric 5/9[/2026] or 5-9-2026 — DD/MM preferred (Indian), swap when impossible
  const num = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/)
  if (num) {
    let a = +num[1]
    let b = +num[2]
    let year: number | null = num[3] ? +num[3] : null
    if (year != null && year < 100) year += 2000
    if (a > 12 && b <= 12) {
      // a=day, b=month
    } else if (b > 12 && a <= 12) {
      ;[a, b] = [b, a] // was MM/DD → swap to DD/MM
    } // else ambiguous → DD/MM convention
    if (year != null) {
      const d = new Date(Date.UTC(year, b - 1, a))
      if (!Number.isNaN(d.getTime()) && a >= 1 && a <= 31) return isoOf(d)
    }
    return parseDayMonth(a, b, today)
  }

  return null
}

/* ------------------------------------------------------------------ */
/* Direction                                                          */
/* ------------------------------------------------------------------ */

const OUT_WORDS = [
  'spent', 'spend', 'spending', 'paid', 'pay', 'bought', 'buy', 'purchase', 'purchased',
  'debited', 'debit', 'withdrew', 'withdrawal', 'withdraw', 'fare', 'charged', 'charge',
  'ordered', 'order', 'bill', 'recharge', 'topped up', 'topup',
]
const IN_WORDS = [
  'received', 'receive', 'got', 'credited', 'credit', 'salary', 'refund', 'refunded',
  'cashback', 'bonus', 'income', 'earned', 'won', 'returned',
]

/** Keyword vote between out/in words; ties or silence → null (caller defaults). */
export function detectCaptureDirection(text: string): CaptureDirection | null {
  const t = ` ${text.toLowerCase()} `
  // exact-word hits only — "received" must not also count "receive" and
  // break a genuine out/in tie (received-then-spent → silence → null)
  const hits = (words: string[]): number => {
    const found = new Set<string>()
    for (const w of words) {
      if (new RegExp(`\\b${w.replace(/ /g, '\\s+')}(?:s|ed)?\\b`).test(t)) found.add(w)
    }
    return found.size
  }
  const out = hits(OUT_WORDS)
  const inc = hits(IN_WORDS)
  if (out > inc) return 'out'
  if (inc > out) return 'in'
  return null
}

/* ------------------------------------------------------------------ */
/* Note / merchant extraction                                         */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'at', 'on', 'in', 'for', 'of', 'via', 'from', 'to', 'with', 'by',
  'and', 'my', 'some', 'today', 'yesterday', 'night', 'morning', 'evening', 'afternoon',
  'spent', 'spend', 'paid', 'pay', 'bought', 'purchase', 'purchased', 'received',
  'debited', 'credited', 'rupees', 'rupee', 'rs', 'inr', 'paise', 'got', 'using', 'card',
  'cash', 'upi', 'online', 'last', 'this', 'was', 'were', 'is', 'it', 'i', 'just',
])

/**
 * Extract a human note: quoted spans win ("paid \"Chai point\" 40"); else the
 * remaining words after dropping the amount token, date token, direction
 * keywords and filler words. Empty → null.
 */
export function extractCaptureNote(text: string, amountPaise: number | null, dateISO: string | null): string | null {
  const quoted = text.match(/["“”']([^"“”']{2,40})["“”']/)
  if (quoted) return quoted[1].trim()

  let t = text
  // drop date expression first so "5 aug" doesn't leak words
  if (dateISO) t = t.replace(/\b(\d{1,2}(?:st|nd|rd|th)?[\s./-]+[a-z0-9]{3,9}([\s,/ -]+\d{2,4})?|today|yesterday|last\s+\w+day|on\s+\w+day|day\s+before\s+yesterday|last\s+night)\b/gi, ' ')
  // drop the amount token
  if (amountPaise != null) {
    t = t.replace(/₹?\s*\d[\d,]*(?:\.\d+)?\s*(?:k|l|lakh|lakhs|lac|lacs|cr|crore|crores|rupees|rs\.?|\/-)?/gi, ' ')
  }
  const words = t
    .toLowerCase()
    .replace(/[^a-z0-9\s&'.-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w) && !/^\d+(\.\d+)?(k|l|cr)?$/.test(w))
  if (words.length === 0) return null
  return words.join(' ').slice(0, 60)
}

/* ------------------------------------------------------------------ */
/* Full text → draft                                                  */
/* ------------------------------------------------------------------ */

/** Parse free text into a draft. Missing amount/direction simply stay null. */
export function parseCaptureText(text: string, today: Date): CaptureDraft {
  const dateISO = parseCaptureDate(text, today) ?? isoOf(today)
  const amountPaise = parseCaptureAmount(text)
  const direction = detectCaptureDirection(text)
  const note = extractCaptureNote(text, amountPaise, dateISO)

  let confidence = 0
  if (amountPaise != null) confidence += 0.55
  if (direction != null) confidence += 0.25
  if (parseCaptureDate(text, today) != null) confidence += 0.1
  if (note != null) confidence += 0.1

  return {
    direction,
    amountPaise,
    dateISO,
    note,
    confidence: Math.min(1, Math.round(confidence * 100) / 100),
    matched: {
      amount: amountPaise != null,
      direction: direction != null,
      date: parseCaptureDate(text, today) != null,
      note: note != null,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Category guessing                                                  */
/* ------------------------------------------------------------------ */

/** keyword → default category name (lowercase). Order matters (first hit). */
const CATEGORY_HINTS: Array<[string[], string]> = [
  [['swiggy', 'zomato', 'restaurant', 'food', 'lunch', 'dinner', 'breakfast', 'chai', 'coffee', 'cafe', 'pizza', 'dominos', 'kfc', 'mcd'], 'Food'],
  [['bigbasket', 'blinkit', 'zepto', 'dmart', 'grocery', 'groceries', 'vegetable', 'vegetables', 'kirana', 'milk', 'supermarket'], 'Groceries'],
  [['uber', 'ola', 'rapido', 'auto', 'cab', 'taxi', 'metro', 'bus', 'fuel', 'petrol', 'diesel', 'parking', 'toll'], 'Transport'],
  [['electricity', 'water', 'gas', 'broadband', 'wifi', 'internet', 'mobile', 'recharge', 'airtel', 'jio', 'vodafone', 'rent'], 'Bills'],
  [['amazon', 'flipkart', 'myntra', 'ajio', 'shopping', 'clothes', 'shoes', 'saree', 'kurta'], 'Shopping'],
  [['doctor', 'medicine', 'medical', 'pharmacy', 'apollo', 'hospital', 'clinic', 'lab', 'test'], 'Health'],
  [['flight', 'flights', 'train', 'irctc', 'hotel', 'airbnb', 'makemytrip', 'goibibo', 'oyo', 'trip'], 'Travel'],
  [['movie', 'netflix', 'hotstar', 'prime', 'spotify', 'game', 'games', 'concert', 'bookmyshow'], 'Entertainment'],
  [['emi', 'loan', 'installment', 'instalment'], 'EMI'],
  [['salary', 'refund', 'cashback', 'interest', 'bonus', 'dividend'], 'Income'],
  [['mutual', 'sip', 'stock', 'stocks', 'zerodha', 'groww', 'shares', 'crypto', 'gold bond', 'nps', 'ppf'], 'Investment'],
]

/**
 * Guess a category for a note among the user's categories. Matching is
 * name-first (exact/substring both ways), then the keyword hint map. Returns
 * null when nothing matches — never invents a category.
 */
export function guessCategoryId(
  note: string | null,
  direction: CaptureDirection | null,
  categories: Array<{ id: string; name: string; kind: string }>,
): string | null {
  if (!note) {
    return direction === 'in' ? (categories.find((c) => c.kind === 'income')?.id ?? null) : null
  }
  const n = ` ${note.toLowerCase()} `

  // name-first: category name appears in the note or vice versa
  for (const c of categories) {
    const name = c.name.toLowerCase()
    if (name.length >= 3 && n.includes(name)) return c.id
  }
  for (const c of categories) {
    const name = c.name.toLowerCase()
    if (name.length >= 3 && name.includes(n.trim())) return c.id
  }

  const wantKind = direction === 'in' ? 'income' : 'expense'
  for (const [keywords, categoryName] of CATEGORY_HINTS) {
    if (keywords.some((k) => n.includes(` ${k}`) || n.includes(`${k} `))) {
      const hit = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase() && c.kind === wantKind)
      if (hit) return hit.id
    }
  }
  return null
}

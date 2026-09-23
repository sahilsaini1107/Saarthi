// CSV import engine (Phase 6). Pure: parse, map columns, convert rows to
// transaction drafts, flag duplicates. Bank-export shapes differ wildly, so
// detection is heuristic + unit-tested; anything ambiguous becomes a
// per-row error the UI shows BEFORE anything is written (no silent data).

import { ISODate } from './date'

/* ------------------------------------------------------------------ */
/* RFC4180-ish parser                                                  */
/* ------------------------------------------------------------------ */

/**
 * Parse CSV text into rows of cells. Handles quoted fields, escaped quotes
 * (""), commas and newlines inside quotes, CRLF and a trailing newline.
 * Cells are trimmed; empty trailing lines are dropped.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const src = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n') {
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim())
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c !== ''))
}

/* ------------------------------------------------------------------ */
/* Column mapping                                                      */
/* ------------------------------------------------------------------ */

export interface CsvMapping {
  skipFirstRow: boolean
  dateCol: number | null
  /** single signed/unsigned amount column (used with directionCol or sign) */
  amountCol: number | null
  /** separate debit (money-out) / credit (money-in) columns */
  debitCol: number | null
  creditCol: number | null
  /** textual direction column ("debit"/"credit"/"dr"/"cr"/"withdrawal"/"deposit") */
  directionCol: number | null
  noteCol: number | null
  categoryCol: number | null
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'posting date', 'dated', 'transactiontime', 'timestamp'],
  amount: ['amount', 'amt', 'value', 'amount (inr)', 'amount(inr)', 'transaction amount', 'paid', 'net amount'],
  debit: ['debit', 'withdrawal', 'withdrawal amt', 'withdrawal amount', 'debit amount', 'paid out', 'outflow', 'money out', 'dr'],
  credit: ['credit', 'deposit', 'deposit amt', 'deposit amount', 'credit amount', 'paid in', 'inflow', 'money in', 'cr', 'received'],
  direction: ['type', 'txn type', 'transaction type', 'direction', 'dr/cr', 'debit/credit', 'particulars dr/cr'],
  note: ['narration', 'particulars', 'description', 'details', 'remarks', 'memo', 'payee', 'merchant', 'name', 'note', 'to/from', 'ref', 'reference'],
  category: ['category', 'category name', 'bucket'],
}

function looksLikeHeader(cells: string[]): boolean {
  const norm = cells.map((c) => c.toLowerCase().trim())
  let hits = 0
  for (const aliases of Object.values(HEADER_ALIASES)) {
    if (norm.some((c) => aliases.includes(c))) hits++
  }
  return hits >= 2
}

function findHeaderCol(normCells: string[], key: keyof typeof HEADER_ALIASES): number | null {
  const aliases = HEADER_ALIASES[key]
  for (let i = 0; i < normCells.length; i++) {
    if (aliases.includes(normCells[i])) return i
  }
  return null
}

/**
 * Detect the CSV shape from its rows. If the first row looks like a header,
 * map columns by name (with content sniffing to disambiguate a "debit"
 * amount column from a "debit"/"credit" type column); otherwise fall back to
 * content sniffing over the first data rows. Returns null when no date+money
 * columns can be located at all.
 */
export function detectCsvMapping(rows: string[][]): CsvMapping | null {
  if (rows.length === 0) return null

  const header = looksLikeHeader(rows[0])
  const dataRows = header ? rows.slice(1) : rows
  if (dataRows.length === 0) return null

  const mapping: CsvMapping = {
    skipFirstRow: header,
    dateCol: null, amountCol: null, debitCol: null, creditCol: null,
    directionCol: null, noteCol: null, categoryCol: null,
  }

  if (header) {
    const norm = rows[0].map((c) => c.toLowerCase().trim())
    mapping.dateCol = findHeaderCol(norm, 'date')
    mapping.amountCol = findHeaderCol(norm, 'amount')
    mapping.debitCol = findHeaderCol(norm, 'debit')
    mapping.creditCol = findHeaderCol(norm, 'credit')
    mapping.directionCol = findHeaderCol(norm, 'direction')
    mapping.noteCol = findHeaderCol(norm, 'note')
    mapping.categoryCol = findHeaderCol(norm, 'category')

    // sniff: a "debit"/"credit" header whose cells are NUMBERS on real rows
    // is an amount column; non-numeric cells mean it is the dr/cr TYPE column.
    // Only rows whose date cell actually parses are considered, so garbage
    // rows in real statements never break detection.
    const realRows = dataRows.filter((r) => parseCsvDate(r[mapping.dateCol ?? 0] ?? '') != null)
    const sniff = (col: number | null): number | null => {
      if (col == null) return null
      const cells = realRows.slice(0, 8).map((r) => r[col]).filter((v) => v !== undefined && v !== '')
      if (cells.length === 0) return col
      return cells.every((v) => parseCsvAmount(v) != null) ? col : null
    }
    mapping.debitCol = sniff(mapping.debitCol)
    mapping.creditCol = sniff(mapping.creditCol)
    if (mapping.debitCol == null && mapping.creditCol == null && norm[mapping.directionCol ?? -1] === undefined) {
      // "debit" header was actually the type column — reassign it
      const idx = norm.findIndex((c) => HEADER_ALIASES.direction.includes(c) || c === 'debit' || c === 'credit')
      if (idx !== -1) mapping.directionCol = idx
    }
  }

  // content sniffing fallback for unmapped columns
  const sample = dataRows.slice(0, 8)
  const isDateCell = (v: string | undefined) => v != null && v !== '' && parseCsvDate(v) != null
  const isAmountCell = (v: string | undefined) => v != null && v !== '' && parseCsvAmount(v) != null

  if (mapping.dateCol == null) {
    for (let i = 0; i < (rows[0]?.length ?? 0); i++) {
      const hits = sample.filter((r) => isDateCell(r[i])).length
      if (hits >= Math.max(1, Math.ceil(sample.length * 0.6))) {
        mapping.dateCol = i
        break
      }
    }
  }

  if (!header) {
    // find the first money-like column pair or single amount column
    for (let i = 0; i < (rows[0]?.length ?? 0); i++) {
      if (i === mapping.dateCol) continue
      const hits = sample.filter((r) => isAmountCell(r[i])).length
      if (hits >= Math.max(1, Math.ceil(sample.length * 0.6))) {
        // signed amounts (negatives present) → single column
        const hasNegative = sample.some((r) => parseCsvAmount(r[i]) != null && parseCsvAmount(r[i])! < 0)
        if (hasNegative || mapping.amountCol == null) mapping.amountCol = i
        break
      }
    }
    // second money column with no negatives alongside a signed one → debit/credit pair
    if (mapping.amountCol != null) {
      for (let i = mapping.amountCol + 1; i < (rows[0]?.length ?? 0); i++) {
        const hits = sample.filter((r) => isAmountCell(r[i])).length
        if (hits >= Math.max(1, Math.ceil(sample.length * 0.6))) {
          mapping.creditCol = i
          mapping.debitCol = mapping.amountCol
          mapping.amountCol = null
          break
        }
      }
    }
    // a text-ish column (mostly non-numeric, non-date) becomes the note
    if (mapping.noteCol == null) {
      for (let i = 0; i < (rows[0]?.length ?? 0); i++) {
        if (i === mapping.dateCol || i === mapping.amountCol || i === mapping.debitCol || i === mapping.creditCol) continue
        const cells = sample.map((r) => r[i]).filter((v) => v !== undefined && v !== '')
        if (cells.length === 0) continue
        const textish = cells.filter((v) => parseCsvAmount(v) == null && parseCsvDate(v) == null).length
        if (textish >= Math.max(1, Math.ceil(cells.length * 0.6))) {
          mapping.noteCol = i
          break
        }
      }
    }
  }

  if (mapping.dateCol == null) return null
  if (mapping.amountCol == null && mapping.debitCol == null && mapping.creditCol == null) return null
  return mapping
}

/* ------------------------------------------------------------------ */
/* Cell parsers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Parse a money cell into SIGNED paise. Conventions: "1,23,456.78" and
 * "₹1,234" plain; "250.00 CR" positive; "250 DR" negative (money out);
 * "(500.00)" negative (accounting); "-500" negative; "500/-" positive.
 * Zero / unparsable → null.
 */
export function parseCsvAmount(raw: string): number | null {
  let t = raw.trim()
  if (t === '') return null
  let negative = false
  if (/^\(.*\)$/.test(t)) {
    negative = true
    t = t.slice(1, -1)
  }
  const dr = /\bdr\b|\bdebit\b/i.test(t)
  const cr = /\bcr\b|\bcredit\b/i.test(t)
  t = t
    .replace(/[₹$]/g, '')
    .replace(/\brs\.?/gi, '')
    .replace(/\b(cr|credit|dr|debit)\b/gi, '')
    .replace(/\/-/g, '')
    .trim()
  t = t.replace(/(?<=\d),(?=\d)/g, '')
  if (!/^[+-]?\d+(\.\d{1,4})?$/.test(t)) return null
  let v = parseFloat(t)
  if (!Number.isFinite(v)) return null
  if (t.startsWith('-') || negative || dr) v = -Math.abs(v)
  else if (cr) v = Math.abs(v)
  const paise = Math.round(v * 100)
  return paise === 0 ? null : paise
}

const CSV_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Parse a date cell. Accepts ISO (2026-09-05), DD/MM/YYYY, DD-MM-YYYY,
 * DD.MM.YYYY, DD MMM YYYY, DD-MMM-YY, MMM DD YYYY. Ambiguous numeric dates
 * follow the Indian DD/MM convention (swapped only when impossible).
 */
export function parseCsvDate(raw: string): ISODate | null {
  const t = raw.trim()
  if (t === '') return null

  // ISO
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return buildIso(+m[1], +m[2], +m[3])

  // DD/MM/YYYY · DD-MM-YY · DD.MM.YYYY
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    let day = +m[1]
    let month = +m[2]
    let year = +m[3]
    if (year < 100) year += 2000
    if (day > 12 && month <= 12) {
      // day-first confirmed
    } else if (month > 12 && day <= 12) {
      ;[day, month] = [month, day]
    } // else ambiguous → DD/MM convention
    return buildIso(year, month, day)
  }

  // 05 Sep 2026 / 05-Sep-26
  m = t.match(/^(\d{1,2})[\s-]*([a-zA-Z]{3,9})[\s-]*(\d{2,4})?$/)
  if (m) {
    const month = CSV_MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    if (month === -1) return null
    let year = m[3] ? +m[3] : new Date().getUTCFullYear()
    if (year < 100) year += 2000
    return buildIso(year, month + 1, +m[1])
  }

  // Sep 05, 2026 / Sep 5 2026
  m = t.match(/^([a-zA-Z]{3,9})[\s-]*(\d{1,2})(?:,)?[\s-]*(\d{2,4})?$/)
  if (m) {
    const month = CSV_MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
    if (month === -1) return null
    let year = m[3] ? +m[3] : new Date().getUTCFullYear()
    if (year < 100) year += 2000
    return buildIso(year, month + 1, +m[2])
  }

  return null
}

function buildIso(y: number, mo: number, d: number): ISODate | null {
  if (y < 1970 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== d) return null // e.g. Feb 31
  return date.toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ */
/* Rows → drafts                                                       */
/* ------------------------------------------------------------------ */

export type CsvDirection = 'in' | 'out'

export interface CsvDraftRow {
  rowIdx: number // index in the ORIGINAL csv rows array (for error reporting)
  amountPaise: number
  direction: CsvDirection
  date: ISODate
  note: string | null
  categoryName: string | null
}

export interface CsvRowOutcome {
  rowIdx: number
  draft?: CsvDraftRow
  error?: string
}

function directionFromCell(raw: string): CsvDirection | null {
  const t = raw.trim().toLowerCase()
  if (/^(debit|dr|withdrawal|out|paid out|expense|outflow|money out|sent|debit amount)$/.test(t)) return 'out'
  if (/^(credit|cr|deposit|in|paid in|income|inflow|money in|received|credit amount)$/.test(t)) return 'in'
  return null
}

/**
 * Convert parsed CSV rows into drafts using a mapping. Rows with unparseable
 * dates/amounts produce per-row errors; empty rows are skipped silently.
 *
 * Direction resolution for a single amount column: negatives are expenses;
 * positives are income ONLY when the file mixes signs (ledger convention) or
 * a type column says so — an all-positive file with no type column is
 * reported per-row instead of guessing (guessing would silently book
 * expenses as income).
 */
export function csvDraftRows(rows: string[][], mapping: CsvMapping): CsvRowOutcome[] {
  const out: CsvRowOutcome[] = []
  const dataRows = rows.slice(mapping.skipFirstRow ? 1 : 0)

  // file-level: does the amount column mix signs? (needed to trust positives)
  const amountColIdx = mapping.amountCol
  const mixesSigns =
    amountColIdx != null &&
    dataRows.some((r) => {
      const v = parseCsvAmount(r[amountColIdx] ?? '')
      return v != null && v < 0
    })

  for (let i = 0; i < dataRows.length; i++) {
    const rowIdx = i + (mapping.skipFirstRow ? 1 : 0)
    const cells = dataRows[i]
    if (cells.every((c) => c === '')) continue

    const dateRaw = mapping.dateCol != null ? cells[mapping.dateCol] : undefined
    const date = parseCsvDate(dateRaw ?? '')
    if (!date) {
      out.push({ rowIdx, error: `Unreadable date "${dateRaw ?? ''}"` })
      continue
    }

    let amountPaise: number | null = null
    let direction: CsvDirection | null = null

    const debitRaw = mapping.debitCol != null ? cells[mapping.debitCol] : ''
    const creditRaw = mapping.creditCol != null ? cells[mapping.creditCol] : ''
    const debit = debitRaw ? parseCsvAmount(debitRaw) : null
    const credit = creditRaw ? parseCsvAmount(creditRaw) : null

    if (debit != null) {
      amountPaise = Math.abs(debit)
      direction = 'out'
    } else if (credit != null) {
      amountPaise = Math.abs(credit)
      direction = 'in'
    } else if (amountColIdx != null) {
      const signed = parseCsvAmount(cells[amountColIdx] ?? '')
      if (signed == null) {
        out.push({ rowIdx, error: `Unreadable amount "${cells[amountColIdx] ?? ''}"` })
        continue
      }
      amountPaise = Math.abs(signed)
      if (signed < 0) direction = 'out'
      else if (mapping.directionCol != null) direction = directionFromCell(cells[mapping.directionCol] ?? '')
      else if (mixesSigns) direction = 'in'
      else direction = null
    } else {
      out.push({ rowIdx, error: 'No amount in debit/credit columns' })
      continue
    }

    if (direction == null && mapping.directionCol != null) direction = directionFromCell(cells[mapping.directionCol] ?? '')
    if (direction == null) {
      out.push({ rowIdx, error: 'Ambiguous direction — this file has no negatives and no type column, so expense vs income is unknowable' })
      continue
    }
    if (amountPaise == null || amountPaise <= 0) {
      out.push({ rowIdx, error: 'Amount must be positive' })
      continue
    }

    const note = mapping.noteCol != null && cells[mapping.noteCol] ? cells[mapping.noteCol].slice(0, 200) : null
    const categoryName = mapping.categoryCol != null && cells[mapping.categoryCol] ? cells[mapping.categoryCol].slice(0, 40) : null

    out.push({ rowIdx, draft: { rowIdx, amountPaise, direction, date, note, categoryName } })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Duplicate detection                                                 */
/* ------------------------------------------------------------------ */

/**
 * Identity key for duplicate detection: same account + day + direction +
 * amount + normalized note. Two imports of the same statement then skip
 * everything instead of doubling the ledger.
 */
export function duplicateKey(input: {
  accountId: string
  date: ISODate
  direction: CsvDirection
  amountPaise: number
  note?: string | null
}): string {
  const note = (input.note ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  return [input.accountId, input.date, input.direction, input.amountPaise, note].join('|')
}

export interface ImportPlanRow extends CsvDraftRow {
  status: 'create' | 'duplicate'
}

/**
 * Plan an import against keys of transactions ALREADY in the ledger. The
 * first occurrence in the file wins; later identical rows are duplicates of
 * the planned one (double rows inside one file never double-post).
 */
export function planImport(drafts: CsvDraftRow[], existingKeys: Set<string>, accountId: string): ImportPlanRow[] {
  const seen = new Set<string>()
  return drafts.map((d) => {
    const key = duplicateKey({ accountId, date: d.date, direction: d.direction, amountPaise: d.amountPaise, note: d.note })
    if (existingKeys.has(key) || seen.has(key)) return { ...d, status: 'duplicate' as const }
    seen.add(key)
    return { ...d, status: 'create' as const }
  })
}

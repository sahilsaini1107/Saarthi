// Workout-history calendar math (Phase 14). Monday-start month grids and
// per-month training stats — pure, injectable data, no clock reads.
// Monday-start matches the ISO weeks used by the effort grids (Phase 10).

export interface HistorySessionLike {
  id: string
  /** ISO calendar date "YYYY-MM-DD" (UTC-midnight convention) */
  date: string
  label: string
  durationMin: number
  volumeGrams: number
}

/** One cell of the month grid — leading/trailing days belong to neighbours. */
export interface MonthCell {
  iso: string
  inMonth: boolean
}

/**
 * Weeks (Mon..Sun rows) covering `month` (1-indexed). Rows are padded with
 * the tail of the previous month and the head of the next month so every row
 * has exactly 7 cells; row count is 4–6, whatever the layout needs.
 */
export function monthMatrix(year: number, month: number): MonthCell[][] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('monthMatrix needs a year and month 1..12')
  }
  const first = new Date(Date.UTC(year, month - 1, 1))
  const offset = (first.getUTCDay() + 6) % 7 // Sun=0 → Monday-start offset
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const rows = Math.ceil((offset + daysInMonth) / 7)
  const monthKey = `${year}-${String(month).padStart(2, '0')}`

  const rowsOut: MonthCell[][] = []
  for (let r = 0; r < rows; r++) {
    const row: MonthCell[] = []
    for (let c = 0; c < 7; c++) {
      const i = r * 7 + c
      const cursor = new Date(Date.UTC(year, month - 1, 1 - offset + i))
      row.push({ iso: cursor.toISOString().slice(0, 10), inMonth: cursor.toISOString().slice(0, 7) === monthKey })
    }
    rowsOut.push(row)
  }
  return rowsOut
}

/** Group a session list by ISO date (sorted by id inside each day). */
export function byDate(sessions: readonly HistorySessionLike[]): Map<string, HistorySessionLike[]> {
  const map = new Map<string, HistorySessionLike[]>()
  for (const s of sessions) {
    const list = map.get(s.date) ?? []
    list.push(s)
    map.set(s.date, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.id.localeCompare(b.id))
  return map
}

export interface HistoryMonthStats {
  sessions: number
  minutes: number
  volumeKg: number
  /** distinct training days in the month */
  days: number
}

/** Aggregates over the sessions that fall inside `year-month` (1-indexed). */
export function historyMonthStats(sessions: readonly HistorySessionLike[], year: number, month: number): HistoryMonthStats {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  let minutes = 0
  let volumeGrams = 0
  const days = new Set<string>()
  let count = 0
  for (const s of sessions) {
    if (!s.date.startsWith(prefix)) continue
    count += 1
    minutes += s.durationMin
    volumeGrams += s.volumeGrams
    days.add(s.date)
  }
  return { sessions: count, minutes, volumeKg: Math.round((volumeGrams / 1000) * 100) / 100, days: days.size }
}

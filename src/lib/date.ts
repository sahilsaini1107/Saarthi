// Date utilities.
// Convention: every calendar date in Saarthi is stored as a JS Date at UTC
// midnight representing that calendar day *in the user's timezone*.
// "Today" is always computed from the user's timezone setting.

export type ISODate = string // "YYYY-MM-DD"

/** Today's calendar date in the given IANA timezone, as YYYY-MM-DD. */
export function todayISO(tz: string, now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Validate an IANA timezone identifier. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    return true
  } catch {
    return false
  }
}

/** UTC-midnight Date for an ISO calendar date. */
export function toUTC(iso: ISODate): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

/** ISO calendar date of a UTC-midnight Date. */
export function isoDayUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}

/** "YYYY-MM" for a UTC-midnight Date. */
export function monthKeyUTC(d: Date): string {
  return d.toISOString().slice(0, 7)
}

export function currentMonthKey(tz: string, now: Date = new Date()): string {
  return todayISO(tz, now).slice(0, 7)
}

/** [start, endExclusive) of month "YYYY-MM" as UTC-midnight Dates. */
export function monthRange(key: string): { start: Date; endExclusive: Date } {
  const [y, m] = key.split('-').map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    endExclusive: new Date(Date.UTC(y, m, 1)),
  }
}

export function addDaysUTC(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

export function subDaysUTC(d: Date, n: number): Date {
  return addDaysUTC(d, -n)
}

export function daysBetweenUTC(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/**
 * Add k calendar months WITHOUT drift: the day-of-month anchor is preserved
 * and clamped to the target month's length. Jan 31 -> Feb 29 (leap) -> Mar 31.
 */
export function addMonthsUTC(d: Date, k: number, anchorDay?: number): Date {
  const anchor = anchorDay ?? d.getUTCDate()
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + k
  const daysInTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(anchor, daysInTarget)))
}

export function daysInMonthUTC(y: number, mZeroBased: number): number {
  return new Date(Date.UTC(y, mZeroBased + 1, 0)).getUTCDate()
}

/** "Wed, 6 Sep" style label computed in UTC (matches stored calendar dates). */
export function formatDayLabel(iso: ISODate): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(toUTC(iso))
}

/** "September 2026" */
export function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, 1)))
}

/** Shift an ISO date by n days, returning ISO. */
export function shiftISO(iso: ISODate, n: number): ISODate {
  return isoDayUTC(addDaysUTC(toUTC(iso), n))
}

/**
 * Shift a "YYYY-MM" month key by delta months — "2026-01" − 1 = "2025-12".
 * Year rollover falls out of UTC arithmetic; day-of-month is pinned to the 1st
 * so month lengths can never drift the result.
 */
export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

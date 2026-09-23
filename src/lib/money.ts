// Money utilities. All amounts are stored and passed as integer paise.
// Rounding rule: half-away-from-zero at the paise boundary (2 decimals).

/** Convert a rupee amount (float or string) to integer paise, rounded to 2 decimals. */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0
  // +EPS guards float artifacts like 2.675 * 100 = 267.49999999999997
  return Math.round((rupees + Number.EPSILON) * 100)
}

/** Integer paise -> rupee number (safe: paise magnitudes stay far below 2^53). */
export function paiseToRupees(paise: number): number {
  return paise / 100
}

const inr2dp = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "₹1,23,456.78" — Indian digit grouping, always 2 decimals. */
export function formatINR(paise: number): string {
  return inr2dp.format(paiseToRupees(paise))
}

/** Signed variant: income prefixed with +, expenses keep the minus. */
export function formatINRSigned(paise: number, direction: 'in' | 'out'): string {
  return (direction === 'in' ? '+' : '-') + formatINR(Math.abs(paise))
}

/** Compact Indian notation: ₹1.25Cr / ₹3.4L / ₹12.5K / ₹450. */
export function formatINRCompact(paise: number): string {
  const r = Math.abs(paise) / 100
  const sign = paise < 0 ? '-' : ''
  const trim = (n: number) => {
    const s = n.toFixed(2).replace(/\.?0+$/, '')
    return s
  }
  if (r >= 1_00_00_000) return `${sign}₹${trim(r / 1_00_00_000)}Cr`
  if (r >= 1_00_000) return `${sign}₹${trim(r / 1_00_000)}L`
  if (r >= 1_000) return `${sign}₹${trim(r / 1_000)}K`
  return `${sign}₹${trim(r)}`
}

/**
 * Parse free-typed amount text ("1,234.5", "₹99", "450") to paise.
 * Returns null for anything that is not a valid amount with at most 2 decimals.
 */
export function parseAmountToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const paise = Math.round(parseFloat(cleaned) * 100)
  if (!Number.isFinite(paise) || paise <= 0) return null
  return paise
}

/** Sum a list of paise values (use instead of reduce at call sites for clarity). */
export function sumPaise(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

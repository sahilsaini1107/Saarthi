// Recurring Deposit math (Phase 1.5).
// Convention (Decision #11, PROGRESS.md) — mirrors how Indian banks quote RDs:
//   • N monthly installments, installment k (k = 1..N) deposited at the START
//     of month k and earning r = N − k + 1 months until maturity.
//   • Maturity date = start date advanced by N months (anchor day preserved).
//   • quarterly: complete quarters compound at i = rate/4; leftover months earn
//     simple pro-rata (i/3 per month) — matches bank RD calculators.
//   • monthly: compound (1 + rate/12)^r per installment.
//   • annual: compound (1 + rate)^(r/12) per installment.
//   • simple: linear rate·r/12 per installment.
// All pure functions; amounts in integer paise, rounded once at the end.

import { maturityDateUTC } from './fd'
import { toUTC, type ISODate } from './date'
import { toPaise } from './money'

export const RD_COMPOUNDING_OPTIONS = ['simple', 'annual', 'quarterly', 'monthly'] as const
export type RdCompounding = (typeof RD_COMPOUNDING_OPTIONS)[number]

export { maturityDateUTC as rdMaturityDateUTC }

/**
 * Maturity amount in paise for an RD of `installmentPaise` per month,
 * `tenureMonths` months at `ratePct` % p.a. Rounded half-up to the paise,
 * once, at the final step.
 */
export function rdMaturityAmountPaise(
  installmentPaise: number,
  ratePct: number,
  tenureMonths: number,
  compounding: RdCompounding,
): number {
  if (installmentPaise <= 0 || tenureMonths <= 0) return 0
  const R = installmentPaise / 100
  const rate = ratePct / 100
  let totalRupees = 0
  for (let k = 1; k <= tenureMonths; k++) {
    const r = tenureMonths - k + 1
    let factor: number
    switch (compounding) {
      case 'simple':
        factor = 1 + (rate * r) / 12
        break
      case 'monthly':
        factor = Math.pow(1 + rate / 12, r)
        break
      case 'annual':
        factor = Math.pow(1 + rate, r / 12)
        break
      case 'quarterly': {
        const quarters = Math.floor(r / 3)
        const leftoverMonths = r % 3
        const quarterlyRate = rate / 4
        factor = Math.pow(1 + quarterlyRate, quarters) * (1 + (quarterlyRate * leftoverMonths) / 3)
        break
      }
    }
    totalRupees += R * factor
  }
  return toPaise(totalRupees)
}

/** Total money the user will pay in over the full tenure. */
export function rdTotalInvestedPaise(installmentPaise: number, tenureMonths: number): number {
  if (installmentPaise <= 0 || tenureMonths <= 0) return 0
  return installmentPaise * tenureMonths
}

/**
 * How many installments have come due by `now` (estimate): the first
 * installment is due on the start date itself, one per month after,
 * clamped to [0, N]. Day-of-month clamping on short months (e.g. start
 * on the 31st) keeps this an estimate by design.
 */
export function rdInstallmentsPaid(startISO: ISODate, tenureMonths: number, now: Date): number {
  const start = toUTC(startISO)
  if (now.getTime() < start.getTime()) return 0
  const monthsElapsed =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - start.getUTCMonth()) -
    (now.getUTCDate() < start.getUTCDate() ? 1 : 0)
  return Math.min(tenureMonths, Math.max(0, monthsElapsed + 1))
}

/** Conservative "value now": installments come due × installment (no accrued interest). */
export function rdValueNowPaise(installmentPaise: number, installmentsPaid: number): number {
  return installmentPaise * installmentsPaid
}

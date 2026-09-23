// Investment portfolio math (Phase 1.5).
// Accounting method: weighted-average cost (Decision #12, PROGRESS.md).
//   • buy:      qty += q; avg cost = (avg·qty + cash) / (qty + q)
//   • sell:     realized P&L = proceeds − avg·q; qty −= q (avg unchanged)
//   • dividend/interest: pure income; qty and cost basis untouched
// Quantity is a float (fractional shares / crypto) and is NOT money — all
// cash amounts remain integer paise. Pure functions only.

export const INVESTMENT_TYPES = ['stock', 'bond', 'crypto', 'mutual_fund', 'etf', 'gold', 'reit', 'ppf', 'nps', 'other'] as const
export type InvestmentType = (typeof INVESTMENT_TYPES)[number]

export const INVESTMENT_TXN_KINDS = ['buy', 'sell', 'dividend', 'interest'] as const
export type InvestmentTxnKind = (typeof INVESTMENT_TXN_KINDS)[number]

export const INVESTMENT_TYPE_LABELS: Record<InvestmentType, string> = {
  stock: 'Stock',
  bond: 'Bond',
  crypto: 'Crypto',
  mutual_fund: 'Mutual fund',
  etf: 'ETF',
  gold: 'Gold',
  reit: 'REIT',
  ppf: 'PPF',
  nps: 'NPS',
  other: 'Other',
}

export const INVESTMENT_TYPE_EMOJI: Record<InvestmentType, string> = {
  stock: '📈',
  bond: '🧾',
  crypto: '🪙',
  mutual_fund: '🌀',
  etf: '📊',
  gold: '🥇',
  reit: '🏢',
  ppf: '🏛️',
  nps: '👴',
  other: '💼',
}

export interface HoldingTxn {
  kind: InvestmentTxnKind
  quantity: number
  amountPaise: number
}

export interface Holding {
  quantity: number
  /** average cost per unit, in paise (float — derived, not stored money) */
  avgCostPaise: number
  /** cost basis of the OPEN position (avg × qty), paise */
  investedPaise: number
  /** total cash received from sells, paise */
  sellProceedsPaise: number
  realizedPnlPaise: number
  incomePaise: number
  txnCount: number
}

export function computeHolding(txnsOldestFirst: HoldingTxn[]): Holding {
  let quantity = 0
  let avgCostPaise = 0
  let sellProceedsPaise = 0
  let realizedPnlPaise = 0
  let incomePaise = 0
  let txnCount = 0

  for (const t of txnsOldestFirst) {
    if (t.quantity <= 0 && t.amountPaise <= 0) continue
    txnCount++
    if (t.kind === 'buy') {
      avgCostPaise = quantity + t.quantity > 0 ? (avgCostPaise * quantity + t.amountPaise) / (quantity + t.quantity) : 0
      quantity += t.quantity
    } else if (t.kind === 'sell') {
      const sold = Math.min(t.quantity, quantity) // defensive clamp; service validates
      const costBasis = avgCostPaise * sold
      realizedPnlPaise += t.amountPaise - costBasis
      quantity -= sold
      sellProceedsPaise += t.amountPaise
    } else {
      // dividend | interest — income only
      incomePaise += t.amountPaise
    }
  }

  return {
    quantity,
    avgCostPaise,
    investedPaise: avgCostPaise * quantity,
    sellProceedsPaise,
    realizedPnlPaise,
    incomePaise,
    txnCount,
  }
}

/** Market value of the open position at the latest known unit price. */
export function marketValuePaise(quantity: number, currentPricePaise: number): number {
  return Math.round(quantity * currentPricePaise)
}

/** Round a float quantity for display/API (fractional units to 8 dp). */
export function roundQuantity(q: number): number {
  return Math.round(q * 1e8) / 1e8
}

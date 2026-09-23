// Plate math (Phase 14). Pure functions — given a target barbell weight,
// which plates go on each side? Integer GRAMS throughout (Decision #21
// milli-units convention: 25 kg = 25000). Nothing here reads the clock.

/** Standard gym plate denominations, largest first (grams). */
export const DEFAULT_PLATES_G = [25_000, 20_000, 15_000, 10_000, 5_000, 2_500, 1_250] as const

/** Standard Olympic men's bar: 20 kg. A lighter technique bar is 15 kg. */
export const DEFAULT_BAR_G = 20_000
export const LIGHT_BAR_G = 15_000

export interface PlateSolution {
  /** plates for ONE side, largest first (grams; empty when the bar alone covers it) */
  perSideG: number[]
  /** total weight the solution actually achieves, kg (2 decimals) */
  achievedKg: number
  /** true when bar + both sides hit the target exactly */
  exact: boolean
  /** human hint for the not-exact / below-bar cases */
  note: string | null
}

/**
 * Greedy largest-first plate loading (optimal for standard denominations —
 * every plate is an exact multiple of the smallest one, so greed never
 * overshoots a smaller fit). Works per SIDE: (target − bar) / 2.
 *
 * - target < bar → empty bar, `note` explains.
 * - leftover smaller than the smallest plate → not exact, `note` shows the
 *   closest reachable weight (never above the target).
 */
export function computePlatesG(targetG: number, barG = DEFAULT_BAR_G, platesG: readonly number[] = DEFAULT_PLATES_G): PlateSolution {
  if (!Number.isFinite(targetG) || targetG <= 0) {
    return { perSideG: [], achievedKg: round2(barG / 1000), exact: false, note: 'Enter a weight first' }
  }
  if (barG <= 0) return { perSideG: [], achievedKg: 0, exact: false, note: 'Bar weight must be positive' }

  if (targetG < barG) {
    return {
      perSideG: [],
      achievedKg: round2(barG / 1000),
      exact: false,
      note: `lighter than an empty ${barG / 1000} kg bar`,
    }
  }

  let perSideTarget = (targetG - barG) / 2
  const perSideG: number[] = []
  for (const plate of platesG) {
    while (plate <= perSideTarget + 1e-9) {
      perSideG.push(plate)
      perSideTarget -= plate
    }
  }

  const achievedG = barG + perSideG.reduce((s, p) => s + p, 0) * 2
  const exact = Math.abs(achievedG - targetG) < 0.5 // half-gram tolerance (float safety)
  const shortfallG = targetG - achievedG

  return {
    perSideG,
    achievedKg: round2(achievedG / 1000),
    exact,
    note: exact
      ? null
      : shortfallG > 0
        ? `closest loadable: ${round2(achievedG / 1000)} kg (short ${round2(shortfallG / 1000)} kg)`
        : `closest loadable: ${round2(achievedG / 1000)} kg`,
  }
}

/** "10 + 2.5" — plates for one side, kg, trailing zeros trimmed. */
export function formatPlateStack(perSideG: readonly number[]): string {
  return perSideG
    .map((g) => {
      const kg = g / 1000
      return Number.isInteger(kg) ? String(kg) : String(round2(kg))
    })
    .join(' + ')
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

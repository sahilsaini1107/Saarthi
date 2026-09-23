import { describe, expect, it } from 'vitest'
import {
  combinedDayTotals,
  macroSplit,
  mealTypeBreakdown,
  mealTypeMeta,
  mergeDailyNutrition,
  isMealType,
  sumMealEntries,
  type MealEntryLike,
} from '@/lib/meals'

const entry = (over: Partial<MealEntryLike> = {}): MealEntryLike => ({
  mealType: 'snack',
  caloriesKcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  ...over,
})

describe('sumMealEntries', () => {
  it('sums all macros across entries', () => {
    const totals = sumMealEntries([
      entry({ mealType: 'breakfast', caloriesKcal: 420, proteinG: 24, carbsG: 50, fatG: 12 }),
      entry({ mealType: 'lunch', caloriesKcal: 650, proteinG: 40, carbsG: 70, fatG: 18 }),
      entry({ mealType: 'snack', caloriesKcal: 120, proteinG: 24 }),
    ])
    expect(totals).toEqual({ caloriesKcal: 1190, proteinG: 88, carbsG: 120, fatG: 30 })
  })

  it('treats null and negative values as 0 — never fabricates', () => {
    const totals = sumMealEntries([
      entry({ caloriesKcal: null, proteinG: null, carbsG: null, fatG: null }),
      entry({ caloriesKcal: -50, proteinG: -10 }),
      entry({ caloriesKcal: 300, proteinG: 20 }),
    ])
    expect(totals).toEqual({ caloriesKcal: 300, proteinG: 20, carbsG: 0, fatG: 0 })
  })

  it('empty day sums to zeros', () => {
    expect(sumMealEntries([])).toEqual({ caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
  })
})

describe('combinedDayTotals — meals + quick-adds', () => {
  it('adds the manual row and meal sums', () => {
    expect(
      combinedDayTotals({ caloriesKcal: 190, proteinG: 10 }, { caloriesKcal: 1190, proteinG: 88, carbsG: 0, fatG: 0 }),
    ).toEqual({ caloriesKcal: 1380, proteinG: 98 })
  })

  it('handles a missing manual row and empty meals', () => {
    expect(combinedDayTotals(null, { caloriesKcal: 500, proteinG: 30, carbsG: 0, fatG: 0 })).toEqual({ caloriesKcal: 500, proteinG: 30 })
    expect(combinedDayTotals({ caloriesKcal: 200, proteinG: 12 }, { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })).toEqual({ caloriesKcal: 200, proteinG: 12 })
    expect(combinedDayTotals(null, { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })).toEqual({ caloriesKcal: 0, proteinG: 0 })
  })
})

describe('mealTypeBreakdown — grouping + canonical order', () => {
  it('groups by meal type and orders breakfast → lunch → dinner → snack', () => {
    const breakdown = mealTypeBreakdown([
      entry({ mealType: 'snack', caloriesKcal: 120, proteinG: 24 }),
      entry({ mealType: 'dinner', caloriesKcal: 700, proteinG: 45 }),
      entry({ mealType: 'breakfast', caloriesKcal: 420, proteinG: 24 }),
      entry({ mealType: 'snack', caloriesKcal: 190, proteinG: 8 }),
    ])
    expect(breakdown.map((b) => b.mealType)).toEqual(['breakfast', 'dinner', 'snack'])
    expect(breakdown[2]).toEqual({ mealType: 'snack', caloriesKcal: 310, proteinG: 32, entryCount: 2 })
    expect(breakdown[1].entryCount).toBe(1)
  })

  it('omits empty meal types and coerces unknown types to snack', () => {
    const breakdown = mealTypeBreakdown([
      entry({ mealType: 'brunch' /* bad data */, caloriesKcal: 100, proteinG: 5 }),
      entry({ mealType: 'lunch', caloriesKcal: 600, proteinG: 35 }),
    ])
    expect(breakdown.map((b) => b.mealType)).toEqual(['lunch', 'snack'])
    expect(breakdown[1].caloriesKcal).toBe(100)
  })

  it('returns empty for no entries', () => {
    expect(mealTypeBreakdown([])).toEqual([])
  })
})

describe('macroSplit — 4/4/9 energy split, 2-decimal', () => {
  it('computes the classic 30/40/30-ish split', () => {
    // protein 150g=600, carbs 200g=800, fat 67g=603 → total 2003
    const s = macroSplit({ proteinG: 150, carbsG: 200, fatG: 67 })
    expect(s.proteinPct).toBe(29.96)
    expect(s.carbsPct).toBe(39.94)
    expect(s.fatPct).toBe(30.1)
  })

  it('sums to ~100 within rounding', () => {
    const s = macroSplit({ proteinG: 88, carbsG: 120, fatG: 30 })
    const sum = (s.proteinPct ?? 0) + (s.carbsPct ?? 0) + (s.fatPct ?? 0)
    expect(Math.abs(sum - 100)).toBeLessThan(0.05)
  })

  it('null when no macros can produce energy — no fake 0%', () => {
    expect(macroSplit({ proteinG: 0, carbsG: 0, fatG: 0 })).toEqual({ proteinPct: null, carbsPct: null, fatPct: null })
    expect(macroSplit({ proteinG: -5, carbsG: 0, fatG: 0 })).toEqual({ proteinPct: null, carbsPct: null, fatPct: null })
  })
})

describe('meal type meta', () => {
  it('validates and falls back to snack for unknown keys', () => {
    expect(isMealType('breakfast')).toBe(true)
    expect(isMealType('brunch')).toBe(false)
    expect(mealTypeMeta('breakfast').label).toBe('Breakfast')
    expect(mealTypeMeta('brunch').label).toBe('Snack')
  })
})

describe('mergeDailyNutrition — meals + manual rows, both sources visible', () => {
  it('sums both sources on a day that has each', () => {
    const [row] = mergeDailyNutrition(
      [{ iso: '2026-09-20', proteinG: 30, caloriesKcal: 400 }],
      [{ iso: '2026-09-20', proteinG: 45, caloriesKcal: 900 }],
    )
    expect(row).toEqual({
      iso: '2026-09-20',
      proteinG: 75,
      caloriesKcal: 1300,
      manualProteinG: 30,
      manualCaloriesKcal: 400,
      mealProteinG: 45,
      mealCaloriesKcal: 900,
    })
  })

  it('returns the union of days, sorted by date', () => {
    const rows = mergeDailyNutrition(
      [{ iso: '2026-09-22', proteinG: 10, caloriesKcal: 100 }],
      [
        { iso: '2026-09-21', proteinG: 20, caloriesKcal: 200 },
        { iso: '2026-09-20', proteinG: 30, caloriesKcal: 300 },
      ],
    )
    expect(rows.map((r) => r.iso)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22'])
  })

  it('keeps a meal-only day (the bug: it used to vanish from history)', () => {
    const [row] = mergeDailyNutrition([], [{ iso: '2026-09-20', proteinG: 45, caloriesKcal: 900 }])
    expect(row.proteinG).toBe(45)
    expect(row.manualProteinG).toBeNull()
    expect(row.mealProteinG).toBe(45)
  })

  it('leaves a combined field null when NEITHER source logged it', () => {
    // manual row carried calories only; no meals that day → protein is "not logged"
    const [row] = mergeDailyNutrition([{ iso: '2026-09-20', proteinG: null, caloriesKcal: 1800 }], [])
    expect(row.proteinG).toBeNull()
    expect(row.caloriesKcal).toBe(1800)
  })

  it('treats a zero meal sum as no meal data, not as a logged zero', () => {
    const [row] = mergeDailyNutrition([], [{ iso: '2026-09-20', proteinG: 0, caloriesKcal: 0 }])
    expect(row.proteinG).toBeNull()
    expect(row.caloriesKcal).toBeNull()
  })

  it('quick-adds must build on the MANUAL base, never the combined total', () => {
    // a chip worth +24 g on a day with 45 g of meals and 30 g of quick-adds
    const [row] = mergeDailyNutrition(
      [{ iso: '2026-09-20', proteinG: 30, caloriesKcal: 400 }],
      [{ iso: '2026-09-20', proteinG: 45, caloriesKcal: 900 }],
    )
    const nextManual = (row.manualProteinG ?? 0) + 24
    expect(nextManual).toBe(54) // NOT 99 — the meal log is not re-counted
    // and the day total moves by exactly the chip value
    expect(nextManual + row.mealProteinG).toBe(row.proteinG! + 24)
  })
})

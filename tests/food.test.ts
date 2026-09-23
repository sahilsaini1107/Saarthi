import { describe, expect, it } from 'vitest'
import {
  composePlate,
  energyMismatch,
  formatMilli,
  formatQuantity,
  isFoodCategory,
  isFoodUnit,
  isProteinTier,
  parseQuantityMilli,
  perServing,
  scaleFactor,
  scaleFood,
  sumMacros,
  toWholeGrams,
  type FoodLike,
} from '@/lib/food'

/** 100 g roasted chana: 20 g protein, 61 g carbs, 5 g fat, 364 kcal. */
const chana: FoodLike = {
  unit: 'g',
  basisQty: 100,
  caloriesMilliKcal: 364_000,
  proteinMilliG: 20_000,
  carbsMilliG: 61_000,
  fatMilliG: 5_000,
  fiberMilliG: 17_000,
}

/** 100 g curd: 11 g protein-ish dairy numbers. */
const curd: FoodLike = {
  unit: 'g',
  basisQty: 100,
  caloriesMilliKcal: 60_000,
  proteinMilliG: 3_500,
  carbsMilliG: 4_700,
  fatMilliG: 3_300,
  fiberMilliG: 0,
}

const roti: FoodLike = {
  unit: 'piece',
  basisQty: 1,
  caloriesMilliKcal: 104_000,
  proteinMilliG: 3_100,
  carbsMilliG: 18_000,
  fatMilliG: 2_400,
  fiberMilliG: 2_000,
}

describe('scaleFactor', () => {
  it('halves a per-100 g food at 50 g', () => {
    expect(scaleFactor(chana, 50_000)).toBe(0.5)
  })

  it('doubles a per-piece food at 2 pieces', () => {
    expect(scaleFactor(roti, 2_000)).toBe(2)
  })

  it('returns 0 for a non-positive quantity rather than a bogus scale', () => {
    expect(scaleFactor(chana, 0)).toBe(0)
    expect(scaleFactor(chana, -5_000)).toBe(0)
  })

  it('returns 0 rather than Infinity when the basis is broken', () => {
    expect(scaleFactor({ ...chana, basisQty: 0 }, 50_000)).toBe(0)
  })
})

describe('scaleFood — the "50 g of my configured chana" case', () => {
  it('scales every macro to the portion', () => {
    expect(scaleFood(chana, 50_000)).toEqual({
      caloriesMilliKcal: 182_000,
      proteinMilliG: 10_000,
      carbsMilliG: 30_500,
      fatMilliG: 2_500,
      fiberMilliG: 8_500,
    })
  })

  it('keeps sub-gram precision exact (30 g of a 20.5 g/100 g food)', () => {
    const scaled = scaleFood({ ...chana, proteinMilliG: 20_500 }, 30_000)
    expect(scaled.proteinMilliG).toBe(6_150) // 6.15 g, not 6
  })

  it('treats a missing fiber figure as zero, never NaN', () => {
    const scaled = scaleFood({ ...chana, fiberMilliG: null }, 50_000)
    expect(scaled.fiberMilliG).toBe(0)
  })

  it('zeroes out on a zero portion', () => {
    expect(scaleFood(chana, 0).proteinMilliG).toBe(0)
  })
})

describe('sumMacros', () => {
  it('adds portions together', () => {
    const total = sumMacros([scaleFood(chana, 50_000), scaleFood(curd, 200_000)])
    expect(total.proteinMilliG).toBe(10_000 + 7_000)
    expect(total.caloriesMilliKcal).toBe(182_000 + 120_000)
  })

  it('is zero for an empty plate', () => {
    expect(sumMacros([])).toEqual({
      caloriesMilliKcal: 0,
      proteinMilliG: 0,
      carbsMilliG: 0,
      fatMilliG: 0,
      fiberMilliG: 0,
    })
  })
})

describe('composePlate — 50 g chana + 200 g curd, the user’s example', () => {
  const plate = composePlate([
    { food: chana, quantityMilli: 50_000 },
    { food: curd, quantityMilli: 200_000 },
  ])

  it('reports the combined total', () => {
    expect(plate.total.proteinMilliG).toBe(17_000) // 10 g + 7 g
    expect(plate.total.caloriesMilliKcal).toBe(302_000) // 182 + 120 kcal
    expect(plate.total.carbsMilliG).toBe(30_500 + 9_400)
    expect(plate.total.fatMilliG).toBe(2_500 + 6_600)
  })

  it('rounds to whole grams only at the save boundary', () => {
    expect(toWholeGrams(plate.total)).toEqual({
      caloriesKcal: 302,
      proteinG: 17,
      carbsG: 40,
      fatG: 9,
      fiberG: 9,
    })
  })

  it('attributes each ingredient’s share of the calories', () => {
    expect(plate.parts[0].caloriePct).toBe(60.3)
    expect(plate.parts[1].caloriePct).toBe(39.7)
  })

  it('defaults to one serving, so per-serving equals the total', () => {
    expect(plate.servings).toBe(1)
    expect(plate.perServing).toEqual(plate.total)
  })

  it('splits across servings when the plate feeds more than one', () => {
    const shared = composePlate(
      [
        { food: chana, quantityMilli: 50_000 },
        { food: curd, quantityMilli: 200_000 },
      ],
      2,
    )
    expect(shared.perServing.proteinMilliG).toBe(8_500)
    expect(shared.total.proteinMilliG).toBe(17_000) // the total is what was cooked
  })

  it('leaves caloriePct null on a zero-calorie plate instead of dividing by zero', () => {
    const empty = composePlate([{ food: { ...chana, caloriesMilliKcal: 0 }, quantityMilli: 50_000 }])
    expect(empty.parts[0].caloriePct).toBeNull()
  })

  it('handles an empty plate', () => {
    const empty = composePlate([])
    expect(empty.total.proteinMilliG).toBe(0)
    expect(empty.parts).toEqual([])
  })
})

describe('perServing', () => {
  it('falls back to 1 for nonsense serving counts', () => {
    const total = scaleFood(chana, 100_000)
    expect(perServing(total, 0)).toEqual(total)
    expect(perServing(total, -3)).toEqual(total)
    expect(perServing(total, Number.NaN)).toEqual(total)
  })

  it('floors a fractional serving count', () => {
    const total = scaleFood(chana, 100_000)
    expect(perServing(total, 2.9).proteinMilliG).toBe(10_000)
  })
})

describe('formatting & parsing', () => {
  it('trims trailing zeros', () => {
    expect(formatMilli(20_000)).toBe('20')
    expect(formatMilli(20_500)).toBe('20.5')
    expect(formatMilli(6_150)).toBe('6.15')
    expect(formatMilli(0)).toBe('0')
  })

  it('formats a quantity in the food’s unit', () => {
    expect(formatQuantity(50_000, 'g')).toBe('50 g')
    expect(formatQuantity(2_000, 'piece')).toBe('2 pc')
    expect(formatQuantity(250_000, 'ml')).toBe('250 ml')
  })

  it('parses a typed quantity, refusing anything non-positive', () => {
    expect(parseQuantityMilli('50')).toBe(50_000)
    expect(parseQuantityMilli(' 1.5 ')).toBe(1_500)
    expect(parseQuantityMilli('0')).toBeNull()
    expect(parseQuantityMilli('-2')).toBeNull()
    expect(parseQuantityMilli('abc')).toBeNull()
    expect(parseQuantityMilli('')).toBeNull()
  })
})

describe('enum guards', () => {
  it('recognises the supported units, categories and tiers', () => {
    expect(isFoodUnit('g')).toBe(true)
    expect(isFoodUnit('cups')).toBe(false)
    expect(isFoodCategory('dal')).toBe(true)
    expect(isFoodCategory('dessert')).toBe(false)
    expect(isProteinTier('S')).toBe(true)
    expect(isProteinTier('Z')).toBe(false)
  })
})

describe('energyMismatch — advisory 4/4/9 sanity check', () => {
  it('passes a food whose macros explain its calories', () => {
    expect(energyMismatch(chana)).toBeNull()
  })

  it('flags calories that the macros cannot explain', () => {
    expect(energyMismatch({ ...chana, caloriesMilliKcal: 900_000 })).toMatch(/re-check/)
  })

  it('flags macros entered without any calories', () => {
    expect(energyMismatch({ ...chana, caloriesMilliKcal: 0 })).toMatch(/calories are set to 0/)
  })

  it('stays quiet on a genuinely empty food', () => {
    expect(
      energyMismatch({ unit: 'g', basisQty: 100, caloriesMilliKcal: 0, proteinMilliG: 0, carbsMilliG: 0, fatMilliG: 0 }),
    ).toBeNull()
  })
})

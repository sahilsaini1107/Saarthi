import { describe, expect, it } from 'vitest'
import {
  fatLossCalories,
  isBodyGoal,
  lookupBracket,
  strengthProtein,
  suggestTargets,
  FAT_LOSS_CALORIE_TABLE,
  STRENGTH_PROTEIN_TABLE,
} from '@/lib/coach-targets'

describe('bracket tables are well formed', () => {
  it('covers 50–100 kg with no gaps or overlaps', () => {
    for (const table of [FAT_LOSS_CALORIE_TABLE, STRENGTH_PROTEIN_TABLE]) {
      expect(table[0].minKg).toBe(50)
      expect(table[table.length - 1].maxKg).toBe(100)
      for (let i = 1; i < table.length; i++) {
        expect(table[i].minKg).toBe(table[i - 1].maxKg)
      }
    }
  })

  it('increases monotonically with body weight', () => {
    for (const table of [FAT_LOSS_CALORIE_TABLE, STRENGTH_PROTEIN_TABLE]) {
      for (let i = 1; i < table.length; i++) {
        expect(table[i].value).toBeGreaterThan(table[i - 1].value)
      }
    }
  })
})

describe('lookupBracket', () => {
  it('finds the bracket a weight falls in', () => {
    expect(fatLossCalories(72)).toEqual({ value: 1700, bracketLabel: '70–75 kg', extrapolated: false })
    expect(strengthProtein(72)).toEqual({ value: 130, bracketLabel: '70–75 kg', extrapolated: false })
  })

  it('treats each lower bound as inclusive and each upper bound as exclusive', () => {
    expect(fatLossCalories(70)?.value).toBe(1700)
    expect(fatLossCalories(74.99)?.value).toBe(1700)
    expect(fatLossCalories(75)?.value).toBe(1800)
  })

  it('clamps below the table and says so', () => {
    const hit = fatLossCalories(46)
    expect(hit).toEqual({ value: 1300, bracketLabel: '50–55 kg', extrapolated: true })
  })

  it('clamps above the table and says so', () => {
    const hit = strengthProtein(120)
    expect(hit).toEqual({ value: 180, bracketLabel: '95–100 kg', extrapolated: true })
  })

  it('refuses nonsense weights', () => {
    expect(fatLossCalories(0)).toBeNull()
    expect(fatLossCalories(-70)).toBeNull()
    expect(fatLossCalories(Number.NaN)).toBeNull()
    expect(lookupBracket([], 70)).toBeNull()
  })
})

describe('suggestTargets', () => {
  it('uses the table directly for fat loss', () => {
    const s = suggestTargets(72, 'fat_loss')!
    expect(s.calorieTarget).toBe(1700)
    expect(s.proteinTargetG).toBe(130)
    expect(s.weeklyChangeG).toBeLessThan(0)
    expect(s.rationale).toContain('70–75 kg')
  })

  it('adds back ~15% to maintain and ~30% to lean bulk', () => {
    expect(suggestTargets(72, 'maintain')!.calorieTarget).toBe(1960) // 1700 × 1.15 → 1955 → 1960
    expect(suggestTargets(72, 'lean_bulk')!.calorieTarget).toBe(2210) // 1700 × 1.30 = 2210
  })

  it('holds protein high on every goal — muscle is most at risk while cutting', () => {
    const p = [suggestTargets(72, 'fat_loss')!, suggestTargets(72, 'maintain')!, suggestTargets(72, 'lean_bulk')!]
    expect(new Set(p.map((x) => x.proteinTargetG)).size).toBe(1)
  })

  it('orders the three goals consistently', () => {
    const cut = suggestTargets(80, 'fat_loss')!.calorieTarget
    const hold = suggestTargets(80, 'maintain')!.calorieTarget
    const bulk = suggestTargets(80, 'lean_bulk')!.calorieTarget
    expect(cut).toBeLessThan(hold)
    expect(hold).toBeLessThan(bulk)
  })

  it('targets a lean-bulk pace of 0.25 kg/week', () => {
    expect(suggestTargets(72, 'lean_bulk')!.weeklyChangeG).toBe(250)
    expect(suggestTargets(72, 'maintain')!.weeklyChangeG).toBe(0)
  })

  it('propagates the extrapolated flag from either table', () => {
    expect(suggestTargets(120, 'fat_loss')!.extrapolated).toBe(true)
    expect(suggestTargets(72, 'fat_loss')!.extrapolated).toBe(false)
  })

  it('returns null for a nonsense weight', () => {
    expect(suggestTargets(0, 'fat_loss')).toBeNull()
  })

  it('guards the goal enum', () => {
    expect(isBodyGoal('lean_bulk')).toBe(true)
    expect(isBodyGoal('keto')).toBe(false)
  })
})

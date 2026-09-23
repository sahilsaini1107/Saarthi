// Smoke test: the whole lib layer imports cleanly and key invariants hold.
import { describe, expect, it } from 'vitest'
import * as money from '@/lib/money'
import * as date from '@/lib/date'
import * as fd from '@/lib/fd'
import * as recurrence from '@/lib/recurrence'
import { DEFAULT_CATEGORIES } from '@/lib/constants'
import { maturityAmountPaise } from '@/lib/fd'

describe('smoke: lib layer integrity', () => {
  it('all lib modules expose their public API', () => {
    expect(typeof money.formatINR).toBe('function')
    expect(typeof date.todayISO).toBe('function')
    expect(typeof fd.maturityAmountPaise).toBe('function')
    expect(typeof recurrence.advanceDue).toBe('function')
  })

  it('cross-module invariant: ₹1,00,000 @ 7% quarterly 1y = formatted ₹1,07,185.90', () => {
    const paise = maturityAmountPaise(10_000_000, 7, 12, 'quarterly')
    expect(money.formatINR(paise)).toBe('₹1,07,185.90')
  })

  it('default categories are complete and unique (task 1.4)', () => {
    const names = DEFAULT_CATEGORIES.map((c) => c.name)
    expect(names).toHaveLength(12)
    expect(new Set(names).size).toBe(12)
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === 'income').map((c) => c.name)).toEqual(['Income'])
  })
})

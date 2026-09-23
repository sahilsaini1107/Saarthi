import { describe, expect, it } from 'vitest'
import {
  detectCaptureDirection,
  extractCaptureNote,
  guessCategoryId,
  parseCaptureAmount,
  parseCaptureDate,
  parseCaptureText,
} from '@/lib/capture'

// Fixed "today" for all date tests: 2026-09-06 is a Sunday.
const TODAY = new Date('2026-09-06T00:00:00.000Z')

describe('parseCaptureAmount', () => {
  it('parses plain and grouped numbers', () => {
    expect(parseCaptureAmount('spent 250')).toBe(25_000)
    expect(parseCaptureAmount('1234')).toBe(123_400)
    expect(parseCaptureAmount('₹1234.50')).toBe(123_450)
    expect(parseCaptureAmount('1,23,456.78')).toBe(1_23_45_678)
    expect(parseCaptureAmount('1,234,567')).toBe(123_456_700)
  })

  it('parses Rs. prefixes and /- suffixes', () => {
    expect(parseCaptureAmount('Rs. 250')).toBe(25_000)
    expect(parseCaptureAmount('rs 99/-')).toBe(9_900)
    expect(parseCaptureAmount('INR 1500 paid')).toBe(150_000)
  })

  it('parses scale suffixes', () => {
    expect(parseCaptureAmount('spent 1.5k on books')).toBe(150_000)
    expect(parseCaptureAmount('2k auto rides')).toBe(200_000)
    expect(parseCaptureAmount('salary 1.2 lakh')).toBe(12_000_000)
    expect(parseCaptureAmount('worth 1.5 cr')).toBe(15_000_000_00)
    expect(parseCaptureAmount('bonus 2.4L credited')).toBe(24_000_000)
  })

  it('rejects non-amounts and non-positives', () => {
    expect(parseCaptureAmount('no numbers here')).toBeNull()
    expect(parseCaptureAmount('0')).toBeNull()
    expect(parseCaptureAmount('')).toBeNull()
  })
})

describe('parseCaptureDate', () => {
  it('relative words', () => {
    expect(parseCaptureDate('spent today', TODAY)).toBe('2026-09-06')
    expect(parseCaptureDate('paid yesterday', TODAY)).toBe('2026-09-05')
    expect(parseCaptureDate('day before yesterday chai', TODAY)).toBe('2026-09-04')
    expect(parseCaptureDate('last night dinner', TODAY)).toBe('2026-09-05')
  })

  it('weekday phrases', () => {
    // 2026-09-06 is a Sunday
    expect(parseCaptureDate('on friday', TODAY)).toBe('2026-09-04')
    expect(parseCaptureDate('last friday', TODAY)).toBe('2026-09-04')
    expect(parseCaptureDate('monday', TODAY)).toBe('2026-08-31')
    expect(parseCaptureDate('on sunday', TODAY)).toBe('2026-09-06')
    expect(parseCaptureDate('last sunday', TODAY)).toBe('2026-08-30')
  })

  it('day-month with and without year', () => {
    expect(parseCaptureDate('5 aug', TODAY)).toBe('2026-08-05')
    expect(parseCaptureDate('5th August 2025', TODAY)).toBe('2025-08-05')
    expect(parseCaptureDate('Aug 5', TODAY)).toBe('2026-08-05')
    expect(parseCaptureDate('bought on 12 sep', TODAY)).toBe('2025-09-12') // future without year → most recent past
    // future without a year → most recent PAST occurrence
    expect(parseCaptureDate('1 jan', TODAY)).toBe('2026-01-01')
    expect(parseCaptureDate('december 31', TODAY)).toBe('2025-12-31')
  })

  it('numeric dates follow the DD/MM convention', () => {
    expect(parseCaptureDate('on 5/9', TODAY)).toBe('2026-09-05')
    expect(parseCaptureDate('5-9-2026', TODAY)).toBe('2026-09-05')
    expect(parseCaptureDate('25/12/2025', TODAY)).toBe('2025-12-25')
    // impossible DD/MM → treated as MM/DD
    expect(parseCaptureDate('12/25/2025', TODAY)).toBe('2025-12-25')
  })

  it('ISO dates and fallback to null', () => {
    expect(parseCaptureDate('on 2026-09-01', TODAY)).toBe('2026-09-01')
    expect(parseCaptureDate('nothing datelike', TODAY)).toBeNull()
  })
})

describe('detectCaptureDirection', () => {
  it('expense words', () => {
    expect(detectCaptureDirection('spent 250 on food')).toBe('out')
    expect(detectCaptureDirection('account debited by 500')).toBe('out')
    expect(detectCaptureDirection('paid the electricity bill')).toBe('out')
    expect(detectCaptureDirection('withdrew 2000')).toBe('out')
  })

  it('income words', () => {
    expect(detectCaptureDirection('received 5000 from rahul')).toBe('in')
    expect(detectCaptureDirection('salary credited')).toBe('in')
    expect(detectCaptureDirection('refund of 499 received')).toBe('in')
    expect(detectCaptureDirection('got cashback 50')).toBe('in')
  })

  it('ties and silence → null', () => {
    expect(detectCaptureDirection('chai 40')).toBeNull()
    expect(detectCaptureDirection('received then spent')).toBeNull()
  })
})

describe('extractCaptureNote', () => {
  it('prefers quoted spans', () => {
    expect(extractCaptureNote('paid "Chai point" 40', 4_000, '2026-09-06')).toBe('Chai point')
  })

  it('drops amount/date/keywords and filler words', () => {
    expect(extractCaptureNote('spent 250 on swiggy yesterday', 25_000, '2026-09-05')).toBe('swiggy')
    expect(extractCaptureNote('₹1,234 at Decathlon', 123_400, '2026-09-06')).toBe('decathlon')
    expect(extractCaptureNote('auto fare 45', 4_500, '2026-09-06')).toBe('auto fare')
  })

  it('returns null when nothing remains', () => {
    expect(extractCaptureNote('spent 250 yesterday', 25_000, '2026-09-05')).toBeNull()
  })
})

describe('parseCaptureText (end to end)', () => {
  it('a typical spoken expense', () => {
    const d = parseCaptureText('spent 250 on swiggy yesterday', TODAY)
    expect(d.amountPaise).toBe(25_000)
    expect(d.direction).toBe('out')
    expect(d.dateISO).toBe('2026-09-05')
    expect(d.note).toBe('swiggy')
    expect(d.matched).toEqual({ amount: true, direction: true, date: true, note: true })
    expect(d.confidence).toBe(1)
  })

  it('bank SMS', () => {
    const d = parseCaptureText('Rs 1,250 debited from HDFC a/c xx123 on 04-09-26 for Amazon purchase', TODAY)
    expect(d.amountPaise).toBe(125_000)
    expect(d.direction).toBe('out')
  })

  it('income without date falls back to today', () => {
    const d = parseCaptureText('received 5000 salary', TODAY)
    expect(d.direction).toBe('in')
    expect(d.amountPaise).toBe(500_000)
    expect(d.dateISO).toBe('2026-09-06')
    expect(d.matched.date).toBe(false)
  })

  it('no amount → null fields, still a usable draft', () => {
    const d = parseCaptureText('coffee with team', TODAY)
    expect(d.amountPaise).toBeNull()
    expect(d.direction).toBeNull()
    expect(d.confidence).toBeLessThan(0.5)
  })
})

describe('guessCategoryId', () => {
  const cats = [
    { id: 'c-food', name: 'Food', kind: 'expense' },
    { id: 'c-travel', name: 'Transport', kind: 'expense' },
    { id: 'c-income', name: 'Income', kind: 'income' },
    { id: 'c-other', name: 'Other', kind: 'expense' },
  ]

  it('matches category names inside the note', () => {
    expect(guessCategoryId('swiggy food order', 'out', cats)).toBe('c-food')
  })

  it('keyword hints map to default categories', () => {
    expect(guessCategoryId('uber ride to office', 'out', cats)).toBe('c-travel')
  })

  it('income direction without note → income category', () => {
    expect(guessCategoryId(null, 'in', cats)).toBe('c-income')
  })

  it('no match → null (never invents)', () => {
    expect(guessCategoryId('xyzzy', 'out', cats)).toBeNull()
    expect(guessCategoryId(null, 'out', cats)).toBeNull()
  })
})

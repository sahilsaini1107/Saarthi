import { describe, expect, it } from 'vitest'
import {
  csvDraftRows,
  detectCsvMapping,
  duplicateKey,
  parseCsv,
  parseCsvAmount,
  parseCsvDate,
  planImport,
} from '@/lib/csv'

describe('parseCsv', () => {
  it('plain rows and trailing newline', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('quoted fields with commas, quotes and newlines', () => {
    const rows = parseCsv('name,note\n"Swiggy, order 123","said ""ok"""\n"multi\nline",x\n')
    expect(rows[1]).toEqual(['Swiggy, order 123', 'said "ok"'])
    expect(rows[2]).toEqual(['multi\nline', 'x'])
  })

  it('drops fully empty lines', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('parseCsvAmount', () => {
  it('plain, grouped and currency-marked amounts', () => {
    expect(parseCsvAmount('1234.50')).toBe(123_450)
    expect(parseCsvAmount('1,23,456.78')).toBe(1_23_45_678)
    expect(parseCsvAmount('₹1,234')).toBe(123_400)
    expect(parseCsvAmount('Rs 99')).toBe(9_900)
  })

  it('CR/DR, parentheses and minus signs', () => {
    expect(parseCsvAmount('250.00 CR')).toBe(25_000)
    expect(parseCsvAmount('250 DR')).toBe(-25_000)
    expect(parseCsvAmount('(500.00)')).toBe(-50_000)
    expect(parseCsvAmount('-500')).toBe(-50_000)
    expect(parseCsvAmount('500/-')).toBe(50_000)
  })

  it('rejects junk and zero', () => {
    expect(parseCsvAmount('')).toBeNull()
    expect(parseCsvAmount('NA')).toBeNull()
    expect(parseCsvAmount('0')).toBeNull()
    expect(parseCsvAmount('12abc')).toBeNull()
  })
})

describe('parseCsvDate', () => {
  it('all common bank formats', () => {
    expect(parseCsvDate('2026-09-05')).toBe('2026-09-05')
    expect(parseCsvDate('05/09/2026')).toBe('2026-09-05')
    expect(parseCsvDate('5-9-26')).toBe('2026-09-05')
    expect(parseCsvDate('05.09.2026')).toBe('2026-09-05')
    expect(parseCsvDate('05 Sep 2026')).toBe('2026-09-05')
    expect(parseCsvDate('05-Sep-2026')).toBe('2026-09-05')
    expect(parseCsvDate('Sep 05, 2026')).toBe('2026-09-05')
    expect(parseCsvDate('25/12/2025')).toBe('2025-12-25')
    expect(parseCsvDate('12/25/2025')).toBe('2025-12-25') // MM/DD fallback when impossible
  })

  it('rejects impossible dates', () => {
    expect(parseCsvDate('31/02/2026')).toBeNull()
    expect(parseCsvDate('hello')).toBeNull()
    expect(parseCsvDate('')).toBeNull()
  })
})

describe('detectCsvMapping', () => {
  it('header with a single signed amount column', () => {
    const rows = parseCsv('Date,Amount,Narration\n05/09/2026,"1,200.00",Swiggy order')
    const m = detectCsvMapping(rows)
    expect(m).toMatchObject({ skipFirstRow: true, dateCol: 0, amountCol: 1, noteCol: 2, debitCol: null, creditCol: null })
  })

  it('header with separate withdrawal/deposit columns', () => {
    const rows = parseCsv('Txn Date,Withdrawal Amount,Deposit Amount,Remarks\n05/09/2026,"500.00",,"ATM"\n04/09/2026,,"2,500.00","Salary"')
    const m = detectCsvMapping(rows)
    expect(m?.debitCol).toBe(1)
    expect(m?.creditCol).toBe(2)
    expect(m?.noteCol).toBe(3)
  })

  it('withdrawal/deposit columns survive garbage rows (real statements have them)', () => {
    const rows = parseCsv('Date,Narration,Withdrawal Amt,Deposit Amt\n01/09/2026,SWIGGY,"412.00",\n03/09/2026,SALARY,,"45000.00"\nbad-row,x,y,z')
    const m = detectCsvMapping(rows)
    expect(m?.debitCol).toBe(2)
    expect(m?.creditCol).toBe(3)
  })

  it('disambiguates a "debit" amount column from a dr/cr type column', () => {
    const typed = parseCsv('Date,Type,Amount,Details\n05/09/2026,DEBIT,"500.00",ATM')
    const m = detectCsvMapping(typed)
    expect(m?.directionCol).toBe(1)
    expect(m?.amountCol).toBe(2)

    const numeric = parseCsv('Date,Debit,Credit\n05/09/2026,"500.00",""')
    const m2 = detectCsvMapping(numeric)
    expect(m2?.debitCol).toBe(1)
  })

  it('headerless files fall back to content sniffing', () => {
    const rows = parseCsv('05/09/2026,-1200.00,Swiggy order\n04/09/2026,-300.00,Auto')
    const m = detectCsvMapping(rows)
    expect(m).not.toBeNull()
    expect(m?.skipFirstRow).toBe(false)
    expect(m?.dateCol).toBe(0)
    expect(m?.amountCol).toBe(1)
    expect(m?.noteCol).toBe(2)
  })

  it('returns null when there is no money column', () => {
    expect(detectCsvMapping(parseCsv('a,b\nx,y\n'))).toBeNull()
    expect(detectCsvMapping([])).toBeNull()
  })
})

describe('csvDraftRows', () => {
  it('maps a signed-amount statement (negatives = expenses, positives = income)', () => {
    const rows = parseCsv('Date,Amount,Narration\n05/09/2026,"1,200.00",Refund\n04/09/2026,-300.00,Auto ride')
    const m = detectCsvMapping(rows)!
    const out = csvDraftRows(rows, m)
    expect(out[0].draft).toMatchObject({ amountPaise: 120_000, direction: 'in', date: '2026-09-05', note: 'Refund' })
    expect(out[1].draft).toMatchObject({ amountPaise: 30_000, direction: 'out', date: '2026-09-04', note: 'Auto ride' })
  })

  it('all-positive files without a type column refuse to guess direction', () => {
    const rows = parseCsv('Date,Amount,Narration\n05/09/2026,"1,200.00",Swiggy order\n04/09/2026,300.00,Auto ride')
    const m = detectCsvMapping(rows)!
    const out = csvDraftRows(rows, m)
    expect(out[0].error).toContain('Ambiguous direction')
    expect(out[1].error).toContain('Ambiguous direction')
  })

  it('errors per row without stopping the rest', () => {
    const rows = parseCsv('Date,Amount\nbad-date,100\n05/09/2026,-250\n05/09/2026,xyz')
    const m = detectCsvMapping(rows)!
    const out = csvDraftRows(rows, m)
    expect(out[0].error).toContain('Unreadable date')
    expect(out[1].draft?.amountPaise).toBe(25_000)
    expect(out[2].error).toContain('Unreadable amount')
  })

  it('signed-amount with a type column resolves direction', () => {
    const rows = parseCsv('Date,Type,Amount,Details\n05/09/2026,DEBIT,"500.00",ATM\n04/09/2026,CREDIT,"2500.00",Refund')
    const m = detectCsvMapping(rows)!
    const out = csvDraftRows(rows, m)
    expect(out[0].draft).toMatchObject({ direction: 'out', amountPaise: 50_000 })
    expect(out[1].draft).toMatchObject({ direction: 'in', amountPaise: 250_000 })
  })

  it('debit/credit columns with DR suffixes still map correctly', () => {
    const rows = parseCsv('Date,Debit,Credit,Remarks\n05/09/2026,"250.00 DR",,"x"\n04/09/2026,,"1,000.00 CR","y"')
    const m = detectCsvMapping(rows)!
    const out = csvDraftRows(rows, m)
    expect(out[0].draft).toMatchObject({ direction: 'out', amountPaise: 25_000 })
    expect(out[1].draft).toMatchObject({ direction: 'in', amountPaise: 100_000 })
  })
})

describe('duplicate detection', () => {
  it('duplicateKey normalizes the note', () => {
    expect(duplicateKey({ accountId: 'a', date: '2026-09-05', direction: 'out', amountPaise: 100, note: 'Swiggy  ORDER' })).toBe(
      duplicateKey({ accountId: 'a', date: '2026-09-05', direction: 'out', amountPaise: 100, note: 'swiggy order' }),
    )
  })

  it('planImport flags ledger duplicates and in-file repeats', () => {
    const draft = { rowIdx: 0, amountPaise: 100, direction: 'out' as const, date: '2026-09-05' as const, note: 'x', categoryName: null }
    const existing = new Set([duplicateKey({ accountId: 'acc', date: '2026-09-05', direction: 'out', amountPaise: 100, note: 'x' })])
    const plan = planImport([draft, draft, { ...draft, rowIdx: 1, amountPaise: 200 }], existing, 'acc')
    // first copy already sits in the ledger; the repeat hits the same key; new amount creates
    expect(plan.map((p) => p.status)).toEqual(['duplicate', 'duplicate', 'create'])
  })

  it('planImport keeps different dates/amounts distinct', () => {
    const existing = new Set<string>()
    const plan = planImport(
      [
        { rowIdx: 0, amountPaise: 100, direction: 'out', date: '2026-09-05', note: 'x', categoryName: null },
        { rowIdx: 1, amountPaise: 200, direction: 'out', date: '2026-09-05', note: 'x', categoryName: null },
      ],
      existing,
      'acc',
    )
    expect(plan.every((p) => p.status === 'create')).toBe(true)
  })
})

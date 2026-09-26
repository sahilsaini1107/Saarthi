'use client'

// Investment sheet (Phase 1.5): create any instrument (stock, bond, crypto,
// MF, ETF, gold, REIT, PPF, NPS, other) with an optional opening buy; edit
// mode adds price updates, transaction recording and recent activity.

import { useMemo, useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, SectionHeader } from '@/components/ui/saarthi'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  INVESTMENT_TYPE_EMOJI,
  INVESTMENT_TYPE_LABELS,
  INVESTMENT_TYPES,
  type InvestmentType,
} from '@/lib/investments'
import { COUPON_FREQUENCIES, CREDIT_RATINGS, CREDIT_RATING_META, JOB_META, suggestJobForInvestment } from '@/lib/planner'
import { useDeleteInvestment, useRecordInvestmentTxn, useSaveInvestment } from '@/hooks/queries'
import { parseAmountToPaise, formatINRCompact, formatINRSigned, formatINR } from '@/lib/money'
import { PriceHistoryChart } from '@/components/money/price-chart'
import { JobPicker } from '@/components/money/job-picker'
import { todayISO } from '@/lib/date'
import type { InvestmentWithMeta } from '@/services/investments'
import type { InvestmentTxnKind, JobKey } from '@/lib/types'

const TXN_KIND_LABELS: Record<InvestmentTxnKind, string> = {
  buy: 'Buy',
  sell: 'Sell',
  dividend: 'Dividend',
  interest: 'Interest',
}

interface TypeMeta {
  hint: string
  name: string
  symbol: string
  platform: string
  price: string
  pricePlaceholder: string
  qty: string
  opening: string
}

const TYPE_META: Record<InvestmentType, TypeMeta> = {
  stock: {
    hint: 'Direct equity through a broker.',
    name: 'Company / stock name',
    symbol: 'Ticker',
    platform: 'Broker',
    price: 'Current price per share (₹)',
    pricePlaceholder: '2890.50',
    qty: 'Shares',
    opening: 'Use shares bought and total cost.',
  },
  mutual_fund: {
    hint: 'SIP or lump-sum fund units.',
    name: 'Scheme name',
    symbol: 'Scheme code / ISIN',
    platform: 'AMC / app',
    price: 'Current NAV (₹)',
    pricePlaceholder: '156.42',
    qty: 'Units',
    opening: 'Use current units and amount invested.',
  },
  etf: {
    hint: 'Exchange-traded fund units.',
    name: 'ETF name',
    symbol: 'Ticker',
    platform: 'Broker',
    price: 'Current price per unit (₹)',
    pricePlaceholder: '245.80',
    qty: 'Units',
    opening: 'Use units bought and total cost.',
  },
  bond: {
    hint: 'Debt with coupon/rating details.',
    name: 'Bond name',
    symbol: 'ISIN',
    platform: 'Broker / platform',
    price: 'Current clean price per bond (₹)',
    pricePlaceholder: '1000',
    qty: 'Bonds',
    opening: 'Use number of bonds and total invested.',
  },
  crypto: {
    hint: 'Speculative sleeve.',
    name: 'Coin / token',
    symbol: 'Symbol',
    platform: 'Exchange / wallet',
    price: 'Current price per coin (₹)',
    pricePlaceholder: '5800000',
    qty: 'Coins',
    opening: 'Fractional quantities are fine.',
  },
  gold: {
    hint: 'Gold ETF, SGB or digital gold.',
    name: 'Gold instrument',
    symbol: 'Code / ISIN',
    platform: 'Broker / app',
    price: 'Current price per unit (₹)',
    pricePlaceholder: '7200',
    qty: 'Units / grams',
    opening: 'Use units or grams consistently.',
  },
  reit: {
    hint: 'Real-estate trust units.',
    name: 'REIT name',
    symbol: 'Ticker',
    platform: 'Broker',
    price: 'Current price per unit (₹)',
    pricePlaceholder: '380',
    qty: 'Units',
    opening: 'Use units bought and total cost.',
  },
  ppf: {
    hint: 'Long-term tax-efficient savings.',
    name: 'PPF account name',
    symbol: 'Account / reference',
    platform: 'Bank / post office',
    price: 'Current value per unit (₹)',
    pricePlaceholder: '1',
    qty: 'Units',
    opening: 'For balances, use price 1 and quantity = balance.',
  },
  nps: {
    hint: 'Retirement corpus by NAV/units.',
    name: 'NPS tier / scheme',
    symbol: 'PRAN / scheme',
    platform: 'CRA / app',
    price: 'Current NAV (₹)',
    pricePlaceholder: '45.25',
    qty: 'Units',
    opening: 'Use NPS units and total contribution value.',
  },
  other: {
    hint: 'Anything with a unit price.',
    name: 'Investment name',
    symbol: 'Code',
    platform: 'Platform',
    price: 'Current price per unit (₹)',
    pricePlaceholder: '100',
    qty: 'Units',
    opening: 'Use quantity and total cost.',
  },
}

export function InvestmentFormSheet({
  open,
  onOpenChange,
  investment,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  investment?: InvestmentWithMeta | null
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{investment ? investment.name : 'Track an investment'}</DrawerTitle>
          <DrawerDescription>
            {investment ? 'Update details, prices, buys, sells and income.' : 'Choose the instrument first; the form adapts from there.'}
          </DrawerDescription>
        </DrawerHeader>
        {open && <InvestmentForm key={investment?.id ?? 'new'} investment={investment ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function InvestmentForm({ investment, onClose }: { investment: InvestmentWithMeta | null; onClose: () => void }) {
  const { user } = useUi()
  const save = useSaveInvestment({ success: investment ? 'Investment updated' : 'Investment added' })
  const del = useDeleteInvestment({ success: 'Investment removed' })
  const record = useRecordInvestmentTxn({ success: 'Transaction recorded' })

  const [tab, setTab] = useState<'details' | 'activity'>('details')
  const [name, setName] = useState(investment?.name ?? '')
  const [type, setType] = useState<InvestmentType>(investment?.type ?? 'stock')
  const [symbol, setSymbol] = useState(investment?.symbol ?? '')
  const [platform, setPlatform] = useState(investment?.platform ?? '')
  const [job, setJob] = useState<JobKey | null>(investment?.job ?? null)
  const [ratePct, setRatePct] = useState(investment?.ratePct != null ? String(investment.ratePct) : '')
  const [creditRating, setCreditRating] = useState<string>(investment?.creditRating ?? 'none')
  const [maturityDate, setMaturityDate] = useState(investment?.maturityDate ?? '')
  const [couponFrequency, setCouponFrequency] = useState<string>(investment?.couponFrequency ?? 'none')
  const [price, setPrice] = useState(investment ? String(investment.currentPricePaise / 100) : '')
  const [notes, setNotes] = useState(investment?.notes ?? '')
  const [openQty, setOpenQty] = useState('')
  const [openAmount, setOpenAmount] = useState('')
  const [openDate, setOpenDate] = useState(todayISO(user.timezone))

  const [kind, setKind] = useState<InvestmentTxnKind>('buy')
  const [qty, setQty] = useState('')
  const [amount, setAmount] = useState('')
  const [txnDate, setTxnDate] = useState(todayISO(user.timezone))
  const [txnNote, setTxnNote] = useState('')

  const kindIsQty = kind === 'buy' || kind === 'sell'
  const parsedPrice = useMemo(() => parseAmountToPaise(price), [price])
  const detailsValid = name.trim().length > 0 && !!parsedPrice
  const openingValid = Number(openQty) > 0 && !!parseAmountToPaise(openAmount)
  const isBond = type === 'bond'
  const showRate = isBond || type === 'ppf' || type === 'nps'
  const meta = TYPE_META[type]
  const suggestedJob = suggestJobForInvestment(type, creditRating === 'none' ? null : creditRating)
  const parsedRate = parseFloat(ratePct)
  const rateValid = !showRate || ratePct.trim() === '' || (!Number.isNaN(parsedRate) && parsedRate > 0 && parsedRate <= 100)

  function pickType(nextType: InvestmentType) {
    setType(nextType)
    if (!job) setJob(suggestJobForInvestment(nextType, creditRating === 'none' ? null : creditRating))
  }

  function onSave() {
    if (!detailsValid || !parsedPrice || !rateValid) return
    const base = {
      name: name.trim(),
      type,
      symbol: symbol.trim() || null,
      platform: platform.trim() || null,
      job,
      ratePct: showRate && ratePct.trim() !== '' ? parsedRate : null,
      creditRating: isBond && creditRating !== 'none' ? creditRating : null,
      maturityDate: isBond && maturityDate ? maturityDate : null,
      couponFrequency: isBond && couponFrequency !== 'none' ? couponFrequency : null,
      currentPricePaise: parsedPrice,
      notes: notes.trim() || null,
    }
    if (investment) {
      save.mutate({ id: investment.id, ...base }, { onSuccess: onClose })
    } else {
      save.mutate(
        {
          ...base,
          openingBuy: openingValid
            ? { quantity: Number(openQty), amountPaise: parseAmountToPaise(openAmount)!, date: openDate }
            : undefined,
        },
        { onSuccess: onClose },
      )
    }
  }

  function onRecordTxn() {
    if (!investment) return
    const amt = parseAmountToPaise(amount)
    if (!amt) return
    if (kindIsQty && !(Number(qty) > 0)) return
    record.mutate(
      { investmentId: investment.id, kind, quantity: kindIsQty ? Number(qty) : undefined, amountPaise: amt, date: txnDate, note: txnNote.trim() || undefined },
      { onSuccess: () => { setQty(''); setAmount(''); setTxnNote('') } },
    )
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pb-2">
      {investment && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(['details', 'activity'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`h-9 rounded-lg text-sm font-semibold transition-all ${tab === value ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              {value === 'details' ? 'Details' : 'Activity'}
            </button>
          ))}
        </div>
      )}

      {tab === 'details' ? (
        <>
          <section className="rounded-2xl border bg-card p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Investment type</p>
                <p className="text-xs text-muted-foreground">{meta.hint}</p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                {INVESTMENT_TYPE_EMOJI[type]} {INVESTMENT_TYPE_LABELS[type]}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {INVESTMENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => pickType(t)}
                  className={`min-h-14 rounded-xl border px-3 py-2 text-left transition-colors ${type === t ? 'border-primary bg-primary/10 text-primary' : 'bg-background hover:bg-accent'}`}
                >
                  <span className="block text-sm font-semibold">{INVESTMENT_TYPE_EMOJI[t]} {INVESTMENT_TYPE_LABELS[t]}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{TYPE_META[t].hint}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-3.5">
            <SectionHeader title="Basics" />
            <div className="flex flex-col gap-3">
              <Field label={meta.name}>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reliance, BTC, Nifty 50" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={meta.symbol} hint="Optional">
                  <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder={meta.symbol} />
                </Field>
                <Field label={meta.platform} hint="Optional">
                  <Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Zerodha, Groww..." />
                </Field>
              </div>
              <Field label={meta.price}>
                <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={meta.pricePlaceholder} />
              </Field>
              {investment && investment.priceDeltaPaise !== null && (
                <p className={`-mt-1 text-xs font-medium ${investment.priceDeltaPaise >= 0 ? 'text-income' : 'text-expense'}`}>
                  {investment.priceDeltaPaise >= 0 ? '▲' : '▼'} {formatINRCompact(Math.abs(investment.priceDeltaPaise))}
                  {investment.priceDeltaPct !== null ? ` (${investment.priceDeltaPct > 0 ? '+' : ''}${investment.priceDeltaPct}%)` : ''} vs previous recorded price
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-3.5">
            <Field label="Job · what role does this money play?" hint={suggestedJob ? `Suggested: ${JOB_META[suggestedJob].label}` : 'Optional'}>
              <JobPicker value={job} suggested={suggestedJob} onChange={setJob} />
            </Field>
            {type === 'crypto' && (
              <p className="mt-2 rounded-lg bg-warn/10 px-2.5 py-1.5 text-[11px] text-warn">
                Speculative capital: keep it 0-5% of your plan and rebalance when it outgrows the sleeve.
              </p>
            )}
          </section>

          {isBond && (
            <section className="rounded-2xl border bg-card p-3.5">
              <p className="text-sm font-semibold">Bond details</p>
              <p className="mb-3 text-xs text-muted-foreground">Ratings measure credit quality, not certainty.</p>
              <div className="flex flex-col gap-3">
                <Field label="Credit rating">
                  <Select value={creditRating} onValueChange={setCreditRating}>
                    <SelectTrigger className="h-11 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      {CREDIT_RATINGS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {CREDIT_RATING_META[r].label} · {CREDIT_RATING_META[r].tier}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {creditRating !== 'none' && (
                  <p className="rounded-lg bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">{CREDIT_RATING_META[creditRating as keyof typeof CREDIT_RATING_META].note}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Coupon % p.a." hint="e.g. 7.25">
                    <Input inputMode="decimal" value={ratePct} onChange={(e) => setRatePct(e.target.value)} placeholder="7.25" />
                  </Field>
                  <Field label="Coupon frequency">
                    <Select value={couponFrequency} onValueChange={setCouponFrequency}>
                      <SelectTrigger className="h-11 w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not specified</SelectItem>
                        {COUPON_FREQUENCIES.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f.replace('_', ' ')[0].toUpperCase() + f.replace('_', ' ').slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Maturity date" hint="Anchors the coupon calendar">
                  <Input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} className="h-11 rounded-xl" />
                </Field>
              </div>
            </section>
          )}

          {showRate && !isBond && (
            <section className="rounded-2xl border bg-card p-3.5">
              <Field label="Interest rate % p.a." hint="Optional — feeds the income machine">
                <Input inputMode="decimal" value={ratePct} onChange={(e) => setRatePct(e.target.value)} placeholder={type === 'ppf' ? '7.1' : '10'} />
              </Field>
            </section>
          )}
          {!rateValid && <p className="-mt-3 text-xs text-expense">Rate must be between 0 and 100.</p>}

          <section className="rounded-2xl border bg-card p-3.5">
            <Field label="Notes" hint="Optional">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thesis, target, lock-in, allocation rule..." className="min-h-20 rounded-xl" />
            </Field>
          </section>

          {!investment && (
            <section className="rounded-2xl border bg-card p-3.5">
              <p className="text-sm font-semibold">Opening position</p>
              <p className="mb-3 text-xs text-muted-foreground">{meta.opening}</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label={meta.qty}>
                  <Input inputMode="decimal" value={openQty} onChange={(e) => setOpenQty(e.target.value)} placeholder={type === 'crypto' ? '0.025' : '10'} />
                </Field>
                <Field label="Total cost (₹)">
                  <Input inputMode="decimal" value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} placeholder="25000" />
                </Field>
              </div>
              <Field label="Date">
                <Input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} className="h-11 rounded-xl" />
              </Field>
            </section>
          )}

          <Button onClick={onSave} disabled={!detailsValid || !rateValid || save.isPending} className="h-12 shrink-0 rounded-xl text-base font-semibold">
            {save.isPending ? 'Saving...' : investment ? 'Save details' : 'Add investment'}
          </Button>
          {investment && investment.quantity > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Holding {investment.quantity} {investment.symbol ?? meta.qty.toLowerCase()} · avg {formatINR(Math.round(investment.avgCostPaise))}/unit
            </p>
          )}
        </>
      ) : (
        investment && (
          <>
            <section className="rounded-2xl border bg-card p-3.5">
              <SectionHeader title="Price history" />
              {investment.priceHistory.length >= 2 ? (
                <PriceHistoryChart points={investment.priceHistory} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  One point so far. Change the price in Details on a later day and the sparkline starts here.
                </p>
              )}
            </section>

            <section className="rounded-2xl border bg-card p-3.5">
              <SectionHeader title="Record transaction" />
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
                {(Object.keys(TXN_KIND_LABELS) as InvestmentTxnKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`h-8 rounded-lg text-xs font-semibold transition-all ${kind === k ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                  >
                    {TXN_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {kindIsQty && (
                  <Field label={meta.qty}>
                    <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="5" />
                  </Field>
                )}
                <Field label={kindIsQty ? 'Total ₹' : 'Amount ₹'}>
                  <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15000" />
                </Field>
                <Field label="Date">
                  <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} className="h-11 rounded-xl" />
                </Field>
              </div>
              <Field label="Note" hint="Optional">
                <Input value={txnNote} onChange={(e) => setTxnNote(e.target.value)} placeholder="SIP #12, book profits..." />
              </Field>
              <Button variant="outline" onClick={onRecordTxn} disabled={record.isPending || !parseAmountToPaise(amount) || (kindIsQty && !(Number(qty) > 0))} className="h-10 w-full rounded-xl">
                {record.isPending ? 'Recording...' : `Record ${TXN_KIND_LABELS[kind].toLowerCase()}`}
              </Button>
            </section>

            {investment.recentTxns.length > 0 && (
              <section className="rounded-2xl border bg-card p-3.5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</p>
                <div className="flex flex-col gap-1.5">
                  {investment.recentTxns.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                      <div>
                        <span className={`font-semibold ${t.kind === 'buy' ? 'text-expense' : t.kind === 'sell' ? 'text-income' : 'text-primary'}`}>
                          {TXN_KIND_LABELS[t.kind]}
                        </span>
                        {t.quantity > 0 && <span className="ml-1 text-muted-foreground">× {t.quantity}</span>}
                        <span className="ml-2 text-xs text-muted-foreground">{t.date}</span>
                      </div>
                      <span className="font-semibold tabular-nums">{formatINRSigned(t.amountPaise, t.kind === 'buy' ? 'out' : 'in')}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <Button
              variant="ghost"
              onClick={() => {
                if (confirm(`Remove ${investment.name} and its transaction history?`)) {
                  del.mutate(investment.id, { onSuccess: onClose })
                }
              }}
              className="text-expense"
            >
              Remove investment
            </Button>
          </>
        )
      )}
    </div>
  )
}

'use client'

// Investment sheet (Phase 1.5): create any instrument (stock, bond, crypto,
// MF, ETF, gold, REIT, PPF, NPS, other) with an optional opening buy; edit
// mode adds price updates, transaction recording (buy/sell/dividend/interest)
// and the recent-activity list.

import { useMemo, useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Money, SectionHeader } from '@/components/ui/saarthi'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  INVESTMENT_TYPE_LABELS,
  INVESTMENT_TYPES,
} from '@/lib/investments'
import { COUPON_FREQUENCIES, CREDIT_RATINGS, CREDIT_RATING_META, JOB_META, suggestJobForInvestment } from '@/lib/planner'
import { useDeleteInvestment, useRecordInvestmentTxn, useSaveInvestment } from '@/hooks/queries'
import { parseAmountToPaise, formatINRCompact } from '@/lib/money'
import { formatINRSigned, formatINR } from '@/lib/money'
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
            {investment ? 'Update price, record buys/sells or income.' : 'Stocks, bonds, crypto, mutual funds — anything with a unit price.'}
          </DrawerDescription>
        </DrawerHeader>
        {open && (
          <InvestmentForm key={investment?.id ?? 'new'} investment={investment ?? null} onClose={() => onOpenChange(false)} />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function InvestmentForm({ investment, onClose }: { investment: InvestmentWithMeta | null; onClose: () => void }) {
  const { user } = useUi()
  const save = useSaveInvestment({ success: investment ? 'Investment updated' : 'Investment added' })
  const del = useDeleteInvestment({ success: 'Investment removed' })
  const record = useRecordInvestmentTxn({ success: 'Transaction recorded' })

  const [name, setName] = useState(investment?.name ?? '')
  const [type, setType] = useState<string>(investment?.type ?? 'stock')
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

  // record-txn section
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
  const parsedRate = parseFloat(ratePct)
  const rateValid = !showRate || ratePct.trim() === '' || (!Number.isNaN(parsedRate) && parsedRate > 0 && parsedRate <= 100)

  function onSave() {
    if (!detailsValid || !parsedPrice || !rateValid) return
    const base = {
      name: name.trim(),
      type: type as (typeof INVESTMENT_TYPES)[number],
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
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reliance, BTC, Nifty 50" />
        </Field>
        <Field label="Type">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-11 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVESTMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {INVESTMENT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Symbol / code" hint="Optional">
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="RELIANCE, BTC…" />
        </Field>
        <Field label="Platform" hint="Optional">
          <Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Zerodha, CoinDCX…" />
        </Field>
      </div>
      <Field label="Current price per unit (₹)">
        <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="2890.50" />
      </Field>
      {investment && investment.priceDeltaPaise !== null && (
        <p className={`-mt-1 text-xs font-medium ${investment.priceDeltaPaise >= 0 ? 'text-income' : 'text-expense'}`}>
          {investment.priceDeltaPaise >= 0 ? '▲' : '▼'} {formatINRCompact(Math.abs(investment.priceDeltaPaise))}
          {investment.priceDeltaPct !== null ? ` (${investment.priceDeltaPct > 0 ? '+' : ''}${investment.priceDeltaPct}%)` : ''} vs previous recorded price
        </p>
      )}

      <Field label="Job · what role does this money play?" hint={suggestJobForInvestment(type, creditRating === 'none' ? null : creditRating) ? `Suggested: ${JOB_META[suggestJobForInvestment(type, creditRating === 'none' ? null : creditRating)!].label}` : 'Optional'}>
        <JobPicker
          value={job}
          suggested={suggestJobForInvestment(type, creditRating === 'none' ? null : creditRating)}
          onChange={setJob}
        />
      </Field>
      {type === 'crypto' && (
        <p className="-mt-1 rounded-lg bg-warn/10 px-2.5 py-1.5 text-[11px] text-warn">
          🚀 Speculative capital — keep it 0–5% of your plan and rebalance when it outgrows the sleeve.
        </p>
      )}

      {isBond && (
        <div className="rounded-2xl border border-dashed p-3">
          <p className="text-sm font-medium">Bond details</p>
          <p className="mb-2 text-xs text-muted-foreground">Ratings measure credit quality — they don’t eliminate risk.</p>
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
        </div>
      )}

      {showRate && !isBond && (
        <Field label="Interest rate % p.a." hint="Optional — feeds the income machine">
          <Input inputMode="decimal" value={ratePct} onChange={(e) => setRatePct(e.target.value)} placeholder="7.1" />
        </Field>
      )}
      {!rateValid && <p className="-mt-1 text-xs text-expense">Rate must be between 0 and 100.</p>}
      <Field label="Notes" hint="Optional">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thesis, target, anything" />
      </Field>

      {investment && (
        <div>
          <SectionHeader title="Price history" />
          {investment.priceHistory.length >= 2 ? (
            <PriceHistoryChart points={investment.priceHistory} />
          ) : (
            <p className="text-xs text-muted-foreground">
              One point so far. Change the price on a later day and the sparkline starts here.
            </p>
          )}
        </div>
      )}

      {!investment && (
        <div className="rounded-2xl border border-dashed p-3">
          <p className="text-sm font-medium">Opening position (optional)</p>
          <p className="mb-2 text-xs text-muted-foreground">Already hold some? Record the first buy now.</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Quantity">
              <Input inputMode="decimal" value={openQty} onChange={(e) => setOpenQty(e.target.value)} placeholder="10" />
            </Field>
            <Field label="Total cost (₹)">
              <Input inputMode="decimal" value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} placeholder="28905" />
            </Field>
            <Field label="Date">
              <Input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} className="h-11 rounded-xl" />
            </Field>
          </div>
        </div>
      )}

      {investment && (
        <>
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
          <div className="grid grid-cols-3 gap-2">
            {kindIsQty && (
              <Field label="Quantity">
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
            <Input value={txnNote} onChange={(e) => setTxnNote(e.target.value)} placeholder="SIP #12, book profits…" />
          </Field>
          <Button variant="outline" onClick={onRecordTxn} disabled={record.isPending || !parseAmountToPaise(amount) || (kindIsQty && !(Number(qty) > 0))} className="h-10 rounded-xl">
            {record.isPending ? 'Recording…' : `Record ${TXN_KIND_LABELS[kind].toLowerCase()}`}
          </Button>

          {investment.recentTxns.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recent activity</p>
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
          )}

          <Button
            variant="ghost"
            onClick={() => {
              if (confirm(`Remove ${investment.name} and its transaction history?`)) {
                del.mutate(investment.id, { onSuccess: onClose })
              }
            }}
            className="mt-1 text-expense"
          >
            Remove investment
          </Button>
        </>
      )}

      <Button onClick={onSave} disabled={!detailsValid || save.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {save.isPending ? 'Saving…' : investment ? 'Save changes' : 'Add investment'}
      </Button>
      {investment && investment.quantity > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Holding {investment.quantity} {investment.symbol ?? 'units'} · avg {formatINR(Math.round(investment.avgCostPaise))}/unit
        </p>
      )}
    </div>
  )
}

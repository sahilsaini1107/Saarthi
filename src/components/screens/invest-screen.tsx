'use client'

// Invest hub (Phase 1.5): market investments (stocks, bonds, crypto, MFs,
// ETFs, gold, REITs, PPF/NPS…) plus real-world assets — the pieces that make
// net worth whole. Segmented: Investments | Assets.

import { useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { useAssets, useInvestments } from '@/hooks/queries'
import { InvestmentFormSheet } from '@/components/money/investment-form-sheet'
import { AssetFormSheet } from '@/components/money/asset-form-sheet'
import { PriceSparkline } from '@/components/money/price-chart'
import { EmptyState, ErrorCard, Money, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { Button } from '@/components/ui/button'
import { INVESTMENT_TYPE_EMOJI, INVESTMENT_TYPE_LABELS } from '@/lib/investments'
import { allocationByType } from '@/lib/portfolio'
import { ASSET_CATEGORY_LABELS } from '@/lib/constants'
import { formatINRCompact } from '@/lib/money'
import { formatDayLabel } from '@/lib/date'
import { Plus } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import type { InvestmentWithMeta } from '@/services/investments'
import type { AssetWithMeta } from '@/services/assets'
import type { AssetCategory } from '@/lib/types'

// design-system-adjacent palette (no blue/indigo, per theme rules)
const ALLOCATION_PALETTE = ['#0D9488', '#16A34A', '#F59E0B', '#8B5CF6', '#EF4444', '#F97316', '#F43F5E', '#84CC16', '#D946EF', '#64748B']

type Tab = 'investments' | 'assets'

export function InvestScreen() {
  const { navigate } = useUi()
  const [tab, setTab] = useState<Tab>('investments')
  const investments = useInvestments()
  const assets = useAssets()
  const [invSheet, setInvSheet] = useState<{ open: boolean; inv: InvestmentWithMeta | null }>({ open: false, inv: null })
  const [assetSheet, setAssetSheet] = useState<{ open: boolean; asset: AssetWithMeta | null }>({ open: false, asset: null })

  if (investments.isLoading || assets.isLoading) return <SkeletonRow />
  if (investments.isError) return <ErrorCard message={(investments.error as Error).message} onRetry={() => investments.refetch()} />
  if (assets.isError) return <ErrorCard message={(assets.error as Error).message} onRetry={() => assets.refetch()} />

  const invs = investments.data ?? []
  const asts = assets.data ?? []

  // only open positions drive "invested" basis; total value includes everything held
  const openInvs = invs.filter((i) => i.quantity > 0)
  const marketValue = openInvs.reduce((s, i) => s + i.marketValuePaise, 0)
  const invested = openInvs.reduce((s, i) => s + i.investedPaise, 0)
  const unrealized = marketValue - invested
  const realized = invs.reduce((s, i) => s + i.realizedPnlPaise, 0)
  const income = invs.reduce((s, i) => s + i.incomePaise, 0)
  const assetValue = asts.reduce((s, a) => s + a.currentValuePaise, 0)
  const assetGain = asts.reduce((s, a) => s + (a.gainPaise ?? 0), 0)
  const allocation = allocationByType(openInvs.map((i) => ({ type: i.type, valuePaise: i.marketValuePaise })))

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between px-1">
        <button type="button" onClick={() => navigate('/money')} className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Back">
          ← Money
        </button>
        <Button
          size="sm"
          className="h-9 rounded-full"
          onClick={() => (tab === 'investments' ? setInvSheet({ open: true, inv: null }) : setAssetSheet({ open: true, asset: null }))}
        >
          <Plus className="size-4" /> {tab === 'investments' ? 'Add investment' : 'Add asset'}
        </Button>
      </header>

      <h1 className="-mt-1 px-1 text-2xl font-bold tracking-tight">Investments & assets</h1>

      {/* segmented control */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Invest section">
        {(['investments', 'assets'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-9 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            {t === 'investments' ? '📈 Market' : '🏠 Real assets'}
          </button>
        ))}
      </div>

      {tab === 'investments' && (
        <>
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Market value ({openInvs.length} holding{openInvs.length === 1 ? '' : 's'})</p>
                <Money paise={marketValue} className="text-2xl font-bold" />
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${unrealized >= 0 ? 'text-income' : 'text-expense'}`}>
                  {unrealized >= 0 ? '+' : ''}
                  {formatINRCompact(unrealized)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {invested > 0 ? `${unrealized >= 0 ? '+' : ''}${Math.round((unrealized / invested) * 100)}% unrealised` : 'no open positions'}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Realised P&L</p>
                <p className={`font-semibold ${realized >= 0 ? 'text-income' : 'text-expense'}`}>
                  {realized >= 0 ? '+' : ''}
                  {formatINRCompact(realized)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dividends & interest</p>
                <p className="font-semibold text-income">+{formatINRCompact(income)}</p>
              </div>
            </div>
          </section>

          {allocation.length > 0 && (
            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <p className="mb-2 px-1 text-sm font-semibold">Allocation</p>
              <div className="flex items-center gap-4">
                <div className="relative h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={allocation} dataKey="valuePaise" nameKey="label" innerRadius="62%" outerRadius="88%" paddingAngle={2} strokeWidth={0}>
                        {allocation.map((s, i) => (
                          <Cell key={s.type} fill={ALLOCATION_PALETTE[i % ALLOCATION_PALETTE.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-[10px] text-muted-foreground">{openInvs.length} held</p>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {allocation.map((s, i) => (
                    <div key={s.type}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-1 truncate">
                          <span aria-hidden>{s.emoji}</span> {s.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {s.pct}% · {formatINRCompact(s.valuePaise)}
                        </span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: ALLOCATION_PALETTE[i % ALLOCATION_PALETTE.length] }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {invs.length === 0 ? (
            <EmptyState
              emoji="📈"
              title="No investments tracked"
              body="Add stocks, bonds, crypto, mutual funds — anything with a unit price. Buys, sells, dividends and P&L are computed for you."
              action={
                <Button size="sm" className="mt-2 rounded-full" onClick={() => setInvSheet({ open: true, inv: null })}>
                  Add your first investment
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {invs.map((inv) => {
                const hasPosition = inv.quantity > 0
                const pnl = inv.unrealizedPaise
                return (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => setInvSheet({ open: true, inv })}
                    className="rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
                          {INVESTMENT_TYPE_EMOJI[inv.type]}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {inv.name}
                            {inv.symbol && <span className="ml-1.5 text-xs font-medium text-muted-foreground">{inv.symbol}</span>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {INVESTMENT_TYPE_LABELS[inv.type]}
                            {inv.platform ? ` · ${inv.platform}` : ''}
                          </p>
                        </div>
                      </div>
                      {hasPosition && pnl !== 0 && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${pnl > 0 ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'}`}>
                          {pnl > 0 ? '+' : ''}
                          {inv.unrealizedPct ?? 0}%
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5 flex items-end justify-between">
                      <div className="min-w-0">
                        {hasPosition ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {inv.quantity} × {formatINRCompact(inv.currentPricePaise)} · avg {formatINRCompact(Math.round(inv.avgCostPaise))}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">No units held{inv.realizedPnlPaise !== 0 ? ' · fully sold' : ''}</p>
                        )}
                        <Money paise={inv.marketValuePaise} className="text-lg font-bold" />
                      </div>
                      {hasPosition && (
                        <p className={`text-sm font-semibold ${pnl >= 0 ? 'text-income' : 'text-expense'}`}>
                          {pnl >= 0 ? '+' : ''}
                          {formatINRCompact(pnl)}
                        </p>
                      )}
                    </div>
                    {hasPosition && inv.priceDeltaPaise !== null && (
                      <div className="mt-2 flex items-end justify-between gap-2 border-t pt-2">
                        <p className={`text-xs font-medium ${inv.priceDeltaPaise >= 0 ? 'text-income' : 'text-expense'}`}>
                          {inv.priceDeltaPaise >= 0 ? '▲' : '▼'} {formatINRCompact(Math.abs(inv.priceDeltaPaise))}
                          {inv.priceDeltaPct !== null ? ` (${inv.priceDeltaPct > 0 ? '+' : ''}${inv.priceDeltaPct}%)` : ''} vs last price
                        </p>
                        <PriceSparkline points={inv.priceHistory} />
                      </div>
                    )}
                  </button>
                )
              })}
              <p className="px-2 pt-1 text-center text-xs text-muted-foreground">
                Tap to update prices, record buys/sells/dividends, or edit. Every price update builds the history sparkline — prices stay manual, your data stays yours.
              </p>
            </div>
          )}
        </>
      )}

      {tab === 'assets' && (
        <>
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Real assets ({asts.length})</p>
                <Money paise={assetValue} className="text-2xl font-bold" />
              </div>
              {asts.some((a) => a.gainPaise !== null) && (
                <p className={`text-sm font-bold ${assetGain >= 0 ? 'text-income' : 'text-expense'}`}>
                  {assetGain >= 0 ? '+' : ''}
                  {formatINRCompact(assetGain)} vs purchase
                </p>
              )}
            </div>
          </section>

          {asts.length === 0 ? (
            <EmptyState
              emoji="🏠"
              title="No assets yet"
              body="Your flat, bike, laptop, jewellery — everything real counts toward net worth. Values stay manually updated, never guessed."
              action={
                <Button size="sm" className="mt-2 rounded-full" onClick={() => setAssetSheet({ open: true, asset: null })}>
                  Add your first asset
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {asts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAssetSheet({ open: true, asset: a })}
                  className="rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
                        {ASSET_CATEGORY_LABELS[a.category as AssetCategory]?.emoji ?? '📦'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{a.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {ASSET_CATEGORY_LABELS[a.category as AssetCategory]?.label ?? a.category}
                          {a.location ? ` · ${a.location}` : ''}
                        </p>
                      </div>
                    </div>
                    {a.gainPct !== null && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${a.gainPct >= 0 ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'}`}>
                        {a.gainPct >= 0 ? '+' : ''}
                        {a.gainPct}%
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 flex items-end justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-muted-foreground">
                        {a.purchaseValuePaise !== null
                          ? `Bought ${formatINRCompact(a.purchaseValuePaise)}${a.purchaseDate ? ` · ${formatDayLabel(a.purchaseDate)}` : ''}`
                          : 'Value updated by you'}
                      </p>
                      <Money paise={a.currentValuePaise} className="text-lg font-bold" />
                    </div>
                    {a.gainPaise !== null && (
                      <p className={`text-sm font-semibold ${a.gainPaise >= 0 ? 'text-income' : 'text-expense'}`}>
                        {a.gainPaise >= 0 ? '+' : ''}
                        {formatINRCompact(a.gainPaise)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <InvestmentFormSheet open={invSheet.open} investment={invSheet.inv} onOpenChange={(o) => setInvSheet({ open: o, inv: o ? invSheet.inv : null })} />
      <AssetFormSheet open={assetSheet.open} asset={assetSheet.asset} onOpenChange={(o) => setAssetSheet({ open: o, asset: o ? assetSheet.asset : null })} />
    </div>
  )
}

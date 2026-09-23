'use client'

// Deposits (Phase 1.5): FDs and RDs in ONE maturity ladder. Shared summary,
// shared timeline buckets, shared reminder badges. Alerts also surface on Today.

import { useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { useFds, useRds } from '@/hooks/queries'
import { FdFormSheet } from '@/components/money/fd-form-sheet'
import { RdFormSheet } from '@/components/money/rd-form-sheet'
import { EmptyState, ErrorCard, Money, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { Button } from '@/components/ui/button'
import { formatDayLabel } from '@/lib/date'
import { formatINRCompact } from '@/lib/money'
import { Plus, Repeat } from 'lucide-react'
import type { FdWithMeta } from '@/services/fds'
import type { RdWithMeta } from '@/services/rds'

const LEVEL_BADGE: Record<string, { label: string; cls: string }> = {
  d30: { label: '30-day window', cls: 'bg-warn/10 text-warn' },
  d15: { label: '15-day window', cls: 'bg-warn/10 text-warn' },
  d7: { label: '7 days to go', cls: 'bg-warn/15 text-warn' },
  d1: { label: 'Matures tomorrow', cls: 'bg-expense/10 text-expense' },
  matured: { label: 'MATURED', cls: 'bg-income/15 text-income' },
}

interface LadderItem {
  id: string
  kind: 'fd' | 'rd'
  fd?: FdWithMeta
  rd?: RdWithMeta
  title: string
  meta: string
  detail: string
  progressPct: number
  daysLeft: number
  status: string
  reminderLevel: string
  autoRenew: boolean
  maturityPaise: number
  maturityDate: string
  interestPaise: number
}

function toItems(fds: FdWithMeta[], rds: RdWithMeta[]): LadderItem[] {
  const fdItems: LadderItem[] = fds.map((f) => ({
    id: `fd-${f.id}`,
    kind: 'fd',
    fd: f,
    title: f.bank,
    meta: `${f.ratePct}% · ${f.tenureMonths}m · ${f.compounding.replace('_', '-')}`,
    detail: `${formatINRCompact(f.principalPaise)} → ${formatDayLabel(f.maturityDate)}`,
    progressPct: f.progressPct,
    daysLeft: f.daysLeft,
    status: f.status,
    reminderLevel: f.reminderLevel,
    autoRenew: f.autoRenew,
    maturityPaise: f.maturityAmountPaise,
    maturityDate: f.maturityDate,
    interestPaise: f.interestPaise,
  }))
  const rdItems: LadderItem[] = rds.map((r) => ({
    id: `rd-${r.id}`,
    kind: 'rd',
    rd: r,
    title: r.bank,
    meta: `${r.ratePct}% · ${r.installmentsPaid}/${r.tenureMonths} paid · ${formatINRCompact(r.installmentPaise)}/mo`,
    detail: `${formatINRCompact(r.installmentPaise * r.tenureMonths)} over ${r.tenureMonths}m → ${formatDayLabel(r.maturityDate)}`,
    progressPct: r.progressPct,
    daysLeft: r.daysLeft,
    status: r.status,
    reminderLevel: r.reminderLevel,
    autoRenew: r.autoRenew,
    maturityPaise: r.maturityAmountPaise,
    maturityDate: r.maturityDate,
    interestPaise: r.interestPaise,
  }))
  return [...fdItems, ...rdItems].sort((a, b) => a.daysLeft - b.daysLeft)
}

const BUCKETS: { key: string; label: string }[] = [
  { key: 'matured', label: 'Matured' },
  { key: 'm0', label: 'This month' },
  { key: 'm3', label: 'Next 3 months' },
  { key: 'y1', label: 'This year' },
  { key: 'later', label: 'Later' },
  { key: 'closed', label: 'Closed' },
]

function bucketOf(item: LadderItem): string {
  if (item.status !== 'active') return 'closed'
  if (item.daysLeft <= 0) return 'matured'
  if (item.daysLeft <= 30) return 'm0'
  if (item.daysLeft <= 90) return 'm3'
  if (item.daysLeft <= 365) return 'y1'
  return 'later'
}

export function FdsScreen() {
  const { navigate } = useUi()
  const fds = useFds()
  const rds = useRds()
  const [fdSheet, setFdSheet] = useState<{ open: boolean; fd: FdWithMeta | null }>({ open: false, fd: null })
  const [rdSheet, setRdSheet] = useState<{ open: boolean; rd: RdWithMeta | null }>({ open: false, rd: null })

  if (fds.isLoading || rds.isLoading) return <SkeletonRow />
  if (fds.isError) return <ErrorCard message={(fds.error as Error).message} onRetry={() => fds.refetch()} />
  if (rds.isError) return <ErrorCard message={(rds.error as Error).message} onRetry={() => rds.refetch()} />

  const items = toItems(fds.data ?? [], rds.data ?? [])
  const activeFd = (fds.data ?? []).filter((f) => f.status === 'active')
  const activeRd = (rds.data ?? []).filter((r) => r.status === 'active')
  const committed = activeFd.reduce((s, f) => s + f.principalPaise, 0) + activeRd.reduce((s, r) => s + r.installmentPaise * r.tenureMonths, 0)
  const atMaturity = activeFd.reduce((s, f) => s + f.maturityAmountPaise, 0) + activeRd.reduce((s, r) => s + r.maturityAmountPaise, 0)

  const buckets = BUCKETS.map((b) => ({ ...b, items: items.filter((i) => bucketOf(i) === b.key) })).filter((b) => b.items.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between px-1">
        <button type="button" onClick={() => navigate('/money')} className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Back">
          ← Money
        </button>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-9 rounded-full" onClick={() => setRdSheet({ open: true, rd: null })}>
            <Plus className="size-4" /> RD
          </Button>
          <Button size="sm" className="h-9 rounded-full" onClick={() => setFdSheet({ open: true, fd: null })}>
            <Plus className="size-4" /> FD
          </Button>
        </div>
      </header>

      <h1 className="-mt-1 px-1 text-2xl font-bold tracking-tight">Deposits — FD & RD</h1>

      {items.length === 0 ? (
        <EmptyState
          emoji="🏛️"
          title="No deposits tracked"
          body="Add an FD or a monthly RD — Saarthi computes maturity values, the reminder ladder, and RD installment bills automatically."
          action={
            <div className="mt-2 flex justify-center gap-2">
              <Button size="sm" className="rounded-full" onClick={() => setFdSheet({ open: true, fd: null })}>
                Add an FD
              </Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setRdSheet({ open: true, rd: null })}>
                Start an RD
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border bg-card p-3.5">
              <p className="text-xs text-muted-foreground">Committed</p>
              <p className="text-base font-bold tabular-nums">{formatINRCompact(committed)}</p>
            </div>
            <div className="rounded-2xl border bg-card p-3.5">
              <p className="text-xs text-muted-foreground">At maturity</p>
              <p className="text-base font-bold tabular-nums">{formatINRCompact(atMaturity)}</p>
            </div>
            <div className="rounded-2xl border bg-card p-3.5">
              <p className="text-xs text-muted-foreground">Interest</p>
              <p className="text-base font-bold text-income tabular-nums">{formatINRCompact(atMaturity - committed)}</p>
            </div>
          </section>

          {buckets.map((b, bi) => (
            <section key={b.key}>
              <SectionHeader title={b.label} />
              <div className="relative flex flex-col gap-2 pl-5">
                {bi < buckets.length - 1 && <span className="absolute top-2 bottom-2 left-2 w-px bg-border" aria-hidden />}
                {b.items.map((item) => {
                  const badge = LEVEL_BADGE[item.reminderLevel]
                  const openSheet = () =>
                    item.kind === 'fd' ? setFdSheet({ open: true, fd: item.fd! }) : setRdSheet({ open: true, rd: item.rd! })
                  return (
                    <div key={item.id} className="relative">
                      <span className="absolute top-1/2 -left-3.5 size-2.5 -translate-y-1/2 rounded-full bg-primary shadow" aria-hidden />
                      <button
                        type="button"
                        onClick={openSheet}
                        className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate font-semibold">
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${item.kind === 'fd' ? 'bg-primary/10 text-primary' : 'bg-warn/15 text-warn'}`}>
                                {item.kind.toUpperCase()}
                              </span>
                              {item.title}
                              {item.autoRenew && <Repeat className="size-3.5 text-muted-foreground" aria-label="auto-renew" />}
                            </p>
                            <p className="text-xs text-muted-foreground">{item.meta}</p>
                          </div>
                          {badge && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>}
                        </div>
                        <div className="mt-2 flex items-end justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                            <Money paise={item.maturityPaise} className="text-lg font-bold" />
                          </div>
                          <p className="text-xs font-semibold text-income">+{formatINRCompact(item.interestPaise)}</p>
                        </div>
                        <ProgressBar value={item.progressPct} tone={item.progressPct > 85 ? 'warn' : 'primary'} className="mt-3 h-1.5" />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {item.kind === 'rd' && item.rd
                            ? `${item.rd.installmentsPaid} of ${item.rd.tenureMonths} installments paid · ${item.progressPct}% of tenure`
                            : `${item.progressPct}% of tenure elapsed`}
                        </p>
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          <p className="px-2 text-center text-xs text-muted-foreground">
            Tap any deposit for edits or removal. FD/RD reminders fire at 30/15/7/1 days; RD installments appear as monthly bills.
          </p>
        </>
      )}

      <FdFormSheet open={fdSheet.open} fd={fdSheet.fd} onOpenChange={(o) => setFdSheet({ open: o, fd: o ? fdSheet.fd : null })} />
      <RdFormSheet open={rdSheet.open} rd={rdSheet.rd} onOpenChange={(o) => setRdSheet({ open: o, rd: o ? rdSheet.rd : null })} />
    </div>
  )
}

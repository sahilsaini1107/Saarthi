'use client'

// Insurance screen (Phase 7): policies with renewal countdown, coverage
// summary, mark-premium-paid (advances the schedule + optional ledger entry).

import { useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { useDeletePolicy, useInsurance, usePayPremium, useAccounts } from '@/hooks/queries'
import { PolicyFormSheet } from '@/components/money/policy-form-sheet'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, EmptyState, ErrorCard, Money, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatINR, formatINRCompact } from '@/lib/money'
import { formatDayLabel } from '@/lib/date'
import { cn } from '@/lib/utils'
import { Plus, ShieldCheck } from 'lucide-react'
import type { PolicyWithMeta } from '@/services/insurance'
import type { InsurancePolicyDTO } from '@/lib/types'

const TYPE_EMOJI: Record<string, string> = {
  term: '🛡️',
  health: '🏥',
  life: '👨‍👩‍👧',
  vehicle: '🚗',
  asset: '🏠',
  other: '📄',
}

const RENEWAL_TONES: Record<string, string> = {
  overdue: 'text-expense',
  due: 'text-expense',
  d1: 'text-warn',
  d7: 'text-warn',
  d15: 'text-foreground',
  d30: 'text-muted-foreground',
  none: 'text-muted-foreground',
}

export function InsuranceScreen() {
  const insurance = useInsurance()
  const pay = usePayPremium({ success: 'Premium paid — next due advanced' })
  const del = useDeletePolicy({ success: 'Policy deleted' })
  const [sheet, setSheet] = useState<{ open: boolean; policy: InsurancePolicyDTO | null }>({ open: false, policy: null })
  const [paySheet, setPaySheet] = useState<PolicyWithMeta | null>(null)

  if (insurance.isLoading) return <SkeletonRow />
  if (insurance.isError) return <ErrorCard message={(insurance.error as Error).message} onRetry={() => insurance.refetch()} />

  const { policies, summary } = insurance.data!
  const attention = policies.filter((p) => p.status === 'active' && ['overdue', 'due', 'd1', 'd7'].includes(p.renewalLevel))
  const rest = policies.filter((p) => !attention.includes(p))

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between px-1">
        <button type="button" onClick={() => window.location.hash = '/money'} className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Back">
          ← Money
        </button>
        <Button size="sm" className="h-9 rounded-full" onClick={() => setSheet({ open: true, policy: null })}>
          <Plus className="size-4" /> Add policy
        </Button>
      </header>

      <h1 className="-mt-1 px-1 text-2xl font-bold tracking-tight">Insurance</h1>

      {summary.policyCount === 0 ? (
        <EmptyState
          emoji="🛡️"
          title="No policies tracked"
          body="Keep term, health and vehicle policies together — Saarthi reminds you before every premium."
          action={
            <Button size="sm" className="mt-1 rounded-full" onClick={() => setSheet({ open: true, policy: null })}>
              Add your first policy
            </Button>
          }
        />
      ) : (
        <>
          {/* coverage summary */}
          <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
            <div className="flex items-center gap-2 text-sm opacity-80">
              <ShieldCheck className="size-4" /> Family protection
            </div>
            <p className="mt-0.5 text-3xl font-bold tracking-tight tabular-nums">{formatINRCompact(summary.totalSumAssuredPaise)}</p>
            <p className="mt-1 text-xs opacity-90">
              {summary.policyCount} active {summary.policyCount === 1 ? 'policy' : 'policies'} · {formatINRCompact(summary.annualPremiumPaise)}/yr in premiums
              {summary.attentionCount > 0 && ` · ${summary.attentionCount} due soon`}
            </p>
          </section>

          {attention.length > 0 && (
            <section>
              <SectionHeader title="Needs attention" />
              <div className="flex flex-col gap-2">
                {attention.map((p) => (
                  <PolicyRow key={p.id} policy={p} onPay={() => setPaySheet(p)} onEdit={() => setSheet({ open: true, policy: p })} paying={pay.isPending} />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeader title="All policies" />
            <div className="flex flex-col gap-2">
              {rest.map((p) => (
                <PolicyRow key={p.id} policy={p} onPay={() => setPaySheet(p)} onEdit={() => setSheet({ open: true, policy: p })} paying={pay.isPending} />
              ))}
            </div>
          </section>

          <p className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed p-3 text-center text-xs text-muted-foreground">
            Protection isn&apos;t net worth — sum assured is tracked separately from your assets.
          </p>
        </>
      )}

      <PolicyFormSheet open={sheet.open} onOpenChange={(o) => setSheet({ open: o, policy: sheet.policy })} policy={sheet.policy} />
      <PayPremiumSheet policy={paySheet} onClose={() => setPaySheet(null)} paying={pay.isPending} onDelete={() => paySheet && del.mutate(paySheet.id, { onSuccess: () => setPaySheet(null) })} />
    </div>
  )
}

function PolicyRow({ policy, onPay, onEdit, paying }: { policy: PolicyWithMeta; onPay: () => void; onEdit: () => void; paying: boolean }) {
  const dueSoon = ['overdue', 'due', 'd1', 'd7', 'd15', 'd30'].includes(policy.renewalLevel)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onEdit()
      }}
      className={cn(
        'w-full cursor-pointer rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent',
        ['overdue', 'due'].includes(policy.renewalLevel) && 'border-expense/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>{TYPE_EMOJI[policy.type] ?? '📄'}</span>
          <div>
            <p className="text-sm font-semibold leading-tight">{policy.name}</p>
            <p className="text-xs text-muted-foreground">{policy.insurer}{policy.policyNumber ? ` · #${policy.policyNumber}` : ''}</p>
          </div>
        </div>
        <span className={cn('text-xs font-semibold', RENEWAL_TONES[policy.renewalLevel])}>{policy.status === 'active' ? policy.dueLabel : policy.status}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Cover</p>
          <p className="font-semibold tabular-nums">{formatINRCompact(policy.sumAssuredPaise)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Premium</p>
          <p className="font-semibold tabular-nums">{formatINR(policy.premiumPaise)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Next due</p>
          <p className="font-semibold">{formatDayLabel(policy.nextPremiumDue)}</p>
        </div>
      </div>
      {dueSoon && (
        <div className="mt-3">
          <ProgressBar value={Math.max(0, Math.min(100, ((30 - Math.max(policy.daysUntilDue, -30)) / 60) * 100))} tone={policy.daysUntilDue <= 7 ? 'warn' : 'primary'} className="h-1.5" />
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-full px-3 text-xs"
          disabled={paying || policy.status !== 'active'}
          onClick={(e) => {
            e.stopPropagation()
            onPay()
          }}
        >
          Pay premium
        </Button>
      </div>
    </div>
  )
}

/** Confirm-the-premium sheet: optional account pick → ledger + schedule advance. */
function PayPremiumSheet({ policy, onClose, paying, onDelete }: { policy: PolicyWithMeta | null; onClose: () => void; paying: boolean; onDelete: () => void }) {
  return (
    <Drawer open={!!policy} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>Pay {policy?.name} premium</DrawerTitle>
          <DrawerDescription>The due date advances to the next period. Optionally log the expense.</DrawerDescription>
        </DrawerHeader>
        {policy && (
          <PayPremiumForm
            key={policy.id}
            policy={policy}
            onClose={onClose}
            paying={paying}
            onDelete={onDelete}
          />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function PayPremiumForm({
  policy,
  onClose,
  paying,
  onDelete,
}: {
  policy: PolicyWithMeta
  onClose: () => void
  paying: boolean
  onDelete: () => void
}) {
  const pay = usePayPremium({ success: 'Premium paid — next due advanced' })
  const accounts = useAccounts()
  const [accountId, setAccountId] = useState<string>('none')
  const [note, setNote] = useState('')

  return (
    <div className="flex flex-col gap-3 pb-2">
      <div className="rounded-xl bg-muted p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-bold tabular-nums">{formatINR(policy.premiumPaise)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Due {formatDayLabel(policy.nextPremiumDue)}</span>
          <span>{policy.premiumFrequency.replace('_', ' ')}ly</span>
        </div>
      </div>
      <Field label="Log to account" hint="Leave on “Don’t log” to only advance the schedule.">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="h-11 w-full rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Don&apos;t log an expense</SelectItem>
            {(accounts.data ?? []).filter((a) => !a.archived).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {accountId !== 'none' && (
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Insurance premium · ${policy.name}`} />
        </Field>
      )}
      <Button
        className="rounded-xl"
        disabled={paying || pay.isPending}
        onClick={() =>
          pay.mutate(
            { id: policy.id, accountId: accountId === 'none' ? undefined : accountId, note: note || null },
            { onSuccess: onClose },
          )
        }
      >
        {pay.isPending ? 'Paying…' : 'Pay premium'}
      </Button>
      <Button variant="ghost" className="rounded-xl text-xs text-muted-foreground" onClick={onDelete}>
        Delete policy…
      </Button>
    </div>
  )
}

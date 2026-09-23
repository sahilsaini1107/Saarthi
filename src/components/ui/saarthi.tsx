'use client'

// Saarthi design-system primitives (Phase 0, task 0.3).
// Calm, minimal, card-based; 8px spacing grid; 12–16px radii.
// Built on top of the shadcn base layer + Saarthi theme tokens.

import { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatINR, formatINRCompact } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/* ---------- SectionHeader ---------- */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pt-2 pb-2">
      <h2 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {action}
    </div>
  )
}

/* ---------- Chip ---------- */
export function Chip({
  active,
  emoji,
  label,
  color,
  onClick,
  className,
}: {
  active?: boolean
  emoji?: string
  label: string
  color?: string
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-all active:scale-95',
        active
          ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
          : 'bg-card text-foreground hover:bg-accent',
        className,
      )}
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      {color && !emoji && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

/* ---------- ProgressBar ---------- */
export function ProgressBar({
  value,
  tone = 'primary',
  className,
}: {
  value: number // 0..100
  tone?: 'primary' | 'income' | 'expense' | 'warn'
  className?: string
}) {
  const bg = { primary: 'bg-primary', income: 'bg-income', expense: 'bg-expense', warn: 'bg-warn' }[tone]
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={Math.round(value)}>
      <div className={cn('h-full rounded-full transition-all', bg)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

/* ---------- Money ---------- */
export function Money({
  paise,
  signed,
  compact,
  className,
}: {
  paise: number
  signed?: 'in' | 'out'
  compact?: boolean
  className?: string
}) {
  const text = compact ? formatINRCompact(paise) : formatINR(paise)
  const tone =
    signed === 'in' ? 'text-income' : signed === 'out' ? 'text-expense' : paise < 0 ? 'text-expense' : undefined
  return (
    <span className={cn('tabular-nums', tone, className)}>
      {signed ? (signed === 'in' ? '+' : '−') + text.replace('-', '') : text}
    </span>
  )
}

/* ---------- EmptyState ---------- */
export function EmptyState({
  emoji = '🌱',
  title,
  body,
  action,
  compact,
}: {
  emoji?: string
  title: string
  body?: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed text-center', compact ? 'gap-1.5 p-6' : 'gap-2 p-10')}>
      <span className={compact ? 'text-3xl' : 'text-5xl'} aria-hidden>
        {emoji}
      </span>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-[36ch] text-sm text-muted-foreground">{body}</p>}
      {action}
    </div>
  )
}

/* ---------- StatTile ---------- */
export function StatTile({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'income' | 'expense' | 'warn'
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-0.5 rounded-2xl border bg-card p-4', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-lg font-bold tracking-tight tabular-nums',
          tone === 'income' && 'text-income',
          tone === 'expense' && 'text-expense',
          tone === 'warn' && 'text-warn',
        )}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

/* ---------- FAB ---------- */
export function Fab({ onClick, label = 'Quick add' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-[max(1rem,calc(50%-14rem))] z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform active:scale-90"
    >
      <Plus className="size-7" strokeWidth={2.5} />
    </button>
  )
}

/* ---------- DatePicker (native, mobile-first) ---------- */
export function DatePicker({
  value,
  onChange,
  label,
  min,
  max,
}: {
  value: string
  onChange: (iso: string) => void
  label?: string
  min?: string
  max?: string
}) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      {label && <span className="text-sm font-medium text-muted-foreground">{label}</span>}
      <Input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl bg-card"
      />
    </label>
  )
}

/* ---------- Field wrapper ---------- */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

/* ---------- utilization tone helper (task 1.1) ---------- */
export function utilizationTone(pct: number): 'income' | 'warn' | 'expense' {
  if (pct < 30) return 'income'
  if (pct <= 70) return 'warn'
  return 'expense'
}

/* ---------- Skeleton row ---------- */
export function SkeletonRow() {
  return (
    <div className="flex flex-col gap-3 p-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  )
}

/* ---------- Error card ---------- */
export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-expense/30 bg-expense/5 p-6 text-center">
      <span className="text-3xl" aria-hidden>
        ⚠️
      </span>
      <p className="text-sm font-medium">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

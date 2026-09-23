'use client'

// AmountPad: oversized numeric keypad for the <10s quick-add rule.
// Value is a display string ("1250.5"); parse happens at save time.

import { useCallback } from 'react'
import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const

export function formatAmountDisplay(raw: string): string {
  if (!raw) return '0'
  const [intPart, decPart] = raw.split('.')
  const int = Number(intPart || 0).toLocaleString('en-IN')
  return decPart !== undefined ? `${int}.${decPart}` : int
}

export function AmountPad({
  value,
  onChange,
  hint,
}: {
  value: string
  onChange: (next: string) => void
  hint?: string
}) {
  const press = useCallback(
    (k: string) => {
      if (k === 'del') {
        onChange(value.slice(0, -1))
        return
      }
      if (k === '.') {
        if (value.includes('.')) return
        onChange((value || '0') + '.')
        return
      }
      const next = value === '0' ? k : value + k
      const [, dec] = next.split('.')
      if (dec !== undefined && dec.length > 2) return // hard 2-decimal cap
      if (next.replace('.', '').length > 12) return
      onChange(next)
    },
    [value, onChange],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1 py-2">
        <span className="text-sm font-medium text-muted-foreground">{hint ?? 'Amount'}</span>
        <span className="flex items-start gap-1 font-bold tracking-tight tabular-nums">
          <span className="mt-1 text-2xl text-muted-foreground">₹</span>
          <span className={cn('text-[44px] leading-none', !value && 'text-muted-foreground/50')}>
            {formatAmountDisplay(value)}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Amount keypad">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-label={k === 'del' ? 'Delete digit' : k}
            onClick={() => press(k)}
            className={cn(
              'flex h-14 items-center justify-center rounded-2xl bg-card text-xl font-semibold shadow-sm transition-all active:scale-95 active:bg-accent',
              k === 'del' && 'text-muted-foreground',
            )}
          >
            {k === 'del' ? <Delete className="size-5" /> : k}
          </button>
        ))}
      </div>
    </div>
  )
}

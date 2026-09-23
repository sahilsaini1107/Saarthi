'use client'

// Budget create/edit sheet (Phase 5.1). One budget per expense category;
// saving an existing category UPDATES its budget (upsert semantics).

import { useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/saarthi'
import { useBudgets, useCategories, useDeleteBudget, useSaveBudget } from '@/hooks/queries'
import { parseAmountToPaise } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { BudgetWithStatus } from '@/services/budgets'

export function BudgetFormSheet({
  open,
  onOpenChange,
  budget,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  budget?: BudgetWithStatus | null
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{budget ? `Edit ${budget.categoryName} budget` : 'Set a monthly budget'}</DrawerTitle>
          <DrawerDescription>Budgets recur every month — set once, tracked automatically.</DrawerDescription>
        </DrawerHeader>
        {open && <BudgetForm key={budget?.id ?? 'new'} budget={budget ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function BudgetForm({ budget, onClose }: { budget: BudgetWithStatus | null; onClose: () => void }) {
  const categories = useCategories()
  const budgets = useBudgets()
  const save = useSaveBudget({ success: budget ? 'Budget updated' : 'Budget set' })
  const del = useDeleteBudget({ success: 'Budget removed' })
  const [categoryId, setCategoryId] = useState<string | null>(budget?.categoryId ?? null)
  const [amount, setAmount] = useState(budget ? String(budget.amountPaise / 100) : '')

  const expenseCategories = (categories.data ?? []).filter((c) => c.kind === 'expense')
  const budgetedIds = new Set((budgets.data?.budgets ?? []).map((b) => b.categoryId))
  const paise = parseAmountToPaise(amount)
  const canSave = !!categoryId && paise != null

  function onSave() {
    if (!categoryId || paise == null) return
    save.mutate(
      budget ? { id: budget.id, categoryId, amountPaise: paise } : { categoryId, amountPaise: paise },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      {!budget && (
        <Field label="Category">
          <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
            {expenseCategories.map((c) => {
              const taken = budgetedIds.has(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={taken}
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors',
                    categoryId === c.id ? 'border-primary bg-primary/10 font-semibold text-primary' : 'hover:bg-accent',
                    taken && 'opacity-35',
                  )}
                >
                  <span aria-hidden>{c.emoji}</span>
                  {c.name}
                  {taken && <span className="text-[10px] text-muted-foreground">set</span>}
                </button>
              )
            })}
            {expenseCategories.length === 0 && <span className="text-sm text-muted-foreground">No expense categories yet</span>}
          </div>
        </Field>
      )}

      <Field label="Monthly limit (₹)" hint={paise != null && paise < 10_000 ? 'That seems small — double-check?' : undefined}>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="8000" autoFocus={!!budget} />
      </Field>

      <Button onClick={onSave} disabled={!canSave || save.isPending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {save.isPending ? 'Saving…' : budget ? 'Save changes' : 'Set budget'}
      </Button>

      {budget && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Remove the ${budget.categoryName} budget?`)) del.mutate(budget.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          Remove budget
        </Button>
      )}
    </div>
  )
}

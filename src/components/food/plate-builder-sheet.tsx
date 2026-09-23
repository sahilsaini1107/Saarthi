'use client'

// Plate builder (Phase 21) — the thali calculator. Pick foods from the
// library, type how much of each, and the totals update as you type: this is
// the "50 g chana + 200 g curd, what am I actually eating?" screen.
//
// All arithmetic comes from lib/food.ts (pure, unit-tested). Nothing is
// computed twice: the same composePlate() the server uses runs here for the
// live preview, so the saved plate can never disagree with the preview.

import { useMemo, useState } from 'react'
import { Plus, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip, Field } from '@/components/ui/saarthi'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useLogFood, useSaveRecipe } from '@/hooks/queries'
import {
  composePlate,
  formatMilli,
  foodUnitMeta,
  parseQuantityMilli,
  type FoodLike,
} from '@/lib/food'
import { MEAL_TYPES } from '@/lib/meals'
import type { FoodItemDTO, RecipeDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Row {
  /** local key — a food may legitimately appear twice (two spoons of oil) */
  key: string
  food: FoodItemDTO
  /** raw text so the field stays editable mid-typing ("1." is not yet a number) */
  qty: string
}

let rowSeq = 0

export function PlateBuilderSheet({
  open,
  onOpenChange,
  foods,
  editing,
  today,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  foods: FoodItemDTO[]
  editing: RecipeDTO | null
  today: string
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{editing ? editing.name : 'Build a plate'}</DrawerTitle>
          <DrawerDescription>
            Add what goes on the plate and how much — the totals add up as you type.
          </DrawerDescription>
        </DrawerHeader>
        {open && (
          <PlateBuilder
            key={editing?.id ?? 'new'}
            foods={foods}
            editing={editing}
            today={today}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function PlateBuilder({
  foods,
  editing,
  today,
  onClose,
}: {
  foods: FoodItemDTO[]
  editing: RecipeDTO | null
  today: string
  onClose: () => void
}) {
  const save = useSaveRecipe({ success: editing ? 'Plate updated' : 'Plate saved' })
  const logFood = useLogFood({ success: 'Logged to today' })

  const [name, setName] = useState(editing?.name ?? '')
  const [emoji, setEmoji] = useState(editing?.emoji ?? '🍛')
  const [servings, setServings] = useState(String(editing?.servings ?? 1))
  const [mealType, setMealType] = useState('lunch')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Row[]>(() =>
    (editing?.items ?? []).flatMap((i) => {
      const food = foods.find((f) => f.id === i.foodItemId)
      return food ? [{ key: `r${rowSeq++}`, food, qty: formatMilli(i.quantityMilli) }] : []
    }),
  )

  const servingCount = Math.max(1, Math.floor(Number(servings) || 1))

  // Live plate. Rows with an unparsable quantity contribute 0 rather than
  // blowing up the total while the user is still typing.
  const plate = useMemo(
    () =>
      composePlate(
        rows.map((r) => ({
          food: r.food as unknown as FoodLike,
          quantityMilli: parseQuantityMilli(r.qty) ?? 0,
        })),
        servingCount,
      ),
    [rows, servingCount],
  )

  const pickable = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return foods.slice(0, 8)
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 12)
  }, [foods, search])

  const validRows = rows.filter((r) => parseQuantityMilli(r.qty) != null)
  const canSave = name.trim().length > 0 && validRows.length > 0
  const canLog = validRows.length > 0

  function addFood(food: FoodItemDTO) {
    setRows((cur) => [...cur, { key: `r${rowSeq++}`, food, qty: food.unit === 'piece' ? '1' : '100' }])
    setSearch('')
  }

  function itemsPayload() {
    return validRows.map((r) => ({ foodItemId: r.food.id, quantityMilli: parseQuantityMilli(r.qty)! }))
  }

  function onSave() {
    save.mutate(
      {
        ...(editing ? { id: editing.id } : {}),
        name: name.trim(),
        emoji,
        servings: servingCount,
        items: itemsPayload(),
      },
      { onSuccess: onClose },
    )
  }

  /**
   * Log without saving. A plate the user never named still has to be loggable
   * — otherwise the calculator is a dead end. Each ingredient goes in as its
   * own meal entry, so the day's log stays itemised.
   */
  function onLogNow() {
    const items = itemsPayload()
    let remaining = items.length
    for (const item of items) {
      logFood.mutate(
        { date: today, mealType, foodItemId: item.foodItemId, quantityMilli: item.quantityMilli },
        {
          onSuccess: () => {
            remaining -= 1
            if (remaining === 0) onClose()
          },
        },
      )
    }
  }

  return (
    <div className="flex max-h-[76vh] flex-col gap-3 overflow-y-auto">
      {/* live totals — the answer the user came for, pinned at the top */}
      <section className="rounded-2xl border bg-primary/5 p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">
            {servingCount > 1 ? `Per serving (of ${servingCount})` : 'Plate total'}
          </p>
          {servingCount > 1 && (
            <span className="text-[11px] text-muted-foreground">
              whole dish {formatMilli(plate.total.caloriesMilliKcal)} kcal
            </span>
          )}
        </div>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
          {formatMilli(plate.perServing.caloriesMilliKcal)}
          <span className="ml-1 text-base font-medium text-muted-foreground">kcal</span>
        </p>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
          <MacroCell label="Protein" value={plate.perServing.proteinMilliG} tone="text-income" />
          <MacroCell label="Carbs" value={plate.perServing.carbsMilliG} />
          <MacroCell label="Fat" value={plate.perServing.fatMilliG} />
          <MacroCell label="Fibre" value={plate.perServing.fiberMilliG} />
        </div>
      </section>

      {/* ingredients */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const part = plate.parts.find((_, idx) => rows[idx]?.key === r.key)
            const bad = r.qty.trim() !== '' && parseQuantityMilli(r.qty) == null
            return (
              <div key={r.key} className="flex items-center gap-2 rounded-xl border bg-card px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.food.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {part ? `${formatMilli(part.macros.caloriesMilliKcal)} kcal · ${formatMilli(part.macros.proteinMilliG)}g protein` : ''}
                    {part?.caloriePct != null ? ` · ${part.caloriePct}%` : ''}
                  </p>
                </div>
                <Input
                  value={r.qty}
                  onChange={(e) =>
                    setRows((cur) => cur.map((x) => (x.key === r.key ? { ...x, qty: e.target.value } : x)))
                  }
                  inputMode="decimal"
                  aria-label={`Quantity of ${r.food.name}`}
                  aria-invalid={bad}
                  className={cn('h-9 w-20 text-center', bad && 'border-expense')}
                />
                <span className="w-7 shrink-0 text-xs text-muted-foreground">{foodUnitMeta(r.food.unit).short}</span>
                <button
                  type="button"
                  aria-label={`Remove ${r.food.name}`}
                  onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-expense"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* food picker */}
      <div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={foods.length ? 'Add a food…' : 'Your library is empty — add foods first'}
            className="h-10 pl-9"
            disabled={foods.length === 0}
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pickable.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => addFood(f)}
              className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent"
            >
              + {f.name}{' '}
              <span className="font-normal">
                {formatMilli(f.proteinMilliG)}g/{f.basisQty}
                {foodUnitMeta(f.unit).short}
              </span>
            </button>
          ))}
          {search && pickable.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Nothing matches — add it to your library first.</p>
          )}
        </div>
      </div>

      {/* log straight to the day */}
      <div className="rounded-2xl border bg-card p-3">
        <p className="text-xs font-semibold">Log it now</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MEAL_TYPES.map((t) => (
            <Chip key={t.key} active={mealType === t.key} emoji={t.emoji} label={t.label} onClick={() => setMealType(t.key)} className="h-8 text-xs" />
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full rounded-full"
          disabled={!canLog || logFood.isPending}
          onClick={onLogNow}
        >
          <Plus className="mr-1 size-4" /> Add {validRows.length} item{validRows.length === 1 ? '' : 's'} to today
        </Button>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Goes straight into today&apos;s meal log — no need to name the plate.
        </p>
      </div>

      {/* save as a reusable plate */}
      <div className="rounded-2xl border bg-card p-3">
        <p className="text-xs font-semibold">Save as a plate</p>
        <div className="mt-2 flex items-center gap-2">
          <Input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} aria-label="Emoji" className="h-10 w-14 text-center text-lg" />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Post-workout thali" className="h-10 flex-1" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Field label="Servings">
            <Input
              value={servings}
              onChange={(e) => setServings(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="h-10 w-20 text-center"
            />
          </Field>
          <Button className="ml-auto mt-5 h-10 rounded-full" disabled={!canSave || save.isPending} onClick={onSave}>
            {save.isPending ? 'Saving…' : editing ? 'Update plate' : 'Save plate'}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Saved plates recalculate themselves — fix a food&apos;s macros and every plate using it updates.
        </p>
      </div>
    </div>
  )
}

function MacroCell({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-card px-1 py-1.5">
      <p className={cn('text-sm font-bold tabular-nums', tone)}>{formatMilli(value)}g</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

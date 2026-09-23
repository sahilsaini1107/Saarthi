'use client'

// Food & Plates (Phase 21) — the configurable nutrition database.
//
// Foods tab:  every food you eat, configured once ("100 g chana = 20 g protein").
// Plates tab: saved combinations, with totals recomputed from the foods on
//             every read — correcting a food fixes every plate built on it.

import { useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { FoodFormSheet } from '@/components/food/food-form-sheet'
import { PlateBuilderSheet } from '@/components/food/plate-builder-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip, EmptyState, ErrorCard, SectionHeader, SkeletonRow, StatTile } from '@/components/ui/saarthi'
import {
  useDeleteFood,
  useDeleteRecipe,
  useFoodLibrary,
  useLogFood,
  useSeedFoodPresets,
} from '@/hooks/queries'
import { FOOD_CATEGORIES, foodCategoryMeta, foodUnitMeta, formatMilli } from '@/lib/food'
import { FOOD_PRESET_GROUPS } from '@/lib/food-presets'
import { todayISO } from '@/lib/date'
import type { FoodItemDTO, RecipeDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

export function FoodScreen() {
  const { user, navigate } = useUi()
  const lib = useFoodLibrary()
  const [tab, setTab] = useState<'foods' | 'plates'>('foods')
  const today = todayISO(user.timezone)

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate('/growth/fitness')}
        className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Fitness
      </button>
      <header className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">Food &amp; Plates</h1>
        <p className="text-sm text-muted-foreground">Configure a food once — every plate does the maths for you.</p>
      </header>

      <div className="flex gap-2">
        <Chip active={tab === 'foods'} emoji="🥣" label="Foods" onClick={() => setTab('foods')} />
        <Chip active={tab === 'plates'} emoji="🍛" label="Plates" onClick={() => setTab('plates')} />
      </div>

      {lib.isLoading ? (
        <SkeletonRow />
      ) : lib.isError ? (
        <ErrorCard message={(lib.error as Error).message} onRetry={() => lib.refetch()} />
      ) : !lib.data ? null : tab === 'foods' ? (
        <FoodsTab foods={lib.data.foods} seededGroups={lib.data.seededGroups} />
      ) : (
        <PlatesTab recipes={lib.data.recipes} foods={lib.data.foods} today={today} />
      )}
    </div>
  )
}

/* ================= Foods ================= */

function FoodsTab({ foods, seededGroups }: { foods: FoodItemDTO[]; seededGroups: string[] }) {
  const seed = useSeedFoodPresets()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [vegOnly, setVegOnly] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FoodItemDTO | null>(null)

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return foods.filter(
      (f) =>
        (!q || f.name.toLowerCase().includes(q) || (f.brand ?? '').toLowerCase().includes(q)) &&
        (!category || f.category === category) &&
        (!vegOnly || f.isVeg),
    )
  }, [foods, search, category, vegOnly])

  // only offer categories that actually have foods — no dead filters
  const liveCategories = useMemo(() => {
    const present = new Set(foods.map((f) => f.category))
    return FOOD_CATEGORIES.filter((c) => present.has(c.key))
  }, [foods])

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }

  if (foods.length === 0) {
    return (
      <>
        <EmptyState
          emoji="🥣"
          title="Your food library is empty"
          body="Add the foods you actually eat — or start from the coach's protein tiers and Indian staples, then edit anything that doesn't match your pack."
          action={
            <Button size="sm" className="mt-2 rounded-full" onClick={openNew}>
              <Plus className="mr-1 size-4" /> Add a food
            </Button>
          }
        />
        <PresetPicker seededGroups={seededGroups} onSeed={(id) => seed.mutate(id)} pending={seed.isPending} />
        <FoodFormSheet open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      </>
    )
  }

  const vegCount = foods.filter((f) => f.isVeg).length

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-3 gap-3">
        <StatTile label="Foods" value={String(foods.length)} sub={`${vegCount} vegetarian`} />
        <StatTile label="S tier" value={String(foods.filter((f) => f.tier === 'S').length)} sub="top protein" />
        <StatTile label="Categories" value={String(liveCategories.length)} sub="in use" />
      </section>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search foods…" className="h-10 pl-9" />
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
        <Button size="sm" className="h-10 shrink-0 rounded-full" onClick={openNew}>
          <Plus className="mr-1 size-4" /> Food
        </Button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <Chip active={vegOnly} emoji="🟢" label="Veg only" onClick={() => setVegOnly(!vegOnly)} className="h-8 text-xs" />
        <Chip active={category === null} label="All" onClick={() => setCategory(null)} className="h-8 text-xs" />
        {liveCategories.map((c) => (
          <Chip
            key={c.key}
            active={category === c.key}
            emoji={c.emoji}
            label={c.label}
            onClick={() => setCategory(category === c.key ? null : c.key)}
            className="h-8 text-xs"
          />
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState compact emoji="🔍" title="No food matches those filters" />
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((f) => (
            <FoodRow
              key={f.id}
              food={f}
              onEdit={() => {
                setEditing(f)
                setFormOpen(true)
              }}
            />
          ))}
        </div>
      )}

      <PresetPicker seededGroups={seededGroups} onSeed={(id) => seed.mutate(id)} pending={seed.isPending} />
      <FoodFormSheet open={formOpen} onOpenChange={setFormOpen} editing={editing} />
    </div>
  )
}

function FoodRow({ food: f, onEdit }: { food: FoodItemDTO; onEdit: () => void }) {
  const del = useDeleteFood({ success: 'Removed from library' })
  const [confirming, setConfirming] = useState(false)
  const meta = foodCategoryMeta(f.category)
  const unit = foodUnitMeta(f.unit).short

  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
        {meta.emoji}
      </span>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold">
          {f.name}
          {f.tier && (
            <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold', f.tier === 'S' ? 'bg-income/10 text-income' : 'bg-muted text-muted-foreground')}>
              {f.tier}
            </span>
          )}
          {!f.isVeg && <span className="ml-1 text-[10px]">🔴</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          per {f.basisQty} {unit} · {formatMilli(f.caloriesMilliKcal)} kcal · P {formatMilli(f.proteinMilliG)} · C{' '}
          {formatMilli(f.carbsMilliG)} · F {formatMilli(f.fatMilliG)}
        </p>
      </button>
      <button type="button" aria-label={`Edit ${f.name}`} onClick={onEdit} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        aria-label={confirming ? `Confirm delete ${f.name}` : `Delete ${f.name}`}
        disabled={del.isPending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true)
            return
          }
          // force: the row already warned that plates using it will change
          del.mutate({ id: f.id, force: f.usageCount > 0 }, { onSettled: () => setConfirming(false) })
        }}
        className={cn(
          'shrink-0 rounded-lg p-2 text-muted-foreground opacity-60 hover:bg-accent hover:text-expense hover:opacity-100',
          confirming && 'bg-expense/10 text-expense opacity-100',
        )}
        title={f.usageCount > 0 ? `Used in ${f.usageCount} plate item(s)` : undefined}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}

function PresetPicker({
  seededGroups,
  onSeed,
  pending,
}: {
  seededGroups: string[]
  onSeed: (groupId: string) => void
  pending: boolean
}) {
  return (
    <section>
      <SectionHeader title="Starter foods" />
      <div className="flex flex-col gap-2">
        {FOOD_PRESET_GROUPS.map((g) => {
          const done = seededGroups.includes(g.id)
          return (
            <div key={g.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{g.label}</p>
                <p className="text-xs text-muted-foreground">
                  {g.hint} · {g.items.length} foods
                </p>
              </div>
              <Button
                size="sm"
                variant={done ? 'ghost' : 'outline'}
                className="h-8 shrink-0 rounded-full text-xs"
                disabled={done || pending}
                onClick={() => onSeed(g.id)}
              >
                {done ? 'Added ✓' : 'Add'}
              </Button>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Typical published figures — they land in your library as ordinary rows you can edit or delete.
      </p>
    </section>
  )
}

/* ================= Plates ================= */

function PlatesTab({ recipes, foods, today }: { recipes: RecipeDTO[]; foods: FoodItemDTO[]; today: string }) {
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editing, setEditing] = useState<RecipeDTO | null>(null)

  function openNew() {
    setEditing(null)
    setBuilderOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      {foods.length === 0 ? (
        <EmptyState
          emoji="🍛"
          title="Add foods first"
          body="A plate is built from your food library — configure a few foods, then combine them here and the totals work themselves out."
        />
      ) : recipes.length === 0 ? (
        <EmptyState
          emoji="🍛"
          title="No plates yet"
          body="Combine foods into a plate — 50 g chana, 200 g curd — and see exactly what you're eating. You can log it without saving, too."
          action={
            <Button size="sm" className="mt-2 rounded-full" onClick={openNew}>
              <Plus className="mr-1 size-4" /> Build a plate
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex justify-end">
            <Button size="sm" className="h-9 rounded-full" onClick={openNew}>
              <Plus className="mr-1 size-4" /> Build a plate
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {recipes.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                today={today}
                onEdit={() => {
                  setEditing(r)
                  setBuilderOpen(true)
                }}
              />
            ))}
          </div>
        </>
      )}

      <PlateBuilderSheet open={builderOpen} onOpenChange={setBuilderOpen} foods={foods} editing={editing} today={today} />
    </div>
  )
}

function RecipeCard({ recipe: r, today, onEdit }: { recipe: RecipeDTO; today: string; onEdit: () => void }) {
  const del = useDeleteRecipe({ success: 'Plate deleted' })
  const logFood = useLogFood({ success: 'Logged to today' })
  const [confirming, setConfirming] = useState(false)
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-2xl border bg-card p-3.5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
          {r.emoji}
        </span>
        <button type="button" onClick={() => setExpanded(!expanded)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold">
            {r.name}
            {r.servings > 1 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                {r.servings} SERVINGS
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatMilli(r.perServing.caloriesMilliKcal)} kcal · P {formatMilli(r.perServing.proteinMilliG)}g · C{' '}
            {formatMilli(r.perServing.carbsMilliG)}g · F {formatMilli(r.perServing.fatMilliG)}g
            {r.servings > 1 ? ' per serving' : ''}
          </p>
        </button>
        <button type="button" aria-label={`Edit ${r.name}`} onClick={onEdit} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
          <Pencil className="size-4" />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 flex flex-col gap-1 border-t pt-2.5">
          {r.items.map((i) => (
            <div key={i.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">
                {i.name}{' '}
                <span className="text-muted-foreground">
                  {formatMilli(i.quantityMilli)} {foodUnitMeta(i.unit).short}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatMilli(i.caloriesMilliKcal)} kcal · {formatMilli(i.proteinMilliG)}g
                {i.caloriePct != null ? ` · ${i.caloriePct}%` : ''}
              </span>
            </div>
          ))}
          {r.note && <p className="mt-1 text-[11px] italic text-muted-foreground">{r.note}</p>}
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-full text-xs"
              disabled={logFood.isPending}
              onClick={() => logFood.mutate({ date: today, mealType: 'lunch', recipeId: r.id, quantityMilli: 1000 })}
            >
              <Plus className="mr-1 size-3.5" /> Log 1 serving today
            </Button>
            <button
              type="button"
              disabled={del.isPending}
              onClick={() => {
                if (!confirming) {
                  setConfirming(true)
                  return
                }
                del.mutate(r.id)
              }}
              className={cn(
                'ml-auto rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-expense',
                confirming && 'text-expense',
              )}
            >
              {confirming ? 'Tap again to delete' : 'Delete plate'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

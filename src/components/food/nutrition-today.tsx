'use client'

// Today's nutrition log, targets, and history live together with the Food library.
import { useState } from 'react'
import { Plus, Settings2, X } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip, ErrorCard, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { useAddMealEntry, useDeleteMealEntry, useNutrition, useSaveNutritionDay, useUpdateNutritionProfile } from '@/hooks/queries'
import { PROTEIN_CHIPS } from '@/lib/fitness-presets'
import { mealTypeBreakdown, MEAL_TYPES } from '@/lib/meals'
import { formatDayLabel, todayISO } from '@/lib/date'

export function NutritionToday() {
  const { user } = useUi()
  const nutrition = useNutrition()
  const saveDay = useSaveNutritionDay({ success: 'Logged' })
  const updateProfile = useUpdateNutritionProfile({ success: 'Targets updated' })
  const addMeal = useAddMealEntry({ success: 'Meal logged' })
  const delMeal = useDeleteMealEntry({ success: 'Entry removed' })
  const [showTargets, setShowTargets] = useState(false)
  const [customP, setCustomP] = useState('')
  const [customK, setCustomK] = useState('')
  const [pTarget, setPTarget] = useState('')
  const [kTarget, setKTarget] = useState('')
  const [gainTarget, setGainTarget] = useState('')
  // meal form (Phase 19)
  const [mealType, setMealType] = useState('breakfast')
  const [mealName, setMealName] = useState('')
  const [mealKcal, setMealKcal] = useState('')
  const [mealP, setMealP] = useState('')

  if (nutrition.isLoading) return <SkeletonRow />
  if (nutrition.isError) return <ErrorCard message={(nutrition.error as Error).message} onRetry={() => nutrition.refetch()} />
  if (!nutrition.data) return null

  const n = nutrition.data
  const today = todayISO(user.timezone)
  // days[] is already the COMBINED total (meals + quick-adds) — merged server
  // side so this card, the hub tile and the Today card can never disagree.
  const todayRow = n.days.find((d) => d.iso === today)
  const meals = n.meals.totals
  const protein = todayRow?.proteinG ?? 0
  const kcal = todayRow?.caloriesKcal ?? 0
  // quick-adds must build on the MANUAL row alone, never the combined total
  const manualProtein = todayRow?.manualProteinG ?? 0
  const manualKcal = todayRow?.manualCaloriesKcal ?? 0
  const pTargetVal = n.profile?.proteinTargetG ?? n.suggestions?.proteinTargetG ?? null
  const kTargetVal = n.profile?.calorieTarget ?? n.suggestions?.calorieTarget ?? null

  function addChip(chipG: number, chipK: number) {
    saveDay.mutate({ date: today, proteinG: manualProtein + chipG, caloriesKcal: manualKcal + chipK })
  }
  function addCustom() {
    const p = customP.trim() === '' ? null : Number(customP)
    const k = customK.trim() === '' ? null : Number(customK)
    if ((p == null || !Number.isFinite(p)) && (k == null || !Number.isFinite(k))) return
    saveDay.mutate({
      date: today,
      proteinG: p != null && Number.isFinite(p) ? Math.max(0, manualProtein + Math.round(p)) : todayRow?.manualProteinG ?? null,
      caloriesKcal: k != null && Number.isFinite(k) ? Math.max(0, manualKcal + Math.round(k)) : todayRow?.manualCaloriesKcal ?? null,
    })
    setCustomP('')
    setCustomK('')
  }
  function undoToday() {
    saveDay.mutate({ date: today, proteinG: 0, caloriesKcal: 0 })
  }
  function saveMeal() {
    if (!mealName.trim()) return
    addMeal.mutate({
      date: today,
      mealType,
      name: mealName.trim(),
      ...(mealKcal.trim() !== '' && Number(mealKcal) >= 0 ? { caloriesKcal: Math.round(Number(mealKcal)) } : {}),
      ...(mealP.trim() !== '' && Number(mealP) >= 0 ? { proteinG: Math.round(Number(mealP)) } : {}),
    })
    setMealName('')
    setMealKcal('')
    setMealP('')
  }

  const last7 = [...n.days].slice(-7)
  const mealGroups = mealTypeBreakdown(n.meals.entries)

  return (
    <div className="flex flex-col gap-4">
      {/* today vs targets — combined: meal log + quick-adds */}
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Today</p>
          <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs" onClick={() => setShowTargets(!showTargets)}>
            <Settings2 className="mr-1 size-3.5" /> Targets
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {meals.caloriesKcal > 0 || meals.proteinG > 0
            ? `${meals.caloriesKcal} kcal · ${meals.proteinG}g from meals + ${manualKcal} kcal · ${manualProtein}g quick-adds`
            : 'meal log + quick-adds combined'}
        </p>
        {pTargetVal != null ? (
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <div className="flex justify-between text-xs">
                <span className="font-medium">🥛 Protein</span>
                <span className="tabular-nums text-muted-foreground">{protein} / {pTargetVal} g</span>
              </div>
              <ProgressBar value={Math.min(100, (protein / pTargetVal) * 100)} tone="income" />
            </div>
            {kTargetVal != null && (
              <div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium">🔥 Calories</span>
                  <span className="tabular-nums text-muted-foreground">{kcal} / {kTargetVal} kcal</span>
                </div>
                <ProgressBar value={Math.min(100, (kcal / kTargetVal) * 100)} />
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {n.suggestions
              ? `From your ${n.latestWeightKg} kg weigh-in: ~${n.suggestions.proteinTargetG} g protein and ~${n.suggestions.calorieTarget} kcal/day. Set them under Targets.`
              : 'Set protein and calorie targets to start tracking (no weigh-in found yet).'}
          </p>
        )}
        {n.suggestions && pTargetVal == null && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 rounded-full"
            onClick={() => updateProfile.mutate({ proteinTargetG: n.suggestions!.proteinTargetG, calorieTarget: n.suggestions!.calorieTarget })}
          >
            Use suggestions
          </Button>
        )}
        {(manualProtein > 0 || manualKcal > 0) && (
          <button type="button" onClick={undoToday} className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
            reset quick-adds today
          </button>
        )}
      </section>

      {/* meal-level log (Phase 19) */}
      <section className="rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold">Log a meal</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MEAL_TYPES.map((t) => (
            <Chip key={t.key} active={mealType === t.key} emoji={t.emoji} label={t.label} onClick={() => setMealType(t.key)} />
          ))}
        </div>
        <div className="mt-2.5 flex flex-col gap-2">
          <Input value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder="e.g. Paneer bhurji · 2 rotis" className="h-9" />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Input value={mealKcal} onChange={(e) => setMealKcal(e.target.value)} type="number" inputMode="numeric" className="h-9 w-20 text-center" placeholder="kcal" />
            <Input value={mealP} onChange={(e) => setMealP(e.target.value)} type="number" inputMode="numeric" className="h-9 w-16 text-center" placeholder="g prot" />
            <Button size="sm" className="ml-auto rounded-full" disabled={addMeal.isPending || !mealName.trim()} onClick={saveMeal}>
              <Plus className="mr-1 size-4" /> Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROTEIN_CHIPS.slice(0, 6).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setMealName((cur) => cur || `${c.label} · ${c.portion}`)
                  setMealKcal(String(c.kcal))
                  setMealP(String(c.proteinG))
                }}
                className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-accent"
              >
                {c.label} {c.proteinG}g/{c.kcal}
              </button>
            ))}
          </div>
        </div>

        {mealGroups.length > 0 && (
          <div className="mt-4 flex flex-col gap-2.5 border-t pt-3">
            {mealGroups.map((g) => {
              const meta = MEAL_TYPES.find((t) => t.key === g.mealType)!
              return (
                <div key={g.mealType}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{meta.emoji} {meta.label}</span>
                    <span className="tabular-nums text-muted-foreground">{g.caloriesKcal} kcal · {g.proteinG}g</span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    {n.meals.entries
                      .filter((e) => e.mealType === g.mealType)
                      .map((e) => (
                        <div key={e.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
                          <span className="min-w-0 flex-1 truncate">{e.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {e.caloriesKcal != null ? `${e.caloriesKcal} kcal` : '—'}{e.proteinG != null ? ` · ${e.proteinG}g` : ''}
                          </span>
                          <button type="button" aria-label={`Delete ${e.name}`} disabled={delMeal.isPending} onClick={() => delMeal.mutate(e.id)} className="shrink-0 text-muted-foreground hover:text-expense">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* targets editor */}
      {showTargets && (
        <section className="rounded-2xl border bg-card p-4">
          <p className="text-sm font-semibold">Targets</p>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              <Input value={pTarget} onChange={(e) => setPTarget(e.target.value)} type="number" className="h-9 w-24 text-center" placeholder={String(n.profile?.proteinTargetG ?? '')} />
              g protein/day
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Input value={kTarget} onChange={(e) => setKTarget(e.target.value)} type="number" className="h-9 w-24 text-center" placeholder={String(n.profile?.calorieTarget ?? '')} />
              kcal/day
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Input value={gainTarget} onChange={(e) => setGainTarget(e.target.value)} type="number" className="h-9 w-24 text-center" placeholder={String(n.profile?.weeklyGainTargetG ?? '')} />
              g body-weight gain/week
            </div>
            {n.suggestions && (
              <p className="text-[11px] text-muted-foreground">
                Suggested from {n.latestWeightKg} kg: {n.suggestions.proteinTargetG} g · {n.suggestions.calorieTarget} kcal (1.8 g/kg, 40 kcal/kg — edit freely, check labels).
              </p>
            )}
            <Button
              size="sm"
              className="self-start rounded-full"
              disabled={updateProfile.isPending || (pTarget.trim() === '' && kTarget.trim() === '' && gainTarget.trim() === '')}
              onClick={() =>
                updateProfile.mutate({
                  ...(pTarget.trim() !== '' && Number(pTarget) >= 30 ? { proteinTargetG: Number(pTarget) } : {}),
                  ...(kTarget.trim() !== '' && Number(kTarget) >= 1200 ? { calorieTarget: Number(kTarget) } : {}),
                  ...(gainTarget.trim() !== '' && Number(gainTarget) >= 50 ? { weeklyGainTargetG: Number(gainTarget) } : {}),
                })
              }
            >
              Save targets
            </Button>
          </div>
        </section>
      )}

      {/* quick add chips (manual totals) */}
      <section>
        <SectionHeader title="Quick add (no meal detail)" />
        <div className="flex flex-wrap gap-2">
          {PROTEIN_CHIPS.map((c) => (
            <Chip key={c.id} emoji="＋" label={`${c.label} +${c.proteinG}g`} onClick={() => addChip(c.proteinG, c.kcal)} className="text-xs" />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <Input value={customP} onChange={(e) => setCustomP(e.target.value)} type="number" inputMode="numeric" className="h-9 w-20 text-center" placeholder="g prot" />
          <Input value={customK} onChange={(e) => setCustomK(e.target.value)} type="number" inputMode="numeric" className="h-9 w-20 text-center" placeholder="kcal" />
          <Button size="sm" variant="outline" className="rounded-full" onClick={addCustom}>
            <Plus className="mr-1 size-4" /> Add
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Chip values are typical portions — check package labels. For real tracking, log meals above.</p>
      </section>

      {/* last 7 days */}
      {last7.length > 0 && (
        <section>
          <SectionHeader title="Last 7 days" />
          <div className="flex flex-col gap-1.5">
            {last7.map((d) => (
              <div key={d.iso} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-xs">
                <span className="font-medium">{formatDayLabel(d.iso)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {d.proteinG != null ? `${d.proteinG} g` : '—'} · {d.caloriesKcal != null ? `${d.caloriesKcal} kcal` : '—'}
                  {pTargetVal != null && d.proteinG != null ? (d.proteinG >= pTargetVal ? ' ✓' : '') : ''}
                </span>
              </div>
            ))}
          </div>
          {n.adherence30.loggedDays > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              30-day average {n.adherence30.avgG} g · hit target {n.adherence30.hitDays}/{n.adherence30.loggedDays} logged days
            </p>
          )}
        </section>
      )}

    </div>
  )
}

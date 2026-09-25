'use client'

import { useState } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  Dumbbell,
  HeartPulse,
  Pencil,
  Pill,
  Plus,
  Sparkles,
} from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { HealthNav } from '@/components/health/health-nav'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorCard, Field, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import {
  useBodyComposition,
  useCheckIn,
  useFitnessSummary,
  useHabits,
  useNutrition,
  useRoutines,
  useSaveSupplement,
  useSkin,
  useSupplementCheckIn,
  useSupplements,
} from '@/hooks/queries'
import { BODY_GOALS, type BodyGoal } from '@/lib/coach-targets'
import { todayISO } from '@/lib/date'
import type { SupplementDTO, SupplementTime } from '@/lib/types'
import { cn } from '@/lib/utils'

const TIME_META: Record<SupplementTime, { label: string; emoji: string }> = {
  morning: { label: 'Morning', emoji: '☀️' },
  afternoon: { label: 'Afternoon', emoji: '🌤️' },
  evening: { label: 'Evening', emoji: '🌆' },
  bedtime: { label: 'Bedtime', emoji: '🌙' },
  anytime: { label: 'Anytime', emoji: '🕐' },
}
const WEEKDAYS = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
]

function pct(value: number | null | undefined, target: number | null | undefined) {
  if (value == null || !target) return 0
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)))
}

function greetingHour(timezone: string) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }).format(new Date()))
}

export function HealthCoachScreen() {
  const { user, navigate } = useUi()
  const today = todayISO(user.timezone)
  const goalKey = `saarthi:body-goal:${user.id}`
  const [goal] = useState<BodyGoal>(() => {
    if (typeof window === 'undefined') return 'lean_bulk'
    const saved = window.localStorage.getItem(goalKey)
    return BODY_GOALS.some((item) => item.key === saved) ? (saved as BodyGoal) : 'lean_bulk'
  })
  const fitness = useFitnessSummary()
  const nutrition = useNutrition()
  const body = useBodyComposition(goal)
  const skin = useSkin()
  const checkIn = useCheckIn(today)
  const supplements = useSupplements()
  const habits = useHabits()
  const routines = useRoutines()
  const [supplementOpen, setSupplementOpen] = useState(false)
  const [editingSupplement, setEditingSupplement] = useState<SupplementDTO | null>(null)

  const queries = [fitness, nutrition, body, skin, checkIn, supplements, habits, routines]
  if (queries.some((query) => query.isLoading)) return <SkeletonRow />
  const failed = queries.find((query) => query.isError)
  if (failed) return <ErrorCard message={(failed.error as Error).message} onRetry={() => failed.refetch()} />

  const fit = fitness.data!
  const fuel = nutrition.data!
  const skinData = skin.data!
  const check = checkIn.data!
  const supplementData = supplements.data!
  const calorieTarget = fuel.profile?.calorieTarget ?? fuel.suggestions?.calorieTarget ?? null
  const proteinTarget = fuel.profile?.proteinTargetG ?? fuel.suggestions?.proteinTargetG ?? null
  const calories = fuel.meals.totals.caloriesKcal + (fuel.days.find((day) => day.iso === today)?.manualCaloriesKcal ?? 0)
  const protein = fuel.meals.totals.proteinG + (fuel.days.find((day) => day.iso === today)?.manualProteinG ?? 0)
  const caloriePct = pct(calories, calorieTarget)
  const proteinPct = pct(protein, proteinTarget)
  const activeSkin = skinData.products.filter((product) => product.status === 'active')
  const hasAm = activeSkin.some((product) => product.routineAm)
  const hasPm = activeSkin.some((product) => product.routinePm)
  const skinExpected = Number(hasAm) + Number(hasPm)
  const skinDone = Number(hasAm && skinData.today.amDone) + Number(hasPm && skinData.today.pmDone)
  const supplementPct = supplementData.scheduledCount
    ? Math.round((supplementData.takenCount / supplementData.scheduledCount) * 100)
    : null
  const scheduledHabits = (habits.data ?? []).filter((habit) => habit.scheduledToday)
  const habitsDone = scheduledHabits.filter((habit) => habit.doneToday).length
  const activeRoutines = (routines.data ?? []).filter((routine) => routine.active)
  const routinesDone = activeRoutines.filter((routine) => routine.todayRun != null).length
  const scoreSignals = [check.completeness]
  if (calorieTarget && proteinTarget) scoreSignals.push(Math.round((caloriePct + proteinPct) / 2))
  if (skinExpected) scoreSignals.push(Math.round((skinDone / skinExpected) * 100))
  if (supplementPct != null) scoreSignals.push(supplementPct)
  if (scheduledHabits.length) scoreSignals.push(Math.round((habitsDone / scheduledHabits.length) * 100))
  const trainedToday = fit.lastSession?.date === today
  if (trainedToday) scoreSignals.push(100)
  const score = Math.round(scoreSignals.reduce((sum, value) => sum + value, 0) / scoreSignals.length)
  const firstName = user.name.trim().split(/\s+/)[0] || 'there'
  const hour = greetingHour(user.timezone)
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const priority = (() => {
    if (check.completeness < 100) {
      const left = check.prompts.filter((prompt) => !prompt.answered).length
      return { title: 'Start with a quick check-in', body: `${left} signal${left === 1 ? '' : 's'} left. Energy, sleep and soreness help the coach set the right pace.`, action: 'Check in', path: '/growth/checkin' }
    }
    if (fit.openSession) return { title: 'Your workout is still open', body: `${fit.openSession.label} has ${fit.openSession.setCount} set${fit.openSession.setCount === 1 ? '' : 's'} logged. Finish while your numbers are fresh.`, action: 'Resume', path: `/growth/fitness/session/${fit.openSession.id}` }
    if (body.data?.pace?.kgPerWeek != null && body.data.pace.verdict !== 'on_track' && body.data.pace.verdict !== 'insufficient') {
      const direction = body.data.pace.kgPerWeek > 0 ? 'up' : 'down'
      return {
        title: `Weight is moving ${direction} ${Math.abs(body.data.pace.kgPerWeek)} kg/week`,
        body: body.data.pace.verdict === 'fast'
          ? 'That is faster than your selected goal. Review the trend before changing calories; one week alone can be noisy.'
          : 'That is slower than your selected goal. Check logging consistency and the multi-week trend before adjusting food.',
        action: 'Review body trend',
        path: '/growth/body',
      }
    }
    if (proteinTarget && protein < proteinTarget) return { title: `${proteinTarget - protein} g protein left`, body: 'Build the next meal around a strong protein source, then add carbs and vegetables around it.', action: 'Plan fuel', path: '/growth/fitness/food' }
    const dueSupplements = supplementData.supplements.filter((item) => item.scheduledToday && !item.takenToday)
    if (dueSupplements.length) return { title: `${dueSupplements.length} supplement${dueSupplements.length === 1 ? '' : 's'} still due`, body: 'Only log supplements you already chose with a qualified professional. Saarthi tracks adherence, not dosage advice.', action: 'View', path: '#supplements' }
    if (hasAm && !skinData.today.amDone && hour < 16) return { title: 'Morning skin routine is ready', body: 'Consistency beats complexity. Complete the products you assigned to your AM routine.', action: 'Open routine', path: '/growth/skin' }
    if (hasPm && !skinData.today.pmDone && hour >= 16) return { title: 'Close the day with your skin routine', body: 'Your night routine is waiting and takes only a few focused minutes.', action: 'Open routine', path: '/growth/skin' }
    if (fit.nextWorkout && !trainedToday) return { title: `${fit.nextWorkout.label} is next`, body: check.day?.readiness?.reason ?? 'Your plan is ready whenever training fits today.', action: 'See workout', path: '/growth/fitness' }
    return { title: 'You are caught up', body: 'Keep the basics steady. The coach will adjust as more trend data comes in.', action: 'See progress', path: '/growth/body' }
  })()

  const goPriority = () => {
    if (priority.path === '#supplements') document.getElementById('supplements')?.scrollIntoView({ behavior: 'smooth' })
    else navigate(priority.path)
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => navigate('/growth')} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Growth
      </button>
      <header className="px-1">
        <p className="text-xs font-semibold text-primary">{greeting}, {firstName}</p>
        <h1 className="text-2xl font-bold tracking-tight">Your health coach</h1>
        <p className="text-xs text-muted-foreground">One daily plan across training, food, body, recovery and skin.</p>
      </header>

      <HealthNav active="coach" />

      <section className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-income/10 p-4">
        <div className="flex items-center gap-4">
          <div
            className="relative flex size-20 shrink-0 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(var(--primary) ${score * 3.6}deg, var(--muted) 0deg)` }}
            aria-label={`Today's health plan ${score}% complete`}
          >
            <div className="flex size-[68px] flex-col items-center justify-center rounded-full bg-card">
              <span className="text-xl font-bold tabular-nums">{score}%</span>
              <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">today</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-primary"><Sparkles className="size-3.5" /><span className="text-[10px] font-bold uppercase tracking-wide">Coach priority</span></div>
            <p className="mt-1 text-base font-bold leading-tight">{priority.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{priority.body}</p>
          </div>
        </div>
        <Button className="mt-4 h-10 w-full rounded-xl" onClick={goPriority}>{priority.action}<ArrowRight className="ml-1 size-4" /></Button>
      </section>

      {check.day?.readiness && (
        <section className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">{check.day.readiness.score}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Readiness: {check.day.readiness.label}</p><p className="text-xs text-muted-foreground">{check.day.readiness.reason}</p></div>
          <Activity className="size-4 text-muted-foreground" />
        </section>
      )}

      <section>
        <SectionHeader title="Today's plan" />
        <div className="flex flex-col gap-2">
          <PlanRow icon={ClipboardCheck} label="Daily check-in" detail={`${check.completeness}% complete`} done={check.completeness === 100} onClick={() => navigate('/growth/checkin')} />
          <PlanRow icon={Dumbbell} label={fit.openSession ? `Resume ${fit.openSession.label}` : fit.nextWorkout?.label ?? 'Set up a workout plan'} detail={trainedToday ? 'Training completed today' : `${fit.week.sessions} session${fit.week.sessions === 1 ? '' : 's'} this week`} done={trainedToday} onClick={() => navigate(fit.openSession ? `/growth/fitness/session/${fit.openSession.id}` : '/growth/fitness')} />
          <PlanRow icon={Sparkles} label="Skin routine" detail={skinExpected ? `${skinDone} / ${skinExpected} routines complete` : 'Build a simple AM / PM routine'} done={skinExpected > 0 && skinDone === skinExpected} onClick={() => navigate('/growth/skin')} />
          <PlanRow icon={Pill} label="Vitamins & supplements" detail={supplementData.scheduledCount ? `${supplementData.takenCount} / ${supplementData.scheduledCount} taken` : 'Add only what you already use'} done={supplementData.scheduledCount > 0 && supplementData.takenCount === supplementData.scheduledCount} onClick={() => document.getElementById('supplements')?.scrollIntoView({ behavior: 'smooth' })} />
          <PlanRow icon={CalendarClock} label="Habits & routines" detail={scheduledHabits.length || activeRoutines.length ? `${habitsDone}/${scheduledHabits.length} habits · ${routinesDone}/${activeRoutines.length} routines` : 'Build a repeatable daily rhythm'} done={(scheduledHabits.length > 0 || activeRoutines.length > 0) && habitsDone === scheduledHabits.length && routinesDone === activeRoutines.length} onClick={() => navigate('/growth/habits')} />
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Today's fuel</p><p className="text-[11px] text-muted-foreground">Logged meals and quick adds combined</p></div><button type="button" onClick={() => navigate('/growth/fitness/food')} className="text-xs font-semibold text-primary">Open food</button></div>
        {calorieTarget && proteinTarget ? (
          <div className="mt-4 flex flex-col gap-4">
            <MacroProgress label="Calories" value={`${calories} / ${calorieTarget} kcal`} percent={caloriePct} />
            <MacroProgress label="Protein" value={`${protein} / ${proteinTarget} g`} percent={proteinPct} />
            <div className="grid grid-cols-2 gap-2"><MiniStat label="Carbs logged" value={`${fuel.meals.totals.carbsG} g`} /><MiniStat label="Fat logged" value={`${fuel.meals.totals.fatG} g`} /></div>
          </div>
        ) : (
          <EmptyState compact emoji="🥗" title="Set your fuel targets" body="Add a weigh-in or choose targets manually so the coach can show useful progress." action={<Button size="sm" className="mt-2 rounded-full" onClick={() => navigate('/growth/fitness')}>Set targets</Button>} />
        )}
      </section>

      <section>
        <SectionHeader title="Longer-term trends" />
        <div className="grid grid-cols-2 gap-2">
          <SignalCard emoji="🏋️" label="Training" value={`${fit.week.sessions}×`} hint={`${fit.week.minutes} min this week`} onClick={() => navigate('/growth/fitness')} />
          <SignalCard emoji="🥗" label="Protein consistency" value={fit.nutrition.week.hitRate == null ? '—' : `${fit.nutrition.week.hitRate}%`} hint={`${fit.nutrition.week.hitDays}/${fit.nutrition.week.loggedDays} logged days hit`} onClick={() => navigate('/growth/fitness/food')} />
          <SignalCard emoji="🧬" label="Body trend" value={body.data?.pace?.kgPerWeek == null ? '—' : `${body.data.pace.kgPerWeek > 0 ? '+' : ''}${body.data.pace.kgPerWeek} kg/wk`} hint={body.data?.pace?.verdict?.replaceAll('_', ' ') ?? 'Add two weigh-ins'} onClick={() => navigate('/growth/body')} />
          <SignalCard emoji="✨" label="Skin" value={skinData.streak ? `${skinData.streak}d` : '—'} hint={skinData.streak ? 'routine streak' : 'Start your routine'} onClick={() => navigate('/growth/skin')} />
        </div>
      </section>

      <section id="supplements" className="scroll-mt-4">
        <SectionHeader title="Vitamins & supplements" action={<button type="button" className="flex items-center text-xs font-semibold text-primary" onClick={() => { setEditingSupplement(null); setSupplementOpen(true) }}><Plus className="mr-1 size-3.5" /> Add</button>} />
        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">Track a routine prescribed or chosen with a qualified professional. Saarthi does not recommend products or doses.</p>
        {supplementData.supplements.filter((item) => item.active).length === 0 ? (
          <EmptyState compact emoji="💊" title="Nothing scheduled" body="Add a vitamin or supplement, choose its days and optional reminder time." action={<Button size="sm" className="mt-2 rounded-full" onClick={() => { setEditingSupplement(null); setSupplementOpen(true) }}><Plus className="mr-1 size-4" /> Add supplement</Button>} />
        ) : (
          <div className="flex flex-col gap-2">
            {supplementData.supplements.filter((item) => item.active).map((item) => <SupplementRow key={item.id} item={item} today={today} onEdit={() => { setEditingSupplement(item); setSupplementOpen(true) }} />)}
          </div>
        )}
      </section>

      <p className="rounded-2xl bg-muted/50 p-3 text-[10px] leading-relaxed text-muted-foreground">Coach guidance is based on your own logs and general wellness rules. It is not medical advice and should not replace a clinician, dietitian or dermatologist.</p>

      <SupplementSheet open={supplementOpen} onOpenChange={setSupplementOpen} supplement={editingSupplement} />
    </div>
  )
}

function PlanRow({ icon: Icon, label, detail, done, onClick }: { icon: typeof HeartPulse; label: string; detail: string; done: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent"><span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', done ? 'bg-income text-white' : 'bg-muted text-muted-foreground')}>{done ? <Check className="size-5" /> : <Icon className="size-5" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{label}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span><ArrowRight className="size-4 shrink-0 text-muted-foreground" /></button>
}

function MacroProgress({ label, value, percent }: { label: string; value: string; percent: number }) {
  return <div><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-medium">{label}</span><span className="tabular-nums text-muted-foreground">{value}</span></div><ProgressBar value={percent} /></div>
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] font-medium text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-bold tabular-nums">{value}</p></div>
}

function SignalCard({ emoji, label, value, hint, onClick }: { emoji: string; label: string; value: string; hint: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-2xl border bg-card p-3.5 text-left transition-colors hover:bg-accent"><div className="flex items-center justify-between"><span className="text-lg">{emoji}</span><span className="text-lg font-bold tabular-nums">{value}</span></div><p className="mt-2 text-xs font-semibold">{label}</p><p className="truncate text-[10px] text-muted-foreground capitalize">{hint}</p></button>
}

function SupplementRow({ item, today, onEdit }: { item: SupplementDTO; today: string; onEdit: () => void }) {
  const checkIn = useSupplementCheckIn()
  const meta = TIME_META[item.timeOfDay]
  return <div className={cn('flex items-center gap-3 rounded-2xl border bg-card p-3.5', !item.scheduledToday && 'opacity-60')}><button type="button" disabled={!item.scheduledToday || checkIn.isPending} onClick={() => checkIn.mutate({ id: item.id, date: today, taken: !item.takenToday })} aria-label={item.takenToday ? `Undo ${item.name}` : `Mark ${item.name} taken`} className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl border-2 text-lg transition-all', item.takenToday ? 'border-income bg-income text-white' : 'border-muted-foreground/20 bg-muted')}>{item.takenToday ? <Check className="size-5" /> : meta.emoji}</button><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}{item.dose && <span className="font-normal text-muted-foreground"> · {item.dose}</span>}</p><p className="truncate text-xs text-muted-foreground">{item.scheduledToday ? meta.label : 'Not scheduled today'}{item.reminderTime ? ` · ${item.reminderTime}` : ''}</p></div><button type="button" aria-label={`Edit ${item.name}`} onClick={onEdit} className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><Pencil className="size-4" /></button></div>
}

function SupplementSheet({ open, onOpenChange, supplement }: { open: boolean; onOpenChange: (open: boolean) => void; supplement: SupplementDTO | null }) {
  return <Drawer open={open} onOpenChange={onOpenChange}><DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"><DrawerHeader><DrawerTitle>{supplement ? 'Edit supplement' : 'Add supplement'}</DrawerTitle><DrawerDescription>Track what you already use. Dose decisions belong with a qualified professional.</DrawerDescription></DrawerHeader>{open && <SupplementForm key={supplement?.id ?? 'new'} supplement={supplement} onClose={() => onOpenChange(false)} />}</DrawerContent></Drawer>
}

function SupplementForm({ supplement, onClose }: { supplement: SupplementDTO | null; onClose: () => void }) {
  const save = useSaveSupplement({ success: supplement ? 'Supplement updated' : 'Supplement added' })
  const [name, setName] = useState(supplement?.name ?? '')
  const [dose, setDose] = useState(supplement?.dose ?? '')
  const [timeOfDay, setTimeOfDay] = useState<SupplementTime>(supplement?.timeOfDay ?? 'morning')
  const [weekdays, setWeekdays] = useState<number[]>(supplement?.weekdays ?? [0, 1, 2, 3, 4, 5, 6])
  const [reminderTime, setReminderTime] = useState(supplement?.reminderTime ?? '')
  const [notes, setNotes] = useState(supplement?.notes ?? '')
  const [active, setActive] = useState(supplement?.active ?? true)
  const toggleDay = (day: number) => setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day])
  return <div className="flex max-h-[72vh] flex-col gap-3 overflow-y-auto pb-2"><Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Vitamin D3" /></Field><Field label="Dose or serving" hint="Optional — copy the label or your clinician's instruction"><Input value={dose} onChange={(event) => setDose(event.target.value)} placeholder="1 capsule" /></Field><Field label="Time of day"><div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">{(Object.keys(TIME_META) as SupplementTime[]).map((value) => <button key={value} type="button" onClick={() => setTimeOfDay(value)} className={cn('h-10 shrink-0 rounded-xl border px-3 text-xs font-semibold', timeOfDay === value ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground')}>{TIME_META[value].emoji} {TIME_META[value].label}</button>)}</div></Field><Field label="Schedule"><div className="grid grid-cols-7 gap-1.5">{WEEKDAYS.map((day, index) => <button key={`${day.value}-${index}`} type="button" aria-pressed={weekdays.includes(day.value)} onClick={() => toggleDay(day.value)} className={cn('aspect-square rounded-xl border text-xs font-bold', weekdays.includes(day.value) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>{day.label}</button>)}</div></Field><Field label="Reminder time" hint="Optional"><Input type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} /></Field><Field label="Notes" hint="Optional"><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Take with food…" /></Field>{supplement && <button type="button" onClick={() => setActive(!active)} className={cn('h-10 rounded-xl border text-sm font-semibold', active ? 'bg-card text-muted-foreground' : 'border-primary bg-primary/10 text-primary')}>{active ? 'Pause this supplement' : 'Resume this supplement'}</button>}<Button disabled={!name.trim() || weekdays.length === 0 || save.isPending} className="mt-1 h-12 shrink-0 rounded-xl" onClick={() => save.mutate({ ...(supplement ? { id: supplement.id } : {}), name: name.trim(), dose: dose.trim() || null, timeOfDay, weekdays, reminderTime: reminderTime || null, notes: notes.trim() || null, active }, { onSuccess: onClose })}>{save.isPending ? 'Saving…' : supplement ? 'Save changes' : 'Add to plan'}</Button></div>
}

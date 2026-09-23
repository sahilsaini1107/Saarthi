'use client'

// Daily coach check-in (Phase 23) — the questions a coach runs through with a
// client each day, and only the ones still unanswered.
//
// Weight, training and protein are NOT asked again here: they already live in
// Body, Fitness and Fuel (Decision #79). The check-in shows their status and
// links straight to the screen that owns them, then asks for what nothing else
// records — sleep, how you feel, steps, water.

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorCard, Field, ProgressBar, SectionHeader, SkeletonRow, StatTile } from '@/components/ui/saarthi'
import { useCheckIn, useSaveCheckIn } from '@/hooks/queries'
import { CHECKIN_SCALES, formatSleep, parseSleepInput } from '@/lib/checkin'
import { formatDayLabel, shiftISO, todayISO } from '@/lib/date'
import type { CheckInPayloadDTO, CheckInPromptDTO, ReadinessDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Where each prompt is actually answered — the check-in never duplicates them. */
const PROMPT_ROUTES: Record<string, string> = {
  weight: '/growth/body',
  training: '/growth/fitness',
  protein: '/growth/fitness',
}

const VERDICT_TONE: Record<string, string> = {
  push: 'bg-income/10 text-income',
  train: 'bg-primary/10 text-primary',
  easy: 'bg-warn/10 text-warn',
  rest: 'bg-expense/10 text-expense',
}

export function CheckInScreen() {
  const { user, navigate } = useUi()
  const today = todayISO(user.timezone)
  const [date, setDate] = useState(today)
  const data = useCheckIn(date === today ? undefined : date)

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate('/growth')}
        className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Growth
      </button>

      <header className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">Daily check-in</h1>
        <p className="text-sm text-muted-foreground">The questions a coach would ask you every day.</p>
      </header>

      {/* day stepper */}
      <div className="flex items-center justify-between rounded-2xl border bg-card px-2 py-1.5">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => setDate(shiftISO(date, -1))}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold">{date === today ? 'Today' : formatDayLabel(date)}</span>
        <button
          type="button"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => setDate(shiftISO(date, 1))}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {data.isLoading ? (
        <SkeletonRow />
      ) : data.isError ? (
        <ErrorCard message={(data.error as Error).message} onRetry={() => data.refetch()} />
      ) : !data.data ? null : (
        <CheckInBody payload={data.data} />
      )}
    </div>
  )
}

function CheckInBody({ payload }: { payload: CheckInPayloadDTO }) {
  const { navigate } = useUi()
  const save = useSaveCheckIn()
  const day = payload.day
  const done = payload.completeness === 100

  return (
    <div className="flex flex-col gap-4">
      {/* progress + streak */}
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">{done ? "Today's check-in is complete 🎉" : 'Still to answer'}</p>
          <span className="text-xs tabular-nums text-muted-foreground">{payload.completeness}%</span>
        </div>
        <ProgressBar value={payload.completeness} tone={done ? 'income' : undefined} />
        <p className="mt-2 text-xs text-muted-foreground">
          {payload.streak > 0
            ? `${payload.streak}-day check-in streak — a missed today doesn't break it until tomorrow.`
            : 'Check in today to start a streak.'}
        </p>
      </section>

      {/* readiness */}
      {day?.readiness && <ReadinessCard readiness={day.readiness} />}

      {/* the coach's list */}
      <section>
        <SectionHeader title="Your day" />
        <div className="flex flex-col gap-2">
          {payload.prompts.map((p) => (
            <PromptRow
              key={p.key}
              prompt={p}
              onGo={PROMPT_ROUTES[p.key] ? () => navigate(PROMPT_ROUTES[p.key]) : undefined}
            />
          ))}
        </div>
        {payload.openSessionId && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full rounded-full"
            onClick={() => navigate(`/growth/fitness/session/${payload.openSessionId}`)}
          >
            Finish the session you started <ArrowRight className="ml-1 size-4" />
          </Button>
        )}
      </section>

      {/* how you feel */}
      <section className="rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold">How do you feel?</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Two answers or more and Saarthi works out whether today is a day to push.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          {CHECKIN_SCALES.map((scale) => (
            <ScaleRow
              key={scale.key}
              scaleKey={scale.key}
              label={scale.label}
              emoji={scale.emoji}
              labels={scale.labels}
              higherIsBetter={scale.higherIsBetter}
              value={day?.[scale.key] ?? null}
              onPick={(v) => save.mutate({ date: payload.date, [scale.key]: v })}
            />
          ))}
        </div>
      </section>

      {/* measured fields */}
      <MeasuredSection payload={payload} />

      {/* 30-day trend */}
      {payload.averages30.loggedDays > 0 && <TrendSection payload={payload} />}
    </div>
  )
}

function ReadinessCard({ readiness: r }: { readiness: ReadinessDTO }) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{r.label}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{r.reason}</p>
        </div>
        <span className={cn('shrink-0 rounded-full px-3 py-1 text-sm font-bold tabular-nums', VERDICT_TONE[r.verdict])}>
          {r.score.toFixed(1)}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        From {r.basis.length} of 4 answers — soreness and stress count inverted, so higher always means better.
      </p>
    </section>
  )
}

function PromptRow({ prompt: p, onGo }: { prompt: CheckInPromptDTO; onGo?: () => void }) {
  const Row = onGo ? 'button' : 'div'
  return (
    <Row
      {...(onGo ? { type: 'button' as const, onClick: onGo } : {})}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left',
        p.answered ? 'bg-card' : 'border-dashed bg-card',
        onGo && 'hover:bg-accent',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl text-base',
          p.answered ? 'bg-income/10' : 'bg-muted',
        )}
        aria-hidden
      >
        {p.answered ? <Check className="size-4 text-income" /> : p.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', !p.answered && 'text-muted-foreground')}>{p.label}</p>
        <p className="truncate text-xs text-muted-foreground">{p.detail ?? 'not logged yet'}</p>
      </div>
      {onGo && <ArrowRight className="size-4 shrink-0 text-muted-foreground" />}
    </Row>
  )
}

function ScaleRow({
  scaleKey,
  label,
  emoji,
  labels,
  higherIsBetter,
  value,
  onPick,
}: {
  scaleKey: string
  label: string
  emoji: string
  labels: readonly string[]
  higherIsBetter: boolean
  value: number | null
  onPick: (v: number | null) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium">
          {emoji} {label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {value != null ? labels[value - 1] : higherIsBetter ? 'low → high' : 'none → worst'}
        </span>
      </div>
      <div className="mt-1 flex gap-1.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            aria-label={`${label}: ${labels[v - 1]}`}
            aria-pressed={value === v}
            // tapping the chosen value again clears it — an answer must be undoable
            onClick={() => onPick(value === v ? null : v)}
            className={cn(
              'h-9 flex-1 rounded-xl border text-sm font-semibold transition-all active:scale-95',
              value === v ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

function MeasuredSection({ payload }: { payload: CheckInPayloadDTO }) {
  const save = useSaveCheckIn({ success: 'Saved' })
  const day = payload.day
  const [sleep, setSleep] = useState(day?.sleepMinutes != null ? formatSleepInput(day.sleepMinutes) : '')
  const [steps, setSteps] = useState(day?.steps != null ? String(day.steps) : '')
  const [water, setWater] = useState(day?.waterMl != null ? String(day.waterMl) : '')
  const [note, setNote] = useState(day?.note ?? '')

  const sleepMinutes = parseSleepInput(sleep)
  const sleepInvalid = sleep.trim() !== '' && sleepMinutes == null

  function submit() {
    save.mutate({
      date: payload.date,
      sleepMinutes: sleep.trim() === '' ? null : sleepMinutes,
      steps: steps.trim() === '' ? null : Math.round(Number(steps)),
      waterMl: water.trim() === '' ? null : Math.round(Number(water)),
      note: note.trim() || null,
    })
  }

  return (
    <section className="rounded-2xl border bg-card p-4">
      <p className="text-sm font-semibold">The numbers</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Field label="Sleep" hint="7:30 or 7.5">
          <Input
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
            placeholder="7:30"
            aria-invalid={sleepInvalid}
            className={cn('h-10 rounded-xl text-center', sleepInvalid && 'border-expense')}
          />
        </Field>
        <Field label="Steps">
          <Input
            value={steps}
            onChange={(e) => setSteps(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="8000"
            className="h-10 rounded-xl text-center"
          />
        </Field>
        <Field label="Water (ml)">
          <Input
            value={water}
            onChange={(e) => setWater(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="2500"
            className="h-10 rounded-xl text-center"
          />
        </Field>
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything worth remembering about today…"
        className="mt-2 h-10"
      />
      <Button size="sm" className="mt-2 w-full rounded-full" disabled={save.isPending || sleepInvalid} onClick={submit}>
        {save.isPending ? 'Saving…' : 'Save'}
      </Button>
    </section>
  )
}

function formatSleepInput(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`
}

function TrendSection({ payload }: { payload: CheckInPayloadDTO }) {
  const a = payload.averages30
  const withReadiness = payload.history.filter((h) => h.readiness != null)

  return (
    <section>
      <SectionHeader title="Last 30 days" />
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Checked in" value={`${a.loggedDays}`} sub="days" />
        <StatTile label="Avg sleep" value={a.sleepMinutes != null ? formatSleep(a.sleepMinutes) : '—'} sub="per night" />
        <StatTile
          label="Avg steps"
          value={a.steps != null ? Math.round(a.steps).toLocaleString('en-IN') : '—'}
          sub="per day"
        />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {CHECKIN_SCALES.map((s) => {
          const v = a[s.key]
          return (
            <div key={s.key} className="rounded-xl border bg-card p-2 text-center">
              <p className="text-sm font-bold tabular-nums">{v != null ? v.toFixed(1) : '—'}</p>
              <p className="text-[10px] text-muted-foreground">
                {s.emoji} {s.label}
              </p>
            </div>
          )
        })}
      </div>
      {withReadiness.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {withReadiness.slice(-21).map((h) => (
            <span
              key={h.iso}
              title={`${h.iso} · ${h.readiness!.label}`}
              className={cn('size-5 rounded', VERDICT_TONE[h.readiness!.verdict])}
            />
          ))}
        </div>
      )}
      {a.loggedDays === 0 && <EmptyState compact emoji="📋" title="No check-ins yet" />}
    </section>
  )
}

/** A compact "what's left today" card for the Today screen. */
export function CheckInTodayCard() {
  const { navigate } = useUi()
  const data = useCheckIn()
  const payload = data.data
  if (data.isLoading || data.isError || !payload) return null

  const missing = payload.prompts.filter((p) => !p.answered)
  const readiness = payload.day?.readiness

  return (
    <section>
      <SectionHeader
        title="Daily check-in"
        action={
          <button
            type="button"
            onClick={() => navigate('/growth/checkin')}
            className="flex items-center text-xs font-medium text-primary"
          >
            Open <ArrowRight className="size-3" />
          </button>
        }
      />
      <button
        type="button"
        onClick={() => navigate('/growth/checkin')}
        className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left hover:bg-accent"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {missing.length === 0 ? 'All done for today 🎉' : `${missing.length} left to log`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {missing.length === 0
              ? readiness
                ? readiness.label
                : `${payload.streak}-day streak`
              : missing.map((m) => m.label).join(' · ')}
          </p>
        </div>
        {readiness && (
          <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums', VERDICT_TONE[readiness.verdict])}>
            {readiness.score.toFixed(1)}
          </span>
        )}
        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{payload.completeness}%</span>
      </button>
    </section>
  )
}

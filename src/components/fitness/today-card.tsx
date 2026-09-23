'use client'

// Today-screen training card (Phase 13): continue an open session, start the
// rotation's next workout, or glance at protein progress. Renders only when
// the user actually trains — no noise for non-users.

import { useState } from 'react'
import { ArrowRight, Play } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/saarthi'
import { useCreateSession, useFitnessSummary } from '@/hooks/queries'
import { cn } from '@/lib/utils'

export function TrainingTodayCard() {
  const { navigate } = useUi()
  const summary = useFitnessSummary()
  const createSession = useCreateSession()
  const [starting, setStarting] = useState(false)

  const s = summary.data
  if (summary.isLoading || summary.isError || !s) return null
  if (!s.openSession && !s.nextWorkout && !s.activePlan) return null

  async function start() {
    if (!s?.nextWorkout) return
    setStarting(true)
    try {
      const session = await createSession.mutateAsync({ planDayId: s.nextWorkout.planDayId })
      navigate(`/growth/fitness/session/${session.id}`)
    } finally {
      setStarting(false)
    }
  }

  const open = s.openSession
  const next = s.nextWorkout
  const proteinLine =
    s.nutrition.proteinTargetG != null
      ? `🥛 ${s.nutrition.proteinG ?? 0}/${s.nutrition.proteinTargetG} g protein${s.week.sessions ? ` · ${s.week.sessions}× this week` : ''}`
      : s.week.sessions
        ? `${s.week.sessions} session${s.week.sessions === 1 ? '' : 's'} · ${s.week.minutes} min this week`
        : null

  return (
    <section>
      <SectionHeader
        title="Training"
        action={
          <button type="button" onClick={() => navigate('/growth/fitness')} className="flex items-center text-xs font-medium text-primary">
            Fitness <ArrowRight className="size-3" />
          </button>
        }
      />
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
        {open ? (
          <button type="button" onClick={() => navigate(`/growth/fitness/session/${open.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{open.label} in progress</p>
              <p className="text-xs text-muted-foreground">{open.setCount} set{open.setCount === 1 ? '' : 's'} logged — continue</p>
            </div>
            <Play className="size-4 shrink-0 text-primary" />
          </button>
        ) : next ? (
          <>
            <button type="button" onClick={() => navigate('/growth/fitness')} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold">
                {next.planEmoji} {next.label}
                {next.focus ? <span className="font-normal text-muted-foreground"> · {next.focus}</span> : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{proteinLine ?? `${next.exercises.length} exercises waiting`}</p>
            </button>
            <Button size="sm" className="h-9 shrink-0 rounded-full" disabled={starting || createSession.isPending} onClick={start}>
              <Play className="mr-1 size-4" /> Start
            </Button>
          </>
        ) : (
          <button type="button" onClick={() => navigate('/growth/fitness')} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold">🏋️ No active plan</p>
            <p className="text-xs text-muted-foreground">{proteinLine ?? 'Set up Foundation A/B in one tap'}</p>
          </button>
        )}
      </div>
    </section>
  )
}

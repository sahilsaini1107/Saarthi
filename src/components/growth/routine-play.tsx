'use client'

// Routine play mode: full-screen step-by-step player with a per-step timer.
// Timed steps show remaining minutes; finishing (or ending early) records
// the run via the upsert endpoint, so replays refresh today's run.

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, Flag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/saarthi'
import { useSaveRoutineRun } from '@/hooks/queries'
import type { RoutineWithMeta } from '@/lib/types'

type Phase = 'playing' | 'summary'

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function RoutinePlay({ routine, onExit }: { routine: RoutineWithMeta; onExit: () => void }) {
  const saveRun = useSaveRoutineRun({ success: 'Routine complete — streak safe' })
  const [phase, setPhase] = useState<Phase>('playing')
  const [index, setIndex] = useState(0)
  const [completed, setCompleted] = useState(0)
  const [stepSeconds, setStepSeconds] = useState(0)
  const [totalSeconds, setTotalSeconds] = useState(0)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)

  const steps = routine.steps
  const current = steps[index]
  const timed = current?.minutes != null && current.minutes > 0
  const remaining = timed ? Math.max(0, (current.minutes ?? 0) * 60 - stepSeconds) : null

  useEffect(() => {
    if (phase !== 'playing') return
    tick.current = setInterval(() => {
      setStepSeconds((s) => s + 1)
      setTotalSeconds((s) => s + 1)
    }, 1000)
    return () => {
      if (tick.current) clearInterval(tick.current)
    }
  }, [phase])

  function resetStepTimer() {
    setStepSeconds(0)
  }

  function next(completedThis: boolean) {
    if (completedThis) setCompleted((c) => c + 1)
    if (index + 1 >= steps.length) {
      // pass the last step's completion explicitly — state above hasn't flushed yet
      finish(completedThis ? 1 : 0)
    } else {
      setIndex((i) => i + 1)
      resetStepTimer()
    }
  }

  function finish(lastStepCompleted = 0) {
    if (tick.current) clearInterval(tick.current)
    setPhase('summary')
    saveRun.mutate({
      routineId: routine.id,
      completedSteps: completed + lastStepCompleted,
      totalSteps: steps.length,
      secondsSpent: totalSeconds,
    })
  }

  /* ---------- summary ---------- */
  if (phase === 'summary') {
    const pct = steps.length ? Math.round((completed / steps.length) * 100) : 0
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background p-8 text-center">
        <span className="text-6xl" aria-hidden>
          {pct === 100 ? '🎉' : '🌱'}
        </span>
        <div>
          <p className="text-2xl font-bold">{pct === 100 ? 'Routine complete!' : 'Nice work'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {completed} of {steps.length} steps · {fmt(totalSeconds)} total
          </p>
        </div>
        <div className="w-full max-w-xs">
          <ProgressBar value={pct} tone={pct === 100 ? 'income' : 'primary'} />
        </div>
        <Button size="lg" className="h-12 rounded-full px-8" onClick={onExit}>
          Done
        </Button>
      </div>
    )
  }

  /* ---------- player ---------- */
  const progress = steps.length ? (index / steps.length) * 100 : 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between px-5 pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <button type="button" aria-label="Exit play mode" onClick={onExit} className="rounded-full p-2 text-muted-foreground hover:bg-accent">
          <X className="size-5" />
        </button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            {routine.emoji} {routine.name}
          </p>
          <p className="text-sm font-semibold">
            Step {index + 1} of {steps.length}
          </p>
        </div>
        <span className="w-9 tabular-nums text-right text-sm text-muted-foreground">{fmt(totalSeconds)}</span>
      </header>
      <div className="px-5">
        <ProgressBar value={progress} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 text-center">
        <span className="flex size-20 items-center justify-center rounded-3xl bg-muted text-4xl" aria-hidden>
          {current ? index + 1 : ''}
        </span>
        <div>
          <p className="text-3xl font-bold tracking-tight">{current?.title}</p>
          {timed ? (
            <p className="mt-3 text-lg font-semibold tabular-nums text-primary">
              {remaining === 0 ? 'Time!' : `${Math.ceil((remaining ?? 0) / 60)} min left`}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Take the time you need — {fmt(stepSeconds)} so far</p>
          )}
        </div>
      </div>

      <footer className="flex flex-col gap-2 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-12 rounded-xl" onClick={() => next(false)}>
            Skip
          </Button>
          <Button className="h-12 rounded-xl font-semibold" onClick={() => next(true)}>
            <Check className="mr-1 size-4" /> Done
          </Button>
        </div>
        <div className="flex justify-center gap-3">
          {index > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setIndex((i) => i - 1); resetStepTimer() }}>
              <ChevronLeft className="size-4" /> Previous
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => finish()}>
            <Flag className="size-4" /> Finish here
          </Button>
        </div>
      </footer>
    </div>
  )
}

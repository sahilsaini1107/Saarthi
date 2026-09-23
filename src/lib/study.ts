// Study pacing + revision-ladder math. Pure functions with an injectable
// "today" (ISO calendar date) — same pattern as lib/habits.ts (Decision #8).
//
// Pacing (Decision #19):
//  - expected progress = elapsed days / total days between course start and
//    target end (start day counts), clamped to [0, 1]; null without a target.
//  - actual progress = done syllabus units / total units (0 when none).
//  - health bands on delta = actual − expected (percentage points):
//    ≥ +10 ahead · ≤ −25 at_risk · ≤ −10 behind · else on_track.
//  - projected finish extrapolates the observed done-units/day pace.
//
// Revision ladder (Decision #20): fixed spaced gaps in days
// [3, 7, 14, 30, 90]. Marking a topic learned starts stage 0 → next revision
// in 3 days. Each successful revision advances one rung; a forgotten revision
// resets to the shortest gap. After the last rung the topic graduates
// (no further revisions scheduled).

import { daysBetweenUTC, toUTC, shiftISO, type ISODate } from './date'

export const REVISION_LADDER_DAYS = [3, 7, 14, 30, 90] as const

export type RevisionOutcome = 'revised' | 'forgot'

/** Gap in days until the next revision for a topic at `stage`. Null = graduated. */
export function nextRevisionGapDays(stage: number): number | null {
  const s = Math.max(0, Math.floor(stage))
  return s >= REVISION_LADDER_DAYS.length ? null : REVISION_LADDER_DAYS[s]
}

/**
 * Apply a revision outcome for a topic that was due on `today`.
 * 'revised' advances the ladder; 'forgot' restarts at the shortest gap.
 * Returns the new stage + the next revision date (null = graduated).
 */
export function applyRevision(
  stage: number,
  outcome: RevisionOutcome,
  today: ISODate,
): { stage: number; nextRevisionAt: ISODate | null; graduated: boolean } {
  const newStage = outcome === 'revised' ? Math.max(0, Math.floor(stage)) + 1 : 0
  const gap = nextRevisionGapDays(newStage)
  if (gap === null) return { stage: newStage, nextRevisionAt: null, graduated: true }
  return { stage: newStage, nextRevisionAt: shiftISO(today, gap), graduated: false }
}

/** Schedule the FIRST revision for a topic just marked learned. */
export function startRevisionLadder(today: ISODate): { revisionStage: number; nextRevisionAt: ISODate } {
  return { revisionStage: 0, nextRevisionAt: shiftISO(today, REVISION_LADDER_DAYS[0]) }
}

/** Is a done topic due for revision on `today` (or overdue)? */
export function isRevisionDue(topic: { status: string; nextRevisionAt: string | null }, today: ISODate): boolean {
  return topic.status === 'done' && topic.nextRevisionAt !== null && topic.nextRevisionAt <= today
}

export type PacingHealth = 'done' | 'no_target' | 'ahead' | 'on_track' | 'behind' | 'at_risk'

export interface PacingResult {
  /** full calendar days elapsed since start (start day = day 1) */
  elapsedDays: number
  /** planned window in days; null without a target end */
  totalDays: number | null
  /** expected progress 0..1 as of today; null without a target end */
  expectedPct: number | null
  /** observed progress 0..1 */
  actualPct: number
  /** actual − expected in percentage points; null without a target end */
  deltaPct: number | null
  /** done units per elapsed day (0 before the course starts) */
  unitsPerDay: number
  /** extrapolated finish date at the observed pace; null when pace is 0 or no units */
  projectedEndDate: ISODate | null
  health: PacingHealth
}

export interface PacingInput {
  startDate: ISODate
  targetEndDate: ISODate | null
  today: ISODate
  totalUnits: number
  doneUnits: number
}

export function pacing(input: PacingInput): PacingResult {
  const { startDate, targetEndDate, today, totalUnits, doneUnits } = input
  const actualPct = totalUnits > 0 ? doneUnits / totalUnits : 0
  const elapsedDays = Math.max(0, daysBetweenUTC(toUTC(startDate), toUTC(today)) + 1) // start day = day 1
  const unitsPerDay = elapsedDays > 0 ? doneUnits / elapsedDays : 0

  const remainingUnits = Math.max(0, totalUnits - doneUnits)
  const projectedEndDate =
    actualPct >= 1
      ? today
      : unitsPerDay > 0 && remainingUnits > 0
        ? shiftISO(today, Math.ceil(remainingUnits / unitsPerDay))
        : null

  if (totalUnits > 0 && doneUnits >= totalUnits) {
    return { elapsedDays, totalDays: null, expectedPct: null, actualPct, deltaPct: null, unitsPerDay, projectedEndDate, health: 'done' }
  }
  if (!targetEndDate) {
    return { elapsedDays, totalDays: null, expectedPct: null, actualPct, deltaPct: null, unitsPerDay, projectedEndDate, health: 'no_target' }
  }

  const totalDays = Math.max(1, daysBetweenUTC(toUTC(startDate), toUTC(targetEndDate)) + 1)
  const expectedPct = Math.min(1, Math.max(0, elapsedDays / totalDays))
  // round to 6dp so exact boundaries (e.g. −10pp) aren't lost to FP noise
  const deltaPct = Math.round((actualPct - expectedPct) * 100 * 1e6) / 1e6

  let health: PacingHealth = 'on_track'
  if (today > targetEndDate) health = 'at_risk' // past the deadline with units left
  else if (deltaPct >= 10) health = 'ahead'
  else if (deltaPct <= -25) health = 'at_risk'
  else if (deltaPct <= -10) health = 'behind'

  return { elapsedDays, totalDays, expectedPct, actualPct, deltaPct, unitsPerDay, projectedEndDate, health }
}

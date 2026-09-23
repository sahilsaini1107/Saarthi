// Planner ↔ goals link (Phase 10): money goals tagged with a portfolio job
// roll up into the planner's six job rows — a job sleeve stops being an
// abstract % and shows WHAT it is for (Emergency fund → 🛡️ Safety…).
//
// Rules (Decision #45):
//  - Only ACTIVE money goals count. Achieved goals have spent their purpose
//    (the money sits in the sleeve as a holding now); archived are noise.
//  - "Committed" = Σ targets of active linked goals with a target. A goal
//    without a target still lists (it shows contributed so far) but adds 0.
//  - remaining = max(0, target − contributed); pct = contributed / target.
//  - Lists sort soonest deadline first; undated goals last, then by title —
//    the nearest commitment is the one the sleeve must be ready for.
//
// Pure functions; amounts in milli-units (₹1 = 1000 milli, Decision #21).

import { JOBS } from './planner'
import type { JobKey } from './types'

export interface GoalLinkInput {
  id: string
  title: string
  emoji: string
  color: string
  /** portfolio job tag; null = unlinked */
  job: JobKey | null
  status: string
  targetValueMilli: number | null
  /** all-time Σ of the goal's daily contributions */
  contributedMilli: number
  targetDate: string | null
}

export interface GoalLinkRow {
  id: string
  title: string
  emoji: string
  color: string
  targetDate: string | null
  targetMilli: number | null
  contributedMilli: number
  /** max(0, target − contributed); null without a target */
  remainingMilli: number | null
  /** contributed / target %, 2dp; null without a target */
  pct: number | null
  /** target met (or passed) */
  achieved: boolean
}

export interface JobGoalRollup {
  goals: GoalLinkRow[]
  /** Σ targets of active linked goals with a target (milli) */
  committedMilli: number
  /** Σ contributed across active linked goals (milli) */
  contributedMilli: number
  goalCount: number
}

export interface GoalsFunding {
  byJob: Record<JobKey, JobGoalRollup>
  /** Σ across all jobs */
  totalCommittedMilli: number
  totalContributedMilli: number
  linkedCount: number
  /** active money goals with no job tag — the linking backlog */
  unlinkedCount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

function shapeRow(g: GoalLinkInput): GoalLinkRow {
  const target = g.targetValueMilli != null && g.targetValueMilli > 0 ? g.targetValueMilli : null
  const remaining = target != null ? Math.max(0, target - g.contributedMilli) : null
  const pct = target != null ? round2((g.contributedMilli / target) * 100) : null
  return {
    id: g.id,
    title: g.title,
    emoji: g.emoji,
    color: g.color,
    targetDate: g.targetDate,
    targetMilli: target,
    contributedMilli: g.contributedMilli,
    remainingMilli: remaining,
    pct,
    achieved: target != null && g.contributedMilli >= target,
  }
}

function emptyRollup(): JobGoalRollup {
  return { goals: [], committedMilli: 0, contributedMilli: 0, goalCount: 0 }
}

/** Sort: soonest deadline first, undated last (then title — stable and readable). */
function compareRows(a: GoalLinkRow, b: GoalLinkRow): number {
  if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate)
  if (a.targetDate) return -1
  if (b.targetDate) return 1
  return a.title.localeCompare(b.title)
}

export function rollupGoalsByJob(goals: GoalLinkInput[]): GoalsFunding {
  const byJob = Object.fromEntries(JOBS.map((j) => [j, emptyRollup()])) as Record<JobKey, JobGoalRollup>
  let totalCommittedMilli = 0
  let totalContributedMilli = 0
  let linkedCount = 0
  let unlinkedCount = 0

  for (const g of goals) {
    const active = g.status === 'active'
    if (!g.job) {
      if (active) unlinkedCount++
      continue
    }
    if (!byJob[g.job]) continue // defensive: unknown job strings never crash the planner
    if (!active) continue
    const row = shapeRow(g)
    const rollup = byJob[g.job]
    rollup.goals.push(row)
    rollup.committedMilli += row.targetMilli ?? 0
    rollup.contributedMilli += row.contributedMilli
    rollup.goalCount++
    totalCommittedMilli += row.targetMilli ?? 0
    totalContributedMilli += row.contributedMilli
    linkedCount++
  }

  for (const j of JOBS) byJob[j].goals.sort(compareRows)

  return { byJob, totalCommittedMilli, totalContributedMilli, linkedCount, unlinkedCount }
}

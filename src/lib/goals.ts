// Goal roll-up math. All pure functions with an injectable "today"
// (ISO calendar date) — same pattern as lib/habits.ts (Decision #8).
//
// Roll-up rules (Decision #18):
//  - A milestone WITH tasks is done exactly when all its tasks are done;
//    its progress = done tasks / total tasks (0 when it has no tasks yet).
//  - A milestone WITHOUT tasks is manually toggled (doneAt flag).
//  - Goal progress = mean over [every milestone's progress] + [every direct
//    task's 0/1 progress]. An empty goal (no milestones, no tasks) sits at 0.

export interface RollupTask {
  milestoneId: string | null
  done: boolean
}

export interface RollupMilestone {
  id: string
  done: boolean
  tasks: RollupTask[]
}

/** Progress of one milestone in 0..1. */
export function milestoneProgress(m: { done: boolean; tasks: RollupTask[] }): number {
  if (m.tasks.length > 0) {
    const done = m.tasks.filter((t) => t.done).length
    return done / m.tasks.length
  }
  return m.done ? 1 : 0
}

/** Progress of a goal in 0..1 — mean over milestones + direct tasks. */
export function goalProgress(milestones: RollupMilestone[], tasks: RollupTask[]): number {
  const parts: number[] = milestones.map((m) => milestoneProgress(m))
  for (const t of tasks) if (t.milestoneId === null) parts.push(t.done ? 1 : 0)
  if (parts.length === 0) return 0
  return parts.reduce((s, p) => s + p, 0) / parts.length
}

/** Is a milestone complete under the roll-up rules? */
export function isMilestoneDone(m: { done: boolean; tasks: RollupTask[] }): boolean {
  return milestoneProgress(m) >= 1
}

export type GoalHealth = 'done' | 'overdue' | 'due_soon' | 'on_track' | 'no_deadline'

/**
 * Deadline health of a goal: achieved → 'done'; past targetDate → 'overdue';
 * within 7 calendar days → 'due_soon'; no targetDate → 'no_deadline'.
 */
export function goalHealth(
  status: string,
  targetDate: string | null,
  today: string,
): GoalHealth {
  if (status === 'achieved') return 'done'
  if (!targetDate) return 'no_deadline'
  if (targetDate < today) return 'overdue'
  if (daysUntil(targetDate, today) <= 7) return 'due_soon'
  return 'on_track'
}

/** Whole days from today to date (positive = future). Calendar-safe on UTC dates. */
export function daysUntil(dateISO: string, todayISO: string): number {
  return Math.round((Date.parse(`${dateISO}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / 86_400_000)
}

/**
 * Validate a drag-and-drop milestone reorder (Phase 12). `orderedIds` must be
 * an EXACT permutation of the goal's current milestone ids — no missing, no
 * unknown, no duplicates. Returns id → new order (0..n-1) on success, or null
 * when the payload doesn't match, so callers can reject it with a 422.
 * Reordering an empty list is a no-op success ({}).
 */
export function normalizeReorder(
  currentIds: readonly string[],
  orderedIds: readonly string[],
): Record<string, number> | null {
  if (currentIds.length !== orderedIds.length) return null
  const current = new Set(currentIds)
  const seen = new Set<string>()
  for (const id of orderedIds) {
    if (!current.has(id) || seen.has(id)) return null
    seen.add(id)
  }
  const orders: Record<string, number> = {}
  orderedIds.forEach((id, i) => {
    orders[id] = i
  })
  return orders
}

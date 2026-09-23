// Goal service: goals → milestones → tasks with computed roll-up progress,
// plus daily contribution tracking + the GitHub-style effort grid (Phase 9).
// Every query is user-scoped (RLS-equivalent). Roll-up and grid math live in
// lib/goals.ts / lib/goals-grid.ts (pure, unit-tested); this layer fetches
// and shapes.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { goalHealth, goalProgress, milestoneProgress, daysUntil, normalizeReorder } from '@/lib/goals'
import { JOB_KEYS } from '@/lib/planner'
import type { JobKey } from '@/lib/types'
import {
  bestStreak,
  buildGrid,
  contributionWindow,
  currentStreak,
  dailyBenchmarkMilli,
  gridLevels,
  neededPerDayMilli,
  paceInfo,
  projectedFinish,
} from '@/lib/goals-grid'
import { isoDayUTC, shiftISO, todayISO, toUTC } from '@/lib/date'
import { rollupMonths, rollupWeeks } from '@/lib/effort-grid'
import type { GoalDTO, GoalMetric, GoalStatus, GoalTaskDTO, MilestoneDTO } from '@/lib/types'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const GOAL_STATUSES = ['active', 'achieved', 'archived']
const GOAL_METRICS = ['money', 'count']
/** Per-day contribution ceiling: ₹10 crore / 10⁸ count units. */
const MAX_AMOUNT_MILLI = 100_000_000_000
/** Lifetime target ceiling: ₹100 crore. */
const MAX_TARGET_MILLI = 1_000_000_000_000
/** Phase 11 — planned milestone effort ceiling: 100_000 min ≈ 1 666 h. */
const MAX_TARGET_MINUTES = 100_000

export interface GoalInput {
  title?: string
  description?: string | null
  emoji?: string
  color?: string
  targetDate?: string | null
  status?: string
  metric?: string | null
  unitLabel?: string | null
  targetValueMilli?: number | null
  /** Phase 10 — portfolio job funding this money goal (null = unlinked) */
  job?: string | null
}

function validateMetric(input: GoalInput): { metric: string | null; unitLabel: string | null; targetValueMilli: bigint | null } {
  let metric: string | null = null
  if (input.metric !== undefined && input.metric !== null && input.metric !== '') {
    if (!GOAL_METRICS.includes(input.metric)) throw new HttpError('Goal metric must be money or count', 422)
    metric = input.metric
  }
  let unitLabel: string | null = null
  if (input.unitLabel !== undefined && input.unitLabel !== null && input.unitLabel !== '') {
    const trimmed = input.unitLabel.trim()
    if (trimmed.length > 16) throw new HttpError('Unit label must be 16 characters or fewer', 422)
    unitLabel = trimmed
  }
  // money contributions always display ₹; a unit label only makes sense for counts
  if (metric !== 'count') unitLabel = null
  let targetValueMilli: bigint | null = null
  if (input.targetValueMilli !== undefined && input.targetValueMilli !== null) {
    if (!Number.isSafeInteger(input.targetValueMilli) || input.targetValueMilli < 0 || input.targetValueMilli > MAX_TARGET_MILLI) {
      throw new HttpError('Target value is out of range', 422)
    }
    targetValueMilli = BigInt(input.targetValueMilli)
  }
  return { metric, unitLabel, targetValueMilli }
}

function validateJob(job: string | null | undefined, metric: string | null): JobKey | null {
  if (job === undefined || job === null || job === '') return null
  if (!(JOB_KEYS as readonly string[]).includes(job)) throw new HttpError('Unknown portfolio job', 422)
  // the planner link is a MONEY-goal concept: a sleeve funds a rupee target
  if (metric !== 'money') throw new HttpError('Only money goals can be linked to a portfolio job', 422)
  return job as JobKey
}

function validateGoal(input: GoalInput) {
  if (!input.title?.trim()) throw new HttpError('Goal title is required', 422)
  if (input.title.trim().length > 120) throw new HttpError('Goal title must be 120 characters or fewer', 422)
  if (input.targetDate != null && input.targetDate !== '' && !ISO_RE.test(input.targetDate)) {
    throw new HttpError('Target date must be YYYY-MM-DD', 422)
  }
  if (input.status != null && !GOAL_STATUSES.includes(input.status)) {
    throw new HttpError('Goal status must be active, achieved or archived', 422)
  }
}

function shapeTask(t: {
  id: string
  goalId: string
  milestoneId: string | null
  title: string
  doneAt: Date | null
  dueDate: Date | null
  createdAt: Date
}): GoalTaskDTO {
  return {
    id: t.id,
    goalId: t.goalId,
    milestoneId: t.milestoneId,
    title: t.title,
    done: t.doneAt != null,
    doneAt: t.doneAt?.toISOString() ?? null,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    createdAt: t.createdAt.toISOString(),
  }
}

type MilestoneRow = {
  id: string
  goalId: string
  title: string
  order: number
  doneAt: Date | null
  targetDate: Date | null
  targetMinutes: number | null
  tasks: { id: string; goalId: string; milestoneId: string | null; title: string; doneAt: Date | null; dueDate: Date | null; createdAt: Date }[]
  logs: { date: Date; minutes: number }[]
}

function shapeMilestone(m: MilestoneRow, today: string): MilestoneDTO {
  const tasks = m.tasks.map(shapeTask).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const progress = milestoneProgress({ done: m.doneAt != null, tasks })
  const totalMinutes = m.logs.reduce((s, l) => s + l.minutes, 0)
  const todayMinutes = m.logs.filter((l) => isoDayUTC(l.date) === today).reduce((s, l) => s + l.minutes, 0)
  return {
    id: m.id,
    goalId: m.goalId,
    title: m.title,
    order: m.order,
    done: progress >= 1,
    targetDate: m.targetDate ? m.targetDate.toISOString().slice(0, 10) : null,
    tasks,
    progress,
    targetMinutes: m.targetMinutes,
    totalMinutes,
    loggedToday: todayMinutes > 0,
    todayMinutes,
  }
}

function shapeGoal(
  g: {
    id: string
    title: string
    description: string | null
    emoji: string
    color: string
    targetDate: Date | null
    status: string
    metric: string | null
    unitLabel: string | null
    targetValueMilli: bigint | null
    job: string | null
    createdAt: Date
    milestones: MilestoneRow[]
    tasks: (Parameters<typeof shapeTask>[0])[]
  },
  today: string,
): GoalDTO {
  const milestones = g.milestones.map((m) => shapeMilestone(m, today)).sort((a, b) => a.order - b.order)
  const allTasks = g.tasks.map(shapeTask)
  const milestoneIds = new Set(milestones.map((m) => m.id))
  const directTasks = allTasks.filter((t) => t.milestoneId === null || !milestoneIds.has(t.milestoneId))
  const progress = goalProgress(
    milestones.map((m) => ({ id: m.id, done: m.done, tasks: m.tasks.map((t) => ({ milestoneId: t.milestoneId, done: t.done })) })),
    allTasks.map((t) => ({ milestoneId: t.milestoneId && milestoneIds.has(t.milestoneId) ? t.milestoneId : null, done: t.done })),
  )
  const daysLeft = g.targetDate ? daysUntil(g.targetDate.toISOString().slice(0, 10), today) : null
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    emoji: g.emoji,
    color: g.color,
    targetDate: g.targetDate ? g.targetDate.toISOString().slice(0, 10) : null,
    status: (GOAL_STATUSES.includes(g.status) ? g.status : 'active') as GoalStatus,
    metric: (g.metric === 'money' || g.metric === 'count' ? g.metric : null) as GoalMetric | null,
    unitLabel: g.unitLabel,
    targetValueMilli: g.targetValueMilli != null ? Number(g.targetValueMilli) : null,
    job: (JOB_KEYS as readonly string[]).includes(g.job ?? '') ? (g.job as JobKey) : null,
    createdAt: g.createdAt.toISOString(),
    milestones,
    directTasks,
    progress,
    health: goalHealth(g.status, g.targetDate ? g.targetDate.toISOString().slice(0, 10) : null, today),
    daysLeft: g.status === 'achieved' ? null : daysLeft,
    taskStats: {
      done: allTasks.filter((t) => t.done).length,
      total: allTasks.length,
    },
  }
}

const GOAL_INCLUDE = {
  milestones: { include: { tasks: true, logs: { select: { date: true, minutes: true } } } },
  tasks: true,
}

export async function listGoals(userId: string, tz: string): Promise<GoalDTO[]> {
  const today = todayISO(tz)
  const rows = await db.goal.findMany({
    where: { userId },
    include: GOAL_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
  // active first, then achieved/archived; newest first within each group
  const rank = (s: string) => (s === 'active' ? 0 : 1)
  return rows
    .map((g) => shapeGoal(g, today))
    .sort((a, b) => rank(a.status) - rank(b.status) || b.createdAt.localeCompare(a.createdAt))
}

export async function createGoal(userId: string, input: GoalInput, tz: string): Promise<GoalDTO> {
  validateGoal(input)
  const metricFields = validateMetric(input)
  const job = validateJob(input.job, metricFields.metric)
  const row = await db.goal.create({
    data: {
      userId,
      title: (input.title ?? '').trim(),
      description: input.description?.trim() || null,
      emoji: input.emoji?.trim() || '🎯',
      color: input.color || '#0D9488',
      targetDate: input.targetDate ? toUTC(input.targetDate) : null,
      status: input.status ?? 'active',
      metric: metricFields.metric,
      unitLabel: metricFields.unitLabel,
      targetValueMilli: metricFields.targetValueMilli,
      job,
    },
    include: GOAL_INCLUDE,
  })
  return shapeGoal(row, todayISO(tz))
}

async function ownedGoal(userId: string, goalId: string) {
  const goal = await db.goal.findFirst({ where: { id: goalId, userId } })
  if (!goal) throw new HttpError('Goal not found', 404)
  return goal
}

export async function updateGoal(userId: string, goalId: string, input: GoalInput, tz: string): Promise<GoalDTO> {
  const existing = await ownedGoal(userId, goalId)
  validateGoal({
    title: input.title ?? existing.title,
    targetDate: input.targetDate !== undefined ? input.targetDate : existing.targetDate?.toISOString().slice(0, 10) ?? null,
    status: input.status ?? existing.status,
  })
  // metric fields: fall back to stored values when not supplied (they are
  // cleared by passing explicit nulls — e.g. switching daily tracking off)
  const metricInput: GoalInput = {
    metric: input.metric !== undefined ? input.metric : existing.metric,
    unitLabel: input.unitLabel !== undefined ? input.unitLabel : existing.unitLabel,
    targetValueMilli:
      input.targetValueMilli !== undefined
        ? input.targetValueMilli
        : existing.targetValueMilli != null
          ? Number(existing.targetValueMilli)
          : null,
  }
  const metricFields = validateMetric(metricInput)
  // job validates against the RESOLVED metric (fall back to the stored one
  // when the caller doesn't send metric — explicit null always clears)
  const resolvedMetric = metricFields.metric
  let job: JobKey | null
  if (input.job !== undefined) {
    job = validateJob(input.job, resolvedMetric)
  } else {
    // job untouched in this call — but a goal that stopped being a money
    // goal must not keep a stale planner tag
    job = resolvedMetric === 'money' ? ((existing.job as JobKey | null) ?? null) : null
  }
  const row = await db.goal.update({
    where: { id: goalId },
    data: {
      title: input.title !== undefined ? input.title.trim() : existing.title,
      description: input.description !== undefined ? input.description?.trim() || null : existing.description,
      emoji: input.emoji?.trim() || existing.emoji,
      color: input.color || existing.color,
      targetDate:
        input.targetDate !== undefined ? (input.targetDate ? toUTC(input.targetDate) : null) : existing.targetDate,
      status: input.status ?? existing.status,
      metric: metricFields.metric,
      unitLabel: metricFields.unitLabel,
      targetValueMilli: metricFields.targetValueMilli,
      job,
    },
    include: GOAL_INCLUDE,
  })
  return shapeGoal(row, todayISO(tz))
}

export async function deleteGoal(userId: string, goalId: string): Promise<void> {
  await ownedGoal(userId, goalId)
  await db.goal.delete({ where: { id: goalId } })
}

/* ---------- milestones ---------- */

export interface MilestoneInput {
  title?: string
  targetDate?: string | null
  done?: boolean
  order?: number
  /** Phase 11 — optional planned effort in minutes (informational) */
  targetMinutes?: number | null
}

/** Planned-effort guardrail: 0..100_000 min; 0 clears (null). */
function validateTargetMinutes(n: number | null | undefined): number | null {
  if (n === undefined || n === null || n === 0) return null
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_TARGET_MINUTES) {
    throw new HttpError('Planned minutes are out of range (0–100000)', 422)
  }
  return n
}

export async function addMilestone(userId: string, goalId: string, input: MilestoneInput, tz: string): Promise<GoalDTO> {
  if (!input.title?.trim()) throw new HttpError('Milestone title is required', 422)
  if (input.title.trim().length > 120) throw new HttpError('Milestone title must be 120 characters or fewer', 422)
  if (input.targetDate != null && input.targetDate !== '' && !ISO_RE.test(input.targetDate)) {
    throw new HttpError('Target date must be YYYY-MM-DD', 422)
  }
  await ownedGoal(userId, goalId)
  const targetMinutes = validateTargetMinutes(input.targetMinutes)
  const last = await db.milestone.findFirst({ where: { goalId }, orderBy: { order: 'desc' } })
  await db.milestone.create({
    data: {
      goalId,
      title: (input.title ?? '').trim(),
      order: (last?.order ?? -1) + 1,
      targetDate: input.targetDate ? toUTC(input.targetDate) : null,
      targetMinutes,
    },
  })
  const row = await db.goal.findFirstOrThrow({ where: { id: goalId }, include: GOAL_INCLUDE })
  return shapeGoal(row, todayISO(tz))
}

async function ownedMilestone(userId: string, milestoneId: string) {
  const m = await db.milestone.findFirst({ where: { id: milestoneId, goal: { userId } } })
  if (!m) throw new HttpError('Milestone not found', 404)
  return m
}

export async function updateMilestone(userId: string, milestoneId: string, input: MilestoneInput, tz: string): Promise<GoalDTO> {
  const existing = await ownedMilestone(userId, milestoneId)
  if (input.title !== undefined && !input.title.trim()) throw new HttpError('Milestone title is required', 422)
  if (input.targetDate != null && input.targetDate !== '' && !ISO_RE.test(input.targetDate)) {
    throw new HttpError('Target date must be YYYY-MM-DD', 422)
  }
  const targetMinutes = input.targetMinutes !== undefined ? validateTargetMinutes(input.targetMinutes) : existing.targetMinutes
  await db.milestone.update({
    where: { id: milestoneId },
    data: {
      title: input.title !== undefined ? input.title.trim() : existing.title,
      targetDate:
        input.targetDate !== undefined ? (input.targetDate ? toUTC(input.targetDate) : null) : existing.targetDate,
      // manual completion only ever toggles ON; tasks drive it off again
      doneAt: input.done === true ? (existing.doneAt ?? new Date()) : existing.doneAt,
      order: input.order ?? existing.order,
      targetMinutes,
    },
  })
  const row = await db.goal.findFirstOrThrow({ where: { id: existing.goalId }, include: GOAL_INCLUDE })
  return shapeGoal(row, todayISO(tz))
}

export async function deleteMilestone(userId: string, milestoneId: string, tz: string): Promise<GoalDTO> {
  const existing = await ownedMilestone(userId, milestoneId)
  await db.milestone.delete({ where: { id: milestoneId } }) // cascades its tasks
  const row = await db.goal.findFirstOrThrow({ where: { id: existing.goalId }, include: GOAL_INCLUDE })
  return shapeGoal(row, todayISO(tz))
}

/**
 * Phase 12 — drag-and-drop reorder. `orderedIds` must be an exact permutation
 * of the goal's milestone ids (normalizeReorder validates); writes order 0..n-1
 * in one transaction and returns the reshaped goal.
 */
export async function reorderMilestones(userId: string, goalId: string, orderedIds: string[], tz: string): Promise<GoalDTO> {
  await ownedGoal(userId, goalId)
  const milestones = await db.milestone.findMany({ where: { goalId }, select: { id: true } })
  const orders = normalizeReorder(milestones.map((m) => m.id), orderedIds)
  if (orders === null) throw new HttpError("ids must be an exact permutation of the goal's milestones", 422)
  await db.$transaction(
    Object.entries(orders).map(([id, order]) => db.milestone.update({ where: { id }, data: { order } })),
  )
  const row = await db.goal.findFirstOrThrow({ where: { id: goalId }, include: GOAL_INCLUDE })
  return shapeGoal(row, todayISO(tz))
}

/* ---------- tasks ---------- */

export interface TaskInput {
  title?: string
  milestoneId?: string | null
  dueDate?: string | null
  done?: boolean
}

function validateTaskInput(input: TaskInput) {
  if (!input.title?.trim()) throw new HttpError('Task title is required', 422)
  if (input.title.trim().length > 160) throw new HttpError('Task title must be 160 characters or fewer', 422)
  if (input.dueDate != null && input.dueDate !== '' && !ISO_RE.test(input.dueDate)) {
    throw new HttpError('Due date must be YYYY-MM-DD', 422)
  }
}

export async function addTask(userId: string, goalId: string, input: TaskInput, tz: string): Promise<GoalDTO> {
  validateTaskInput(input)
  await ownedGoal(userId, goalId)
  if (input.milestoneId) {
    const m = await db.milestone.findFirst({ where: { id: input.milestoneId, goalId } })
    // goalId-scoped lookup on an already user-owned goal ⇒ ownership is implied
    if (!m) throw new HttpError('Milestone not found on this goal', 404)
  }
  await db.goalTask.create({
    data: {
      userId,
      goalId,
      milestoneId: input.milestoneId || null,
      title: (input.title ?? '').trim(),
      dueDate: input.dueDate ? toUTC(input.dueDate) : null,
    },
  })
  const row = await db.goal.findFirstOrThrow({ where: { id: goalId }, include: GOAL_INCLUDE })
  return shapeGoal(row, todayISO(tz))
}

async function ownedTask(userId: string, taskId: string) {
  const t = await db.goalTask.findFirst({ where: { id: taskId, userId } })
  if (!t) throw new HttpError('Task not found', 404)
  return t
}

export async function updateTask(userId: string, taskId: string, input: TaskInput, tz: string): Promise<GoalDTO> {
  const existing = await ownedTask(userId, taskId)
  if (input.title !== undefined) validateTaskInput(input)
  if (input.dueDate != null && input.dueDate !== '' && !ISO_RE.test(input.dueDate)) {
    throw new HttpError('Due date must be YYYY-MM-DD', 422)
  }
  if (input.milestoneId) {
    const m = await db.milestone.findFirst({ where: { id: input.milestoneId, goalId: existing.goalId } })
    if (!m) throw new HttpError('Milestone not found on this goal', 404)
  }
  await db.goalTask.update({
    where: { id: taskId },
    data: {
      title: input.title !== undefined ? input.title.trim() : existing.title,
      dueDate:
        input.dueDate !== undefined ? (input.dueDate ? toUTC(input.dueDate) : null) : existing.dueDate,
      doneAt:
        input.done === true
          ? (existing.doneAt ?? new Date())
          : input.done === false
            ? null
            : existing.doneAt,
      milestoneId:
        input.milestoneId !== undefined ? (input.milestoneId || null) : existing.milestoneId,
    },
  })
  const row = await db.goal.findFirstOrThrow({ where: { id: existing.goalId }, include: GOAL_INCLUDE })
  return shapeGoal(row, todayISO(tz))
}

export async function deleteTask(userId: string, taskId: string, tz: string): Promise<GoalDTO> {
  const existing = await ownedTask(userId, taskId)
  await db.goalTask.delete({ where: { id: taskId } })
  const row = await db.goal.findFirstOrThrow({ where: { id: existing.goalId }, include: GOAL_INCLUDE })
  return shapeGoal(row, todayISO(tz))
}

/**
 * Today widget: undone tasks due today or overdue, from active goals,
 * soonest due first — bounded so the widget stays light.
 */
export async function goalTasksForToday(userId: string, tz: string, limit = 6) {
  const today = todayISO(tz)
  const tasks = await db.goalTask.findMany({
    where: {
      userId,
      doneAt: null,
      dueDate: { lte: toUTC(today) },
      goal: { status: 'active' },
    },
    include: { goal: { select: { title: true, emoji: true, color: true } } },
    orderBy: { dueDate: 'asc' },
    take: limit,
  })
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    overdue: t.dueDate ? t.dueDate.toISOString().slice(0, 10) < today : false,
    goalId: t.goalId,
    goalTitle: t.goal.title,
    goalEmoji: t.goal.emoji,
    goalColor: t.goal.color,
  }))
}

/* ---------- contributions (Phase 9) ---------- */

export interface ContributionInput {
  date: string
  amountMilli: number
  note?: string | null
}

function shapeContribution(c: { id: string; goalId: string; date: Date; amountMilli: bigint; note: string | null }) {
  return {
    id: c.id,
    goalId: c.goalId,
    date: isoDayUTC(c.date),
    amountMilli: Number(c.amountMilli),
    note: c.note,
  }
}

/**
 * Upsert one day's contribution (exactly-once per goal+day — re-entering
 * replaces, matching the BodyMetric convention). Future dates are rejected:
 * the grid records what you DID, not what you plan.
 */
export async function logContribution(userId: string, goalId: string, input: ContributionInput, tz: string) {
  const goal = await ownedGoal(userId, goalId)
  if (goal.metric !== 'money' && goal.metric !== 'count') {
    throw new HttpError('This goal has no daily tracking metric — add one in the goal form first', 422)
  }
  if (!ISO_RE.test(input.date)) throw new HttpError('Date must be YYYY-MM-DD', 422)
  if (!Number.isSafeInteger(input.amountMilli) || input.amountMilli <= 0 || input.amountMilli > MAX_AMOUNT_MILLI) {
    throw new HttpError('Contribution amount is out of range', 422)
  }
  if (input.date > todayISO(tz)) throw new HttpError('Contributions cannot be logged for future dates', 422)
  const row = await db.goalContribution.upsert({
    where: { goalId_date: { goalId, date: toUTC(input.date) } },
    create: {
      userId,
      goalId,
      date: toUTC(input.date),
      amountMilli: BigInt(input.amountMilli),
      note: input.note?.trim() || null,
    },
    update: {
      amountMilli: BigInt(input.amountMilli),
      note: input.note !== undefined ? input.note?.trim() || null : undefined,
    },
  })
  return shapeContribution(row)
}

/** Remove one day's contribution (no-op when the day has none). */
export async function removeContribution(userId: string, goalId: string, date: string): Promise<void> {
  await ownedGoal(userId, goalId)
  if (!ISO_RE.test(date)) throw new HttpError('Date must be YYYY-MM-DD', 422)
  await db.goalContribution.deleteMany({ where: { goalId, userId, date: toUTC(date) } })
}

/** The full grid payload: window, per-day levels, streaks and pace stats. */
export async function goalContributions(userId: string, goalId: string, tz: string) {
  const goal = await ownedGoal(userId, goalId)
  const today = todayISO(tz)
  const metric = goal.metric === 'money' || goal.metric === 'count' ? goal.metric : null
  const targetDate = goal.targetDate ? isoDayUTC(goal.targetDate) : null
  const targetValueMilli = goal.targetValueMilli != null ? Number(goal.targetValueMilli) : null

  const [contribs, doneTasks] = await Promise.all([
    db.goalContribution.findMany({ where: { userId, goalId }, orderBy: { date: 'asc' } }),
    db.goalTask.findMany({ where: { goalId, doneAt: { not: null } }, select: { doneAt: true } }),
  ])

  // task completions bucketed by the USER's calendar day (doneAt is a real
  // timestamp, so UTC-day bucketing would misfile evenings in IST)
  const tasksByDay = new Map<string, number>()
  for (const t of doneTasks) {
    if (!t.doneAt) continue
    const iso = todayISO(tz, t.doneAt)
    tasksByDay.set(iso, (tasksByDay.get(iso) ?? 0) + 1)
  }

  const firstDate = contribs.length > 0 ? isoDayUTC(contribs[0].date) : null
  // RENDER window (capped at 400 days) vs PACE window (untruncated — stats
  // must never hide history just because the visual grid does)
  const renderWin = contributionWindow(firstDate, targetDate, today)
  const paceWin = contributionWindow(firstDate, targetDate, today, 100_000)
  const amountByDay = new Map(contribs.map((c) => [isoDayUTC(c.date), Number(c.amountMilli)]))
  const grid = renderWin ? buildGrid(renderWin, today) : { pad: 0, cells: [], labels: [] }
  const dayInputs = grid.cells.map((c) => ({
    iso: c.iso,
    amountMilli: amountByDay.get(c.iso) ?? 0,
    tasksDone: tasksByDay.get(c.iso) ?? 0,
  }))
  // all-time day series for totals + streaks (contribution days + task days)
  const allDaySet = new Set<string>([...amountByDay.keys(), ...tasksByDay.keys()])
  const allDays = Array.from(allDaySet).sort().map((iso) => ({
    iso,
    amountMilli: amountByDay.get(iso) ?? 0,
    tasksDone: tasksByDay.get(iso) ?? 0,
  }))
  const benchmark = paceWin ? dailyBenchmarkMilli(targetValueMilli, paceWin) : null
  const levels = gridLevels(dayInputs, { hasMetric: metric != null, benchmark })
  const totalMilli = allDays.reduce((s, d) => s + d.amountMilli, 0)
  const pace = paceWin
    ? paceInfo({ totalMilli, targetValueMilli, windowStart: paceWin.start, targetDate, today })
    : null
  const needed = neededPerDayMilli(targetValueMilli, totalMilli, targetDate, today)
  const projection = paceWin ? projectedFinish(totalMilli, targetValueMilli, paceWin.start, today) : null

  // weekly/monthly roll-ups over FULL history (never the capped render
  // window — Decision #43). Metric goals sum amounts; metric-less goals
  // count active task days so the rhythm still reads.
  const rollupByDay = new Map<string, number>()
  for (const d of allDays) rollupByDay.set(d.iso, metric != null ? d.amountMilli : d.tasksDone > 0 ? 1 : 0)

  return {
    goal: {
      id: goal.id,
      title: goal.title,
      emoji: goal.emoji,
      color: goal.color,
      metric,
      unitLabel: goal.unitLabel,
      targetValueMilli,
      targetDate,
      status: goal.status,
      createdAt: goal.createdAt.toISOString(),
    },
    today,
    window: renderWin,
    pad: grid.pad,
    labels: grid.labels,
    days: grid.cells.map((c, i) => ({
      iso: c.iso,
      amountMilli: amountByDay.get(c.iso) ?? 0,
      tasksDone: tasksByDay.get(c.iso) ?? 0,
      level: levels[i],
      future: c.future,
    })),
    stats: {
      totalMilli,
      daysLogged: allDays.filter((d) => d.amountMilli > 0).length,
      taskDays: allDays.filter((d) => d.tasksDone > 0).length,
      currentStreak: currentStreak(allDays, today, { hasMetric: metric != null }),
      bestStreak: bestStreak(allDays, { hasMetric: metric != null }),
      benchmarkMilli: benchmark,
      actualPct: pace?.actualPct ?? null,
      expectedPct: pace?.expectedPct ?? null,
      deltaPp: pace?.deltaPp ?? null,
      band: pace?.band ?? null,
      neededPerDayMilli: needed,
      projectedDate: projection,
    },
    rollups: {
      weeks: rollupWeeks(rollupByDay, today),
      months: rollupMonths(rollupByDay, today),
    },
  }
}

/** Today widget rows: active metric goals with today's logged state. */
export async function goalContributionsForToday(userId: string, tz: string, limit = 6) {
  const today = todayISO(tz)
  const goals = await db.goal.findMany({
    where: { userId, status: 'active', metric: { in: ['money', 'count'] } },
    include: { contributions: { where: { date: toUTC(today) }, select: { amountMilli: true } } },
    orderBy: { createdAt: 'desc' },
  })
  if (goals.length === 0) return []
  const totals = await db.goalContribution.groupBy({
    by: ['goalId'],
    where: { userId, goalId: { in: goals.map((g) => g.id) } },
    _sum: { amountMilli: true },
  })
  const totalByGoal = new Map(totals.map((t) => [t.goalId, Number(t._sum.amountMilli ?? 0)]))
  const rows = goals.map((g) => {
    const targetDate = g.targetDate ? isoDayUTC(g.targetDate) : null
    const total = totalByGoal.get(g.id) ?? 0
    const target = g.targetValueMilli != null ? Number(g.targetValueMilli) : null
    return {
      id: g.id,
      title: g.title,
      emoji: g.emoji,
      color: g.color,
      metric: g.metric as GoalMetric,
      unitLabel: g.unitLabel,
      todayMilli: g.contributions.reduce((s, c) => s + Number(c.amountMilli), 0),
      loggedToday: g.contributions.length > 0,
      neededPerDayMilli: neededPerDayMilli(target, total, targetDate, today),
      targetDate,
    }
  })
  // unlogged goals first — the widget is a nudge, not a trophy case
  return rows.sort((a, b) => Number(a.loggedToday) - Number(b.loggedToday)).slice(0, limit)
}

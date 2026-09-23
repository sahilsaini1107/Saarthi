// Ideas Lab service (Phase 18): CRUD + pipeline shaping + Today snapshot.
// Every query is user-scoped (RLS-equivalent). All ICE/pipeline/spark math
// is pure in lib/ideas.ts — this layer fetches, validates and shapes.

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { isoDayUTC, todayISO } from '@/lib/date'
import {
  ageLabel,
  daysInPipeline,
  iceBand,
  iceScore,
  ideaCategoryMeta,
  IDEA_STATUS_META,
  isIdeaCategory,
  isIdeaStatus,
  ideaStats,
  sortForAction,
  sparkOfTheDay,
  type IdeaLike,
} from '@/lib/ideas'
import { parseTags } from '@/lib/reading'
import type { IdeaDTO } from '@/lib/types'

const LEAN_FIELDS = ['problem', 'audience', 'value', 'solution', 'revenue', 'costs', 'metrics', 'advantage'] as const
type LeanField = (typeof LEAN_FIELDS)[number]

const FIELD_LIMITS: Record<string, number> = {
  problem: 1000,
  solution: 1000,
  audience: 500,
  value: 500,
  revenue: 500,
  costs: 500,
  metrics: 500,
  advantage: 500,
  nextStep: 200,
  notes: 2000,
}

export interface IdeaInput {
  title?: string
  category?: string
  status?: string
  nextStep?: string | null
  impact?: number
  confidence?: number
  effort?: number
  tags?: string | null
  notes?: string | null
  problem?: string | null
  audience?: string | null
  value?: string | null
  solution?: string | null
  revenue?: string | null
  costs?: string | null
  metrics?: string | null
  advantage?: string | null
}

function validate(input: IdeaInput & { title: string }) {
  if (!input.title.trim()) throw new HttpError('Idea title is required', 422)
  if (input.title.trim().length > 120) throw new HttpError('Title must be 120 characters or fewer', 422)
  if (input.category != null && !isIdeaCategory(input.category)) throw new HttpError('Unknown idea category', 422)
  if (input.status != null && !isIdeaStatus(input.status)) throw new HttpError('Unknown idea status', 422)
  for (const f of LEAN_FIELDS) {
    const v = input[f]
    if (v != null && v.length > FIELD_LIMITS[f]) throw new HttpError(`${f} must be ${FIELD_LIMITS[f]} characters or fewer`, 422)
  }
  if (input.nextStep != null && input.nextStep.length > FIELD_LIMITS.nextStep) {
    throw new HttpError('Next step must be 200 characters or fewer', 422)
  }
  if (input.notes != null && input.notes.length > FIELD_LIMITS.notes) {
    throw new HttpError('Notes must be 2000 characters or fewer', 422)
  }
  for (const k of ['impact', 'confidence', 'effort'] as const) {
    const v = input[k]
    if (v != null && (!Number.isInteger(v) || v < 1 || v > 10)) throw new HttpError(`${k} must be an integer between 1 and 10`, 422)
  }
  if (input.tags != null && input.tags.length > 200) throw new HttpError('Tags must be 200 characters or fewer', 422)
}

type IdeaRow = {
  id: string
  title: string
  category: string
  status: string
  problem: string | null
  audience: string | null
  value: string | null
  solution: string | null
  revenue: string | null
  costs: string | null
  metrics: string | null
  advantage: string | null
  nextStep: string | null
  impact: number
  confidence: number
  effort: number
  tags: string | null
  notes: string | null
  launchedAt: Date | null
  createdAt: Date
}

function shape(row: IdeaRow, today: string): IdeaDTO {
  const ice = iceScore(row.impact, row.confidence, row.effort)
  const statusMeta = IDEA_STATUS_META[row.status as keyof typeof IDEA_STATUS_META]
  const addedOn = isoDayUTC(row.createdAt)
  const ageDays = daysInPipeline(addedOn, today)
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    categoryLabel: ideaCategoryMeta(row.category).label,
    categoryEmoji: ideaCategoryMeta(row.category).emoji,
    status: row.status,
    statusLabel: statusMeta?.label ?? row.status,
    statusEmoji: statusMeta?.emoji ?? '💡',
    problem: row.problem,
    audience: row.audience,
    value: row.value,
    solution: row.solution,
    revenue: row.revenue,
    costs: row.costs,
    metrics: row.metrics,
    advantage: row.advantage,
    nextStep: row.nextStep,
    impact: row.impact,
    confidence: row.confidence,
    effort: row.effort,
    ice,
    iceBand: iceBand(ice),
    tags: parseTags(row.tags),
    notes: row.notes,
    launchedAt: row.launchedAt ? row.launchedAt.toISOString() : null,
    addedOn,
    ageDays,
    ageLabel: ageLabel(ageDays),
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listIdeas(userId: string, tz: string): Promise<IdeaDTO[]> {
  const rows = await db.idea.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  const today = todayISO(tz)
  const shaped = rows.map((r) => shape(r, today))
  // pipeline forward-first, then ICE; launched by recency; shelved last
  const launched = shaped.filter((i) => i.status === 'launched').sort((a, b) => (b.launchedAt ?? '').localeCompare(a.launchedAt ?? ''))
  const shelved = shaped.filter((i) => i.status === 'parked' || i.status === 'dropped')
  return [...sortForAction(shaped.filter((i) => !['launched', 'parked', 'dropped'].includes(i.status))), ...launched, ...shelved]
}

export async function createIdea(userId: string, input: IdeaInput, tz: string): Promise<IdeaDTO> {
  const title = input.title?.trim() ?? ''
  validate({ ...input, title })
  const status = input.status ?? 'spark'
  const row = await db.idea.create({
    data: {
      userId,
      title,
      category: input.category ?? 'other',
      status,
      nextStep: input.nextStep?.trim() || null,
      impact: input.impact ?? 5,
      confidence: input.confidence ?? 5,
      effort: input.effort ?? 5,
      tags: input.tags?.trim() || null,
      notes: input.notes?.trim() || null,
      problem: input.problem?.trim() || null,
      audience: input.audience?.trim() || null,
      value: input.value?.trim() || null,
      solution: input.solution?.trim() || null,
      revenue: input.revenue?.trim() || null,
      costs: input.costs?.trim() || null,
      metrics: input.metrics?.trim() || null,
      advantage: input.advantage?.trim() || null,
      ...(status === 'launched' ? { launchedAt: new Date() } : {}),
    },
  })
  return shape(row, todayISO(tz))
}

export async function updateIdea(userId: string, id: string, input: IdeaInput, tz: string): Promise<IdeaDTO> {
  const existing = await db.idea.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Idea not found', 404)
  const merged: IdeaInput & { title: string } = {
    title: (input.title ?? existing.title).trim(),
    category: input.category ?? existing.category,
    status: input.status ?? existing.status,
    nextStep: input.nextStep !== undefined ? input.nextStep?.trim() || null : existing.nextStep,
    impact: input.impact ?? existing.impact,
    confidence: input.confidence ?? existing.confidence,
    effort: input.effort ?? existing.effort,
    tags: input.tags !== undefined ? input.tags?.trim() || null : existing.tags,
    notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
  }
  for (const f of LEAN_FIELDS) {
    merged[f] = input[f] !== undefined ? input[f]?.trim() || null : (existing[f as keyof IdeaRow] as string | null)
  }
  validate(merged)
  const row = await db.idea.update({
    where: { id },
    data: {
      title: merged.title,
      category: merged.category,
      status: merged.status,
      nextStep: merged.nextStep,
      impact: merged.impact,
      confidence: merged.confidence,
      effort: merged.effort,
      tags: merged.tags,
      notes: merged.notes,
      problem: merged.problem,
      audience: merged.audience,
      value: merged.value,
      solution: merged.solution,
      revenue: merged.revenue,
      costs: merged.costs,
      metrics: merged.metrics,
      advantage: merged.advantage,
      ...(merged.status === 'launched' && existing.status !== 'launched' ? { launchedAt: new Date() } : {}),
      ...(merged.status !== 'launched' && existing.status === 'launched' ? { launchedAt: null } : {}),
    },
  })
  return shape(row, todayISO(tz))
}

export async function deleteIdea(userId: string, id: string): Promise<void> {
  const existing = await db.idea.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Idea not found', 404)
  await db.idea.delete({ where: { id } })
}

/* ---------- Today snapshot ---------- */

export interface IdeasToday {
  total: number
  pipelineCount: number
  sparkCount: number
  launchedCount: number
  avgIce: number | null
  bestIce: number | null
  /** deterministic spark-of-the-day over the live pipeline (null when empty) */
  sparkToday: { id: string; title: string; category: string; categoryEmoji: string; nextStep: string | null; ice: number | null } | null
}

export async function ideasForToday(userId: string, tz: string): Promise<IdeasToday> {
  const rows = await db.idea.findMany({
    where: { userId },
    select: { id: true, title: true, status: true, impact: true, confidence: true, effort: true, category: true, nextStep: true },
  })
  const today = todayISO(tz)
  const stats = ideaStats(rows as IdeaLike[])
  const pool = rows
    .filter((r) => r.status === 'spark' || r.status === 'exploring' || r.status === 'planned')
    .map((r) => ({ ...r, ice: iceScore(r.impact, r.confidence, r.effort) }))
  const spark = sparkOfTheDay(pool, today)
  return {
    total: stats.total,
    pipelineCount: stats.pipelineCount,
    sparkCount: stats.sparks,
    launchedCount: stats.launched,
    avgIce: stats.avgIce,
    bestIce: stats.bestIce,
    sparkToday: spark
      ? { id: spark.id, title: spark.title, category: spark.category, categoryEmoji: ideaCategoryMeta(spark.category).emoji, nextStep: spark.nextStep, ice: spark.ice }
      : null,
  }
}

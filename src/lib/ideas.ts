// Ideas Lab (Phase 18) — ICE scoring, pipeline ordering, spark-of-the-day.
// All pure functions with an injectable "today" (Decision #8 pattern).
//
// Semantics (simpler interpretation, documented in PROGRESS.md):
//  - ICE score = impact × confidence ÷ effort, inputs 1..10, score rounded to
//    2 decimals (repo Math.round convention). Derived at read time — the
//    inputs are the stored truth, so re-tuning an input instantly re-ranks.
//  - pipeline: spark → exploring → planned → launched; parked/dropped shelve
//    an idea without losing its notes. "launched" stamps launchedAt.
//  - today's spark = a deterministic rotation over the active pipeline
//    (hash(date) % pool, Decision #58 quote pattern): same day → same idea
//    everywhere, no RNG, no state.
//  - lean-canvas fields are free-text blocks on the idea row (problem,
//    audience, value, solution, revenue, costs, metrics, advantage) — simpler
//    than a structured sub-model, editable in one sheet.

import type { ISODate } from './date'
import { hashString, parseTags } from './reading'

/* ---------- categories & statuses ---------- */

export const IDEA_CATEGORIES = [
  { key: 'business', label: 'Business', emoji: '💼' },
  { key: 'startup', label: 'Startup', emoji: '🚀' },
  { key: 'product', label: 'Product', emoji: '🧩' },
  { key: 'content', label: 'Content', emoji: '🎥' },
  { key: 'personal', label: 'Personal', emoji: '🌱' },
  { key: 'other', label: 'Other', emoji: '✨' },
] as const

export type IdeaCategory = (typeof IDEA_CATEGORIES)[number]['key']

export function isIdeaCategory(c: string): c is IdeaCategory {
  return IDEA_CATEGORIES.some((c2) => c2.key === c)
}

export function ideaCategoryMeta(key: string): { label: string; emoji: string } {
  return IDEA_CATEGORIES.find((c) => c.key === key) ?? IDEA_CATEGORIES[IDEA_CATEGORIES.length - 1]
}

export const IDEA_STATUSES = ['spark', 'exploring', 'planned', 'launched', 'parked', 'dropped'] as const
export type IdeaStatus = (typeof IDEA_STATUSES)[number]

export function isIdeaStatus(s: string): s is IdeaStatus {
  return (IDEA_STATUSES as readonly string[]).includes(s)
}

export const IDEA_STATUS_META: Record<IdeaStatus, { label: string; emoji: string }> = {
  spark: { label: 'Spark', emoji: '💡' },
  exploring: { label: 'Exploring', emoji: '🔍' },
  planned: { label: 'Planned', emoji: '🛠️' },
  launched: { label: 'Launched', emoji: '🚢' },
  parked: { label: 'Parked', emoji: '⏸️' },
  dropped: { label: 'Dropped', emoji: '✖️' },
}

/** The live pipeline, in forward order (launched is the exit; parked/dropped shelve). */
export const PIPELINE_STATUSES: readonly IdeaStatus[] = ['spark', 'exploring', 'planned']

export function statusRank(s: string): number {
  const idx = PIPELINE_STATUSES.indexOf(s as IdeaStatus)
  return idx >= 0 ? idx : PIPELINE_STATUSES.length
}

/** The next forward stage (null at planned — the exit is a deliberate launch). */
export function nextPipelineStatus(s: string): IdeaStatus | null {
  const idx = PIPELINE_STATUSES.indexOf(s as IdeaStatus)
  if (idx < 0 || idx === PIPELINE_STATUSES.length - 1) return null
  return PIPELINE_STATUSES[idx + 1]
}

/* ---------- ICE scoring ---------- */

/** Round to 2 decimals — the repo-wide convention. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * ICE score = impact × confidence ÷ effort (each 1..10). Returns null when
 * inputs are out of range or the division is impossible — "no data" is never
 * a fake score (Decision #61 spirit).
 */
export function iceScore(impact: number, confidence: number, effort: number): number | null {
  for (const v of [impact, confidence, effort]) {
    if (!Number.isInteger(v) || v < 1 || v > 10) return null
  }
  if (effort <= 0) return null
  return round2((impact * confidence) / effort)
}

export type IceBand = 'strong' | 'promising' | 'seed'

/** Chip color banding: strong ≥ 15 · promising ≥ 8 · otherwise a seed. */
export function iceBand(score: number | null): IceBand {
  if (score == null) return 'seed'
  if (score >= 15) return 'strong'
  if (score >= 8) return 'promising'
  return 'seed'
}

export interface IdeaLike {
  id: string
  title: string
  status: string
  impact: number
  confidence: number
  effort: number
}

/** Pipeline-first ordering: forward stages, then score desc, then title. */
export function sortForAction<T extends IdeaLike>(items: readonly T[]): T[] {
  return items
    .map((it) => ({ it, score: iceScore(it.impact, it.confidence, it.effort) ?? 0 }))
    .sort(
      (a, b) =>
        statusRank(a.it.status) - statusRank(b.it.status) ||
        b.score - a.score ||
        a.it.title.localeCompare(b.it.title),
    )
    .map((x) => x.it)
}

/* ---------- today's spark ---------- */

/**
 * Deterministic spark-of-the-day over the pool (caller filters to the active
 * pipeline): hash(today) % pool.length on an id-sorted list. Same day → same
 * pick everywhere; empty pool → null; pool member guaranteed.
 */
export function sparkOfTheDay<T extends { id: string }>(pool: readonly T[], today: ISODate): T | null {
  if (pool.length === 0) return null
  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return sorted[hashString(today) % sorted.length]
}

/* ---------- stats ---------- */

export function daysInPipeline(createdAt: ISODate, today: ISODate): number {
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${createdAt}T00:00:00.000Z`)) / 86_400_000))
}

export interface IdeaStats {
  total: number
  sparks: number
  exploring: number
  planned: number
  launched: number
  parked: number
  dropped: number
  pipelineCount: number
  /** mean ICE of the live pipeline, 2-decimal; null when empty */
  avgIce: number | null
  /** best ICE anywhere that isn't dropped/parked; null when empty */
  bestIce: number | null
}

export function ideaStats(items: readonly IdeaLike[]): IdeaStats {
  let sparks = 0
  let exploring = 0
  let planned = 0
  let launched = 0
  let parked = 0
  let dropped = 0
  let iceSum = 0
  let iceCount = 0
  let best: number | null = null
  for (const it of items) {
    if (it.status === 'spark') sparks++
    else if (it.status === 'exploring') exploring++
    else if (it.status === 'planned') planned++
    else if (it.status === 'launched') launched++
    else if (it.status === 'parked') parked++
    else dropped++
    const score = iceScore(it.impact, it.confidence, it.effort)
    if (score != null) {
      if (it.status === 'spark' || it.status === 'exploring' || it.status === 'planned') {
        iceSum += score
        iceCount++
      }
      if (it.status !== 'dropped' && it.status !== 'parked' && (best === null || score > best)) best = score
    }
  }
  return {
    total: items.length,
    sparks,
    exploring,
    planned,
    launched,
    parked,
    dropped,
    pipelineCount: sparks + exploring + planned,
    avgIce: iceCount > 0 ? round2(iceSum / iceCount) : null,
    bestIce: best,
  }
}

/** Age label for a card ("today", "3d", "2mo", "1y+"). */
export function ageLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days < 60) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y+`
}

export { parseTags }

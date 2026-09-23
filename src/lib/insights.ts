// Insights (Phase 5.4) — a deterministic, rule-based intelligence layer.
// PURE: the builder takes measured aggregates and returns ranked insights;
// it never reads the clock or the DB (services/insights.ts does that).
//
// Ranking (Decision #28): warnings first, then positives, then infos;
// within a severity, larger magnitude first. Capped (default 6). Every rule
// is silent unless its threshold fires — no filler insights.

import { formatINRCompact } from '@/lib/money'

export type InsightSeverity = 'warning' | 'positive' | 'info'

export interface Insight {
  id: string
  severity: InsightSeverity
  emoji: string
  title: string
  body: string
  /** deep-link the card opens, when it has an obvious home */
  route?: string
}

/** internal shape while ranking — magnitude is stripped from the public payload */
interface RankedInsight extends Insight {
  magnitude: number
}

export interface InsightsInput {
  budgets: {
    categoryName: string
    band: 'over' | 'watch' | 'on_track' | 'none'
    overspendPaise: number
    overPacePaise: number // spent − expected at current pace, ≥0 on watch
  }[]
  trips: {
    name: string
    ongoing: boolean
    overBudgetPaise: number // 0 when within budget / no budget
  }[]
  categoriesMoM: {
    // current-month category spend vs previous month, expense side only
    name: string
    emoji: string
    currentPaise: number
    prevPaise: number
  }[]
  biggestExpense: { amountPaise: number; categoryName: string | null } | null
  savingsRatePct: number | null
  netWorthDeltaPct: number | null
  habits: { name: string; emoji: string; streak: number; built: boolean }[]
  coursesAtRisk: { title: string }[]
  revisionsDue: number
  journal: { streak: number; daysSinceLast: number | null }
  maturitiesSoon: { kind: 'fd' | 'rd'; title: string; daysLeft: number }[]
}

const CAT_JUMP_MIN_INCREASE_PAISE = 50_000 // ₹500
const CAT_JUMP_MIN_PCT = 30
const BIG_EXPENSE_MIN_PAISE = 500_000 // ₹5,000
const NET_WORTH_MOVE_MIN_PCT = 0.5
const JOURNAL_NUDGE_AFTER_DAYS = 3

export function buildInsights(input: InsightsInput, cap = 6): Insight[] {
  const out: RankedInsight[] = []

  /* ---------- warnings ---------- */
  for (const b of input.budgets) {
    if (b.band === 'over') {
      out.push({
        id: `budget-over-${b.categoryName}`,
        severity: 'warning',
        emoji: '🚨',
        title: `${b.categoryName} is over budget`,
        body: `Overspent by ${formatINRCompact(b.overspendPaise)} this month. Time to rein it in.`,
        route: '/money/budgets',
        magnitude: b.overspendPaise,
      })
    } else if (b.band === 'watch') {
      out.push({
        id: `budget-watch-${b.categoryName}`,
        severity: 'warning',
        emoji: '⚠️',
        title: `${b.categoryName} is ahead of pace`,
        body: `${formatINRCompact(b.overPacePaise)} over the calendar pace. Ease off to land on budget.`,
        route: '/money/budgets',
        magnitude: b.overPacePaise,
      })
    }
  }

  for (const t of input.trips) {
    if (t.ongoing && t.overBudgetPaise > 0) {
      out.push({
        id: `trip-over-${t.name}`,
        severity: 'warning',
        emoji: '🧳',
        title: `${t.name} is over its budget`,
        body: `Trip spending crossed the cap by ${formatINRCompact(t.overBudgetPaise)}.`,
        route: '/money/travel',
        magnitude: t.overBudgetPaise,
      })
    }
  }

  for (const c of input.categoriesMoM) {
    if (c.prevPaise > 0 && c.currentPaise > c.prevPaise) {
      const pct = ((c.currentPaise - c.prevPaise) / c.prevPaise) * 100
      const increase = c.currentPaise - c.prevPaise
      if (pct >= CAT_JUMP_MIN_PCT && increase >= CAT_JUMP_MIN_INCREASE_PAISE) {
        out.push({
          id: `cat-jump-${c.name}`,
          severity: 'warning',
          emoji: c.emoji,
          title: `${c.name} up ${Math.round(pct)}% this month`,
          body: `${formatINRCompact(increase)} more than last month (${formatINRCompact(c.currentPaise)} vs ${formatINRCompact(c.prevPaise)}).`,
          route: '/money/overview',
          magnitude: increase,
        })
      }
    }
  }

  for (const course of input.coursesAtRisk) {
    out.push({
      id: `course-risk-${course.title}`,
      severity: 'warning',
      emoji: '📚',
      title: `"${course.title}" is falling behind`,
      body: 'Pacing says at-risk. A short session today gets it back on track.',
      route: '/growth/study',
      magnitude: 1,
    })
  }

  if (input.savingsRatePct !== null && input.savingsRatePct < 0) {
    out.push({
      id: 'savings-negative',
      severity: 'warning',
      emoji: '🩸',
      title: 'Spending outpaced income this month',
      body: 'You are spending more than you earn — the deficit is eating your balance.',
      route: '/money/overview',
      magnitude: Math.abs(input.savingsRatePct),
    })
  }

  /* ---------- positives ---------- */
  for (const h of input.habits) {
    if (h.built && h.streak > 0) {
      out.push({
        id: `habit-built-${h.name}`,
        severity: 'positive',
        emoji: '🏗️',
        title: `${h.name} is built`,
        body: `66 days done and the streak is alive at ${h.streak}. This habit is yours now.`,
        route: '/growth/habits',
        magnitude: 1_000_000 + h.streak,
      })
    } else if (h.streak >= 7) {
      out.push({
        id: `habit-streak-${h.name}`,
        severity: 'positive',
        emoji: h.emoji,
        title: `${h.streak}-day streak on ${h.name}`,
        body: h.streak >= 21 ? 'Momentum is compounding — protect the chain.' : 'One week of consistency. Keep the chain alive.',
        route: '/growth/habits',
        magnitude: h.streak,
      })
    }
  }

  if (input.savingsRatePct !== null && input.savingsRatePct >= 20) {
    out.push({
      id: 'savings-strong',
      severity: 'positive',
      emoji: '💰',
      title: `Saving ${Math.round(input.savingsRatePct)}% of income`,
      body: 'This month is going to your future self. Excellent discipline.',
      route: '/money/overview',
      magnitude: input.savingsRatePct,
    })
  }

  if (input.netWorthDeltaPct !== null && input.netWorthDeltaPct >= NET_WORTH_MOVE_MIN_PCT) {
    out.push({
      id: 'networth-up',
      severity: 'positive',
      emoji: '📈',
      title: `Net worth up ${input.netWorthDeltaPct.toFixed(1)}%`,
      body: 'Your money grew since the last snapshot. Compounding is on your side.',
      route: '/money/overview',
      magnitude: input.netWorthDeltaPct,
    })
  }

  if (input.journal.streak >= 3) {
    out.push({
      id: 'journal-streak',
      severity: 'positive',
      emoji: '📔',
      title: `${input.journal.streak}-day journaling streak`,
      body: 'Your future self will thank you for these pages.',
      route: '/journal',
      magnitude: input.journal.streak,
    })
  }

  /* ---------- infos ---------- */
  const soonest = input.maturitiesSoon.slice().sort((a, b) => a.daysLeft - b.daysLeft)[0]
  if (soonest) {
    out.push({
      id: `maturity-${soonest.title}`,
      severity: 'info',
      emoji: soonest.kind === 'fd' ? '🏦' : 'piggy',
      title: `${soonest.kind.toUpperCase()} ${soonest.title} matures in ${soonest.daysLeft} day${soonest.daysLeft === 1 ? '' : 's'}`,
      body: 'Plan the reinvestment before the money lands idle.',
      route: '/money/fds',
      magnitude: 1 / Math.max(soonest.daysLeft, 1),
    })
  }

  if (input.biggestExpense && input.biggestExpense.amountPaise >= BIG_EXPENSE_MIN_PAISE) {
    out.push({
      id: 'big-expense',
      severity: 'info',
      emoji: '🧾',
      title: `Biggest expense: ${formatINRCompact(input.biggestExpense.amountPaise)}`,
      body: input.biggestExpense.categoryName
        ? `Largest single spend this month — ${input.biggestExpense.categoryName}.`
        : 'Largest single spend this month.',
      route: '/money/transactions',
      magnitude: input.biggestExpense.amountPaise,
    })
  }

  if (input.revisionsDue >= 5) {
    out.push({
      id: 'revisions-pile',
      severity: 'info',
      emoji: '🔁',
      title: `${input.revisionsDue} revisions due`,
      body: 'Clearing them today keeps the forgetting curve honest.',
      route: '/growth/study',
      magnitude: input.revisionsDue,
    })
  }

  if (input.journal.daysSinceLast !== null && input.journal.streak === 0 && input.journal.daysSinceLast >= JOURNAL_NUDGE_AFTER_DAYS) {
    out.push({
      id: 'journal-gap',
      severity: 'info',
      emoji: '✍️',
      title: `No journal entry for ${input.journal.daysSinceLast} days`,
      body: 'Two minutes tonight keeps the memory bank full.',
      route: '/journal',
      magnitude: input.journal.daysSinceLast,
    })
  }

  const rank: Record<InsightSeverity, number> = { warning: 0, positive: 1, info: 2 }
  const ranked: RankedInsight[] = out
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.magnitude - a.magnitude)
    .slice(0, cap)
  return ranked.map(({ magnitude: _m, ...insight }) => insight)
}

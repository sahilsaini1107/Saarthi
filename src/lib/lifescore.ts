// Life Score (Phase 5.3) — one honest number for how life is going, built
// from the three pillars Saarthi already tracks. PURE math, no clock reads —
// callers pass in measured inputs.
//
// Design (Decision #27):
//  - Each pillar is the mean of its COMPONENT scores (0..100).
//  - A component with no data is null and is SKIPPED (it neither rewards nor
//    punishes). A pillar with no measurable components is null.
//  - The overall score is the mean of the present pillars, rounded to the
//    nearest integer. All pillars null → overall null ("not enough data").
//  - Scores are computed on read; nothing is stored (no staleness possible).

export interface LifeScoreComponents {
  /** (in − out) / in for the month, as a percentage — null when no income recorded */
  savingsRatePct: number | null
  /** share of budgets on track, 0..1 — null when no budgets set */
  budgetOnTrackRatio: number | null
  /** net worth vs last snapshot: true up / false down / null no history */
  netWorthUp: boolean | null
  /** mean 30-day completion rate across active habits, 0..1 — null when no habits */
  habitRate30: number | null
  /** workout minutes over the trailing 7 days — null when no workouts ever */
  workoutMinutes7d: number | null
  /** study minutes over the trailing 7 days — null when no sessions ever */
  studyMinutes7d: number | null
  /** journal entries in the last 30 days — null when never journaled */
  journalEntries30d: number | null
  /** mean mood of the last 10 entries, 0..100 — null when no moods logged */
  moodScore: number | null
  /** skincare either-or streak, days — null when never checked in */
  skinStreak: number | null
  /**
   * milestone-journal minutes over the trailing 7 days — null when no goal
   * journal entry was ever written (Phase 12, optional: additive component so
   * existing payloads and tests stay valid, same precedent as pickable?).
   */
  goalJournalMinutes7d?: number | null
  /**
   * Life-principles adherence over the trailing 30 days (kept / judged,
   * 0..1) — null when no principle has ever been reviewed (Phase 15,
   * optional additive component, same precedent as goalJournalMinutes7d).
   */
  principleAdherence30?: number | null
  /**
   * Reading minutes over the trailing 7 days — null when no reading session
   * was ever logged (Phase F, optional additive components follow the same
   * precedent: a feature never touched reads as null, not zero effort).
   */
  readingMinutes7d?: number | null
  /** Skill practice minutes over the trailing 7 days — null when never practiced. */
  skillMinutes7d?: number | null
  /** Content items completed in the trailing 30 days — null when nothing was ever saved. */
  contentDone30?: number | null
  /**
   * Share of live (spark/exploring/planned) ideas that carry a concrete next
   * step, 0..1 — null when there is no live idea to judge. Measures the
   * QUALITY of idea practice (a wish with a next action is a plan), not the
   * count of ideas.
   */
  ideaNextStepRatio?: number | null
  /** Share of active people currently within their reconnect cadence, 0..1 — null when no active people. */
  peopleOkRatio?: number | null
  /**
   * Protein-target hit ratio over days WITH meal/nutrition data in the
   * trailing 7 days, 0..1 — null when no day was ever logged or no protein
   * target exists. Unlogged days are skipped, not punished (Decision #27).
   */
  mealProteinHit7?: number | null
}

export interface PillarScore {
  score: number | null
  components: { label: string; score: number | null }[]
}

export interface LifeScore {
  overall: number | null
  wealth: PillarScore
  growth: PillarScore
  reflection: PillarScore
}

/* ---------- component mappings (all clamped 0..100) ---------- */

/** Savings rate → score: ≤0% → 0, ≥30% → 100, linear between. */
export function savingsRateScore(savingsRatePct: number | null): number | null {
  if (savingsRatePct === null || !Number.isFinite(savingsRatePct)) return null
  return clamp((savingsRatePct / 30) * 100)
}

/** Budget adherence: share of on-track budgets → score. */
export function budgetScore(onTrackRatio: number | null): number | null {
  if (onTrackRatio === null || !Number.isFinite(onTrackRatio)) return null
  return clamp(onTrackRatio * 100)
}

/** Net-worth direction: up = 100, down = 0, no history = null. */
export function netWorthScore(netWorthUp: boolean | null): number | null {
  if (netWorthUp === null) return null
  return netWorthUp ? 100 : 0
}

/** Habit consistency: mean 30-day rate → score. */
export function habitScore(rate30: number | null): number | null {
  if (rate30 === null || !Number.isFinite(rate30)) return null
  return clamp(rate30 * 100)
}

/** Movement: minutes vs a 150 min/week target (WHO-ish floor for adults). */
export const WORKOUT_WEEKLY_TARGET_MIN = 150
export function workoutScore(minutes7d: number | null): number | null {
  if (minutes7d === null || !Number.isFinite(minutes7d)) return null
  return clamp((minutes7d / WORKOUT_WEEKLY_TARGET_MIN) * 100)
}

/** Learning: minutes vs a 120 min/week target (~17 min/day). */
export const STUDY_WEEKLY_TARGET_MIN = 120
export function studyScore(minutes7d: number | null): number | null {
  if (minutes7d === null || !Number.isFinite(minutes7d)) return null
  return clamp((minutes7d / STUDY_WEEKLY_TARGET_MIN) * 100)
}

/** Journaling consistency: 20 entries in 30 days (~2 of every 3 days) = 100. */
export const JOURNAL_MONTHLY_TARGET = 20
export function journalScore(entries30d: number | null): number | null {
  if (entries30d === null || !Number.isFinite(entries30d)) return null
  return clamp((entries30d / JOURNAL_MONTHLY_TARGET) * 100)
}

/** Mood already arrives as 0..100. */
export function moodScore(mood0to100: number | null): number | null {
  if (mood0to100 === null || !Number.isFinite(mood0to100)) return null
  return clamp(mood0to100)
}

/** Skincare streak: 21 days (three weeks) = 100. */
export const SKIN_STREAK_TARGET_DAYS = 21
export function skinScore(streakDays: number | null): number | null {
  if (streakDays === null || !Number.isFinite(streakDays)) return null
  return clamp((streakDays / SKIN_STREAK_TARGET_DAYS) * 100)
}

/**
 * Deliberate goal effort (Phase 12): milestone-journal minutes vs a
 * 150 min/week target (~21 min/day of focused work on your own goals —
 * slightly above the study floor because goal work is the thing you chose).
 * Pairing with the study component is intentional: course study and personal
 * goal effort are different disciplines, and each caps at 100.
 */
export const GOAL_JOURNAL_WEEKLY_TARGET_MIN = 150
export function goalJournalScore(minutes7d: number | null): number | null {
  if (minutes7d === null || !Number.isFinite(minutes7d)) return null
  return clamp((minutes7d / GOAL_JOURNAL_WEEKLY_TARGET_MIN) * 100)
}

/**
 * Character (Phase 15): share of judged days where the user kept their own
 * life principles, trailing 30 days. 0..1 ratio → straight percentage.
 * A principle nobody reviews is skipped (null) — same ever-used guard as
 * every other component.
 */
export function principleScore(adherence30: number | null): number | null {
  if (adherence30 === null || !Number.isFinite(adherence30)) return null
  return clamp(adherence30 * 100)
}

/* ---------- Phase F additions (task 20) ---------- */

/** Reading: minutes vs a 105 min/week target (15 min/day — one chapter-ish). */
export const READING_WEEKLY_TARGET_MIN = 105
export function readingScore(minutes7d: number | null): number | null {
  if (minutes7d === null || !Number.isFinite(minutes7d)) return null
  return clamp((minutes7d / READING_WEEKLY_TARGET_MIN) * 100)
}

/**
 * Skill practice: minutes vs a 150 min/week target (~21 min/day), matching
 * the goal-effort precedent — deliberate craft work deserves the same floor
 * as focused goal work, and each caps at 100.
 */
export const SKILL_WEEKLY_TARGET_MIN = 150
export function skillScore(minutes7d: number | null): number | null {
  if (minutes7d === null || !Number.isFinite(minutes7d)) return null
  return clamp((minutes7d / SKILL_WEEKLY_TARGET_MIN) * 100)
}

/**
 * Intentional media: content items completed vs 4/month (1 per week). The
 * library is a private watch/read-later vault — clearing what you chose to
 * save is the honest signal; watch-minutes are not tracked (Decision #76).
 */
export const CONTENT_MONTHLY_TARGET = 4
export function contentScore(done30: number | null): number | null {
  if (done30 === null || !Number.isFinite(done30)) return null
  return clamp((done30 / CONTENT_MONTHLY_TARGET) * 100)
}

/** Ideas: share of live ideas with a concrete next step → straight percentage. */
export function ideaScore(nextStepRatio: number | null): number | null {
  if (nextStepRatio === null || !Number.isFinite(nextStepRatio)) return null
  return clamp(nextStepRatio * 100)
}

/** People: share of active people within their reconnect cadence → straight percentage. */
export function peopleScore(okRatio: number | null): number | null {
  if (okRatio === null || !Number.isFinite(okRatio)) return null
  return clamp(okRatio * 100)
}

/** Fuel: share of logged days that hit the protein target → straight percentage. */
export function mealScore(proteinHitRatio: number | null): number | null {
  if (proteinHitRatio === null || !Number.isFinite(proteinHitRatio)) return null
  return clamp(proteinHitRatio * 100)
}

/* ---------- aggregation ---------- */

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v))
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function pillar(components: { label: string; score: number | null }[]): PillarScore {
  const present = components.map((c) => c.score).filter((s): s is number => s !== null)
  return {
    score: present.length > 0 ? Math.round(mean(present)) : null,
    components,
  }
}

/** Compute the full Life Score from measured inputs. */
export function computeLifeScore(c: LifeScoreComponents): LifeScore {
  const wealth = pillar([
    { label: 'Savings rate', score: savingsRateScore(c.savingsRatePct) },
    { label: 'Budgets on track', score: budgetScore(c.budgetOnTrackRatio) },
    { label: 'Net worth trend', score: netWorthScore(c.netWorthUp) },
  ])
  const growth = pillar([
    { label: 'Habit consistency', score: habitScore(c.habitRate30) },
    { label: 'Workout minutes', score: workoutScore(c.workoutMinutes7d) },
    { label: 'Study minutes', score: studyScore(c.studyMinutes7d) },
    { label: 'Goal effort', score: goalJournalScore(c.goalJournalMinutes7d ?? null) },
    { label: 'Principles kept', score: principleScore(c.principleAdherence30 ?? null) },
    // Phase F (task 20) — craft & intentional consumption (Decision #72)
    { label: 'Reading', score: readingScore(c.readingMinutes7d ?? null) },
    { label: 'Skill practice', score: skillScore(c.skillMinutes7d ?? null) },
    { label: 'Content cleared', score: contentScore(c.contentDone30 ?? null) },
    { label: 'Ideas with next step', score: ideaScore(c.ideaNextStepRatio ?? null) },
  ])
  const reflection = pillar([
    { label: 'Journaling', score: journalScore(c.journalEntries30d) },
    { label: 'Mood', score: moodScore(c.moodScore) },
    { label: 'Skincare streak', score: skinScore(c.skinStreak) },
    // Phase F (task 20) — care: relationships and fuel (Decision #72)
    { label: 'People in rhythm', score: peopleScore(c.peopleOkRatio ?? null) },
    { label: 'Protein target', score: mealScore(c.mealProteinHit7 ?? null) },
  ])

  const pillarScores = [wealth.score, growth.score, reflection.score].filter((s): s is number => s !== null)
  return {
    overall: pillarScores.length > 0 ? Math.round(mean(pillarScores)) : null,
    wealth,
    growth,
    reflection,
  }
}

/** Mood key (great..bad) → 0..100, in one place so journal + score agree. */
export function moodToScore(mood: 'great' | 'good' | 'okay' | 'low' | 'bad'): number {
  return { great: 100, good: 75, okay: 50, low: 25, bad: 0 }[mood]
}

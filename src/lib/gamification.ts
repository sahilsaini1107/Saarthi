// Gamification engine (Phase 7). XP, levels and badges are DERIVED from
// real activity counts — no event log, no double-awards, works retroactively
// for existing data (Decision #36). Everything here is pure and injectable.

export const XP_AWARDS = {
  habitCheckIn: 5,
  routineRun: 10,
  journalEntry: 10,
  workout: 8,
  studySession: 8,
  skinCheckIn: 3,
  billPayment: 5,
  transactionLogged: 2,
  goalTaskDone: 8,
  revisionDone: 5,
} as const

export type XpEvent = keyof typeof XP_AWARDS

/** Stats snapshot the profile is computed from (all counts, money in paise). */
export interface GamificationStats {
  habitEntries: number
  routineRuns: number
  journalEntries: number
  workouts: number
  studySessions: number
  studyMinutes: number
  skinCheckInDays: number
  billPayments: number
  transactions: number
  goalTasksDone: number
  revisionsDone: number
  longestHabitStreak: number
  journalStreak: number
  goalsAchieved: number
  /** latest stored net-worth total in paise (0 before first snapshot) */
  netWorthPaise: number
  /** 0–100 from the Life Score engine, null while unmeasurable */
  lifeScore: number | null
  /** last-30-day savings rate %, null while unmeasurable */
  savingsRatePct: number | null
  insurancePolicies: number
}

/** XP for the whole activity history — deterministic, order-free. */
export function xpForStats(s: GamificationStats): number {
  return (
    s.habitEntries * XP_AWARDS.habitCheckIn +
    s.routineRuns * XP_AWARDS.routineRun +
    s.journalEntries * XP_AWARDS.journalEntry +
    s.workouts * XP_AWARDS.workout +
    s.studySessions * XP_AWARDS.studySession +
    s.skinCheckInDays * XP_AWARDS.skinCheckIn +
    s.billPayments * XP_AWARDS.billPayment +
    s.transactions * XP_AWARDS.transactionLogged +
    s.goalTasksDone * XP_AWARDS.goalTaskDone +
    s.revisionsDone * XP_AWARDS.revisionDone
  )
}

/**
 * Cumulative XP required to REACH level L (level 1 starts at 0).
 * Advancing from level n to n+1 costs 100·n, so reach(L) = 100·(L−1)·L/2:
 * L2=100, L3=300, L4=600, L5=1000, L10=4500, L20=19000.
 */
export function cumulativeXpForLevel(level: number): number {
  if (level <= 1) return 0
  return (100 * (level - 1) * level) / 2
}

export interface LevelInfo {
  level: number
  title: string
  emoji: string
  xpIntoLevel: number
  xpForNext: number
  /** 0–100 progress through the current level */
  pct: number
}

/** Level titles — the charioteer's journey, mapped to XP bands. */
const LEVEL_BANDS: { minLevel: number; title: string; emoji: string }[] = [
  { minLevel: 1, title: 'Beginner', emoji: '🌱' },
  { minLevel: 3, title: 'Builder', emoji: '🧱' },
  { minLevel: 5, title: 'Consistent', emoji: '⚙️' },
  { minLevel: 7, title: 'Committed', emoji: '🔥' },
  { minLevel: 10, title: 'Pathfinder', emoji: '🧭' },
  { minLevel: 14, title: 'Disciplined', emoji: '🗡️' },
  { minLevel: 18, title: 'Life Master', emoji: '👑' },
]

export function levelTitle(level: number): { title: string; emoji: string } {
  let band = LEVEL_BANDS[0]
  for (const b of LEVEL_BANDS) if (level >= b.minLevel) band = b
  return { title: band.title, emoji: band.emoji }
}

export function levelInfo(xp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(xp))
  let level = 1
  // 10k XP ≈ level 15; a hard cap of 1000 iterations is purely defensive
  while (level < 999 && cumulativeXpForLevel(level + 1) <= safeXp) level++
  const base = cumulativeXpForLevel(level)
  const next = cumulativeXpForLevel(level + 1)
  const span = next - base
  const { title, emoji } = levelTitle(level)
  return {
    level,
    title,
    emoji,
    xpIntoLevel: safeXp - base,
    xpForNext: span,
    pct: Math.min(100, Math.round(((safeXp - base) / span) * 100)),
  }
}

/* ---------- badges ---------- */

export type BadgeTier = 'bronze' | 'silver' | 'gold'

export interface BadgeDef {
  id: string
  emoji: string
  title: string
  description: string
  tier: BadgeTier
  check: (s: GamificationStats) => boolean
}

export const BADGES: BadgeDef[] = [
  // habits
  { id: 'first-checkin', emoji: '🌱', title: 'First Step', description: 'Check in to a habit', tier: 'bronze', check: (s) => s.habitEntries >= 1 },
  { id: 'streak-7', emoji: '🔥', title: 'Week Warrior', description: '7-day habit streak', tier: 'bronze', check: (s) => s.longestHabitStreak >= 7 },
  { id: 'streak-30', emoji: '⚡', title: 'Month Machine', description: '30-day habit streak', tier: 'silver', check: (s) => s.longestHabitStreak >= 30 },
  { id: 'streak-66', emoji: '🏆', title: 'Habit Built', description: '66-day building mode complete', tier: 'gold', check: (s) => s.longestHabitStreak >= 66 },
  { id: 'streak-100', emoji: '💯', title: 'Centurion', description: '100-day habit streak', tier: 'gold', check: (s) => s.longestHabitStreak >= 100 },
  // journal / reflection
  { id: 'first-journal', emoji: '✍️', title: 'Dear Diary', description: 'Write your first journal entry', tier: 'bronze', check: (s) => s.journalEntries >= 1 },
  { id: 'journal-10', emoji: '📓', title: 'Reflector', description: '10 journal entries', tier: 'bronze', check: (s) => s.journalEntries >= 10 },
  { id: 'journal-50', emoji: '🏛️', title: 'Self Scholar', description: '50 journal entries', tier: 'silver', check: (s) => s.journalEntries >= 50 },
  { id: 'journal-streak-7', emoji: '🌙', title: 'Nightly Pages', description: '7-day journaling streak', tier: 'silver', check: (s) => s.journalStreak >= 7 },
  // body
  { id: 'first-workout', emoji: '💪', title: 'Iron Introduction', description: 'Log your first workout', tier: 'bronze', check: (s) => s.workouts >= 1 },
  { id: 'workout-25', emoji: '🏋️', title: 'Regular Resistor', description: '25 workouts logged', tier: 'silver', check: (s) => s.workouts >= 25 },
  { id: 'workout-100', emoji: '🥇', title: 'Body Banker', description: '100 workouts logged', tier: 'gold', check: (s) => s.workouts >= 100 },
  // study / growth
  { id: 'study-first', emoji: '📚', title: 'Student Again', description: 'Log your first study session', tier: 'bronze', check: (s) => s.studySessions >= 1 },
  { id: 'study-600m', emoji: '🎓', title: 'Deep Diver', description: '600 minutes studied', tier: 'silver', check: (s) => s.studyMinutes >= 600 },
  { id: 'revisions-10', emoji: '🔁', title: 'Memory Forger', description: '10 revisions completed', tier: 'silver', check: (s) => s.revisionsDone >= 10 },
  { id: 'tasks-25', emoji: '✅', title: 'Task Closer', description: '25 goal tasks done', tier: 'silver', check: (s) => s.goalTasksDone >= 25 },
  { id: 'goal-achieved', emoji: '🎯', title: 'Goal Getter', description: 'Achieve a goal', tier: 'gold', check: (s) => s.goalsAchieved >= 1 },
  // money
  { id: 'ledger-50', emoji: '🧾', title: 'Ledger Keeper', description: '50 transactions logged', tier: 'bronze', check: (s) => s.transactions >= 50 },
  { id: 'bills-12', emoji: '💳', title: 'Dues Dropper', description: '12 bills paid on time', tier: 'silver', check: (s) => s.billPayments >= 12 },
  { id: 'networth-1l', emoji: '💰', title: 'First Lakh', description: 'Net worth crosses ₹1 lakh', tier: 'bronze', check: (s) => s.netWorthPaise >= 10_000_000 },
  { id: 'networth-10l', emoji: '🚀', title: 'Ten Lakh Club', description: 'Net worth crosses ₹10 lakh', tier: 'silver', check: (s) => s.netWorthPaise >= 100_000_000 },
  { id: 'networth-1cr', emoji: '🤑', title: 'Crore Club', description: 'Net worth crosses ₹1 crore', tier: 'gold', check: (s) => s.netWorthPaise >= 1_000_000_000 },
  { id: 'saver-20', emoji: '🐖', title: 'Steady Saver', description: 'Save 20%+ of income (30d)', tier: 'silver', check: (s) => s.savingsRatePct != null && s.savingsRatePct >= 20 },
  // protection & life
  { id: 'protected', emoji: '🛡️', title: 'Shield Up', description: 'Track an insurance policy', tier: 'bronze', check: (s) => s.insurancePolicies >= 1 },
  { id: 'life-70', emoji: '⭐', title: 'Balanced Life', description: 'Life Score of 70 or more', tier: 'gold', check: (s) => s.lifeScore != null && s.lifeScore >= 70 },
]

export interface EarnedBadge extends BadgeDef {
  earned: boolean
}

export interface GamificationProfilePure {
  xp: number
  level: LevelInfo
  badges: EarnedBadge[]
  earnedCount: number
  totalCount: number
}

/** Full profile: XP, level and the earned/locked badge grid. */
export function computeProfile(s: GamificationStats): GamificationProfilePure {
  const xp = xpForStats(s)
  const badges = BADGES.map((b) => ({ ...b, earned: b.check(s) }))
  return {
    xp,
    level: levelInfo(xp),
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
    totalCount: badges.length,
  }
}

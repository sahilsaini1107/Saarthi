// Shared DTO types between services/API and client. Client never imports
// Prisma types directly — services map rows to these plain shapes.

export type Direction = 'in' | 'out'
export type TxnSource = 'manual' | 'voice' | 'ocr' | 'csv' | 'whatsapp'
export type AccountType = 'savings' | 'cash' | 'credit_card'
export type Compounding = 'simple' | 'annual' | 'half_yearly' | 'quarterly' | 'monthly'
export type RdCompounding = 'simple' | 'annual' | 'quarterly' | 'monthly'
export type Frequency = 'monthly' | 'quarterly' | 'annual' | 'custom_days'
export type FdStatus = 'active' | 'matured' | 'closed'
export type InvestmentType = 'stock' | 'bond' | 'crypto' | 'mutual_fund' | 'etf' | 'gold' | 'reit' | 'ppf' | 'nps' | 'other'
export type InvestmentTxnKind = 'buy' | 'sell' | 'dividend' | 'interest'
export type AssetCategory = 'real_estate' | 'vehicle' | 'machinery' | 'gold_jewellery' | 'electronics' | 'furniture' | 'art' | 'other'
export type MoodKey = 'great' | 'good' | 'okay' | 'low' | 'bad'
/* ---------- Phase 8 — portfolio planner ---------- */
export type JobKey = 'liquidity' | 'safety' | 'income' | 'growth' | 'protection' | 'speculation'
export type CreditRating = 'govt' | 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'below_B' | 'unrated'

export interface UserDTO {
  id: string
  email: string
  name: string
  currency: string
  timezone: string
}

export interface AccountDTO {
  id: string
  name: string
  type: AccountType
  balancePaise: number
  creditLimitPaise: number | null
  statementDay: number | null
  dueDay: number | null
  /** portfolio job (Phase 8); null = not tagged */
  job: JobKey | null
  color: string
  archived: boolean
  createdAt: string
}

export interface CategoryDTO {
  id: string
  name: string
  emoji: string
  color: string
  kind: 'expense' | 'income'
  isSystem: boolean
}

export interface TransactionDTO {
  id: string
  accountId: string
  accountName?: string
  categoryId: string | null
  categoryEmoji?: string | null
  categoryName?: string | null
  categoryColor?: string | null
  amountPaise: number
  direction: Direction
  /** ISO calendar date YYYY-MM-DD */
  date: string
  note: string | null
  source: TxnSource
  billPaymentId?: string | null
  tripId: string | null
  createdAt: string
}

export interface FixedDepositDTO {
  id: string
  bank: string
  principalPaise: number
  ratePct: number
  tenureMonths: number
  startDate: string
  compounding: Compounding
  autoRenew: boolean
  status: FdStatus
  job: JobKey | null
  maturityDate: string
  maturityAmountPaise: number
  createdAt: string
}

export interface RecurringDepositDTO {
  id: string
  bank: string
  installmentPaise: number
  ratePct: number
  tenureMonths: number
  startDate: string
  compounding: RdCompounding
  autoRenew: boolean
  status: FdStatus
  job: JobKey | null
  maturityDate: string
  maturityAmountPaise: number
  createdAt: string
}

/* ---------- Phase 7 — insurance ---------- */

export type InsurancePolicyStatus = 'active' | 'lapsed' | 'closed'

export interface InsurancePolicyDTO {
  id: string
  name: string
  type: 'term' | 'health' | 'life' | 'vehicle' | 'asset' | 'other'
  insurer: string
  policyNumber: string | null
  sumAssuredPaise: number
  premiumPaise: number
  premiumFrequency: 'monthly' | 'quarterly' | 'half_yearly' | 'annual'
  nextPremiumDue: string
  startDate: string
  maturityDate: string | null
  nominee: string | null
  status: InsurancePolicyStatus
  notes: string | null
  createdAt: string
}


export interface InvestmentTxnDTO {
  id: string
  investmentId: string
  kind: InvestmentTxnKind
  quantity: number
  amountPaise: number
  date: string
  note: string | null
  createdAt: string
}

export interface InvestmentDTO {
  id: string
  name: string
  type: InvestmentType
  symbol: string | null
  platform: string | null
  /** portfolio job (Phase 8); null = not tagged */
  job: JobKey | null
  /** bond/income fields (Phase 8) */
  ratePct: number | null
  creditRating: CreditRating | null
  maturityDate: string | null
  couponFrequency: 'monthly' | 'quarterly' | 'half_yearly' | 'annual' | null
  currentPricePaise: number
  priceUpdatedAt: string
  notes: string | null
  createdAt: string
}

export interface AssetDTO {
  id: string
  name: string
  category: AssetCategory
  currentValuePaise: number
  purchaseValuePaise: number | null
  purchaseDate: string | null
  /** portfolio job (Phase 8); null = not tagged */
  job: JobKey | null
  location: string | null
  notes: string | null
  createdAt: string
}

export interface BillDTO {
  id: string
  name: string
  amountPaise: number
  frequency: Frequency
  customDays: number | null
  nextDue: string
  anchorDay: number
  remindDaysBefore: number
  categoryId: string | null
  accountId: string | null
  active: boolean
  lastPaidDate?: string | null
}

export interface Paginated<T> {
  items: T[]
  nextOffset: number | null
}

/* ---------- Phase 2 — Growth & Reflection ---------- */

export interface HabitDTO {
  id: string
  name: string
  emoji: string
  color: string
  /** Mon..Sun 7-char bitstring */
  weekdays: string
  buildingDays: number
  startDate: string
  reminderTime: string | null
  archived: boolean
  createdAt: string
}

export interface HabitStats {
  scheduledToday: boolean
  doneToday: boolean
  streak: number
  longest: number
  /** 0..1 completion over the trailing 30 days */
  rate30: number
  building: { day: number; total: number; pct: number; built: boolean; daysLeft: number }
  /** heatmap for the streak calendar (server-computed, `days` long) */
  recent: { iso: string; done: boolean | null }[]
}

export type HabitWithStats = HabitDTO & HabitStats

/* ---------- Phase 15 — Life Principles ---------- */

export interface PrincipleDTO {
  id: string
  title: string
  detail: string | null
  category: string
  categoryLabel: string
  categoryEmoji: string
  active: boolean
  createdAt: string
}

export interface PrincipleWithStats extends PrincipleDTO {
  /** today's review status — null = not yet reviewed */
  todayStatus: 'kept' | 'broken' | 'na' | null
  /** today's note (what happened / trigger when broken) */
  todayNote: string | null
  /** consecutive non-broken days ending at today (grace rule applies) */
  keptStreak: number
  /** longest ever kept-run (broken resets, na continues) */
  longestRun: number
  /** kept / judged over trailing 30 days — null when nothing was judged */
  adherence30: number | null
  breaks30: number
  lastBreak: string | null
  /** 14-day review strip ending today (for the mini day-dots) */
  recent: { iso: string; status: 'kept' | 'broken' | 'na' | null; future: boolean }[]
}

export interface RoutineStepDTO {
  id: string
  order: number
  title: string
  minutes: number | null
}

export interface RoutineRunDTO {
  date: string
  completedSteps: number
  totalSteps: number
  secondsSpent: number
}

export interface RoutineWithMeta {
  id: string
  name: string
  emoji: string
  weekdays: string
  reminderTime: string | null
  active: boolean
  steps: RoutineStepDTO[]
  /** today's run if one exists (replays replace it) */
  todayRun: RoutineRunDTO | null
  lastRun: RoutineRunDTO | null
  /** consecutive scheduled days played (habit grace rules apply) */
  streak: number
  /** sum of step minutes */
  plannedMinutes: number
}

export interface JournalEntryDTO {
  id: string
  title: string | null
  content: string
  mood: MoodKey | null
  tags: string[]
  date: string
  createdAt: string
}

export interface JournalListResponse {
  items: JournalEntryDTO[]
  nextOffset: number | null
  streakDays: number
  monthCount: number
  /** most-used tags for the filter chips */
  topTags: string[]
  /** total entries for this user (before filtering) */
  total: number
}

/* ---------- Phase 3 — Goals, Study, Body, Skin ---------- */

export type GoalStatus = 'active' | 'achieved' | 'archived'
export type GoalMetric = 'money' | 'count'

export interface GoalTaskDTO {
  id: string
  goalId: string
  milestoneId: string | null
  title: string
  done: boolean
  doneAt: string | null
  dueDate: string | null
  createdAt: string
}

export interface MilestoneLogDTO {
  id: string
  milestoneId: string
  date: string
  /** minutes worked that day (1..1440) */
  minutes: number
  /** "what did you work on?" */
  did: string | null
  /** "what are you learning?" */
  learned: string | null
  /** key takeaway */
  keyLearning: string | null
}

export interface MilestoneDTO {
  id: string
  goalId: string
  title: string
  order: number
  done: boolean
  targetDate: string | null
  tasks: GoalTaskDTO[]
  /** 0..1 roll-up (tasks ratio, or the manual done flag) */
  progress: number
  /* ---------- Phase 11 — journal aggregates ---------- */
  /** optional planned effort in minutes (informational time progress) */
  targetMinutes: number | null
  /** Σ journal minutes across all days */
  totalMinutes: number
  loggedToday: boolean
  todayMinutes: number
}

/** Per-milestone section of the goal journal payload (Phase 11). */
export interface JournalMilestoneDTO {
  id: string
  title: string
  order: number
  done: boolean
  targetMinutes: number | null
  totalMinutes: number
  todayMinutes: number
  loggedToday: boolean
  lastLoggedDate: string | null
  logCount: number
  /** 0..1 vs planned minutes (null = no plan) — informational only */
  timeProgress: number | null
  /** newest entries first, capped at 20 (full history lives in the DB) */
  recentLogs: MilestoneLogDTO[]
}

export interface GoalDTO {
  id: string
  title: string
  description: string | null
  emoji: string
  color: string
  targetDate: string | null
  status: GoalStatus
  /** Phase 9 — daily tracking metric (null = plain milestone/task goal) */
  metric: GoalMetric | null
  /** count unit label ("km", "pages"); money goals always show ₹ */
  unitLabel: string | null
  /** total target in milli-units (₹1 = 1000 milli) */
  targetValueMilli: number | null
  /** Phase 10 — portfolio job whose sleeve funds this money goal (null = unlinked) */
  job: JobKey | null
  createdAt: string
  milestones: MilestoneDTO[]
  /** tasks attached directly to the goal (no milestone) */
  directTasks: GoalTaskDTO[]
  /** 0..1 mean over milestones + direct tasks */
  progress: number
  health: 'done' | 'overdue' | 'due_soon' | 'on_track' | 'no_deadline'
  daysLeft: number | null
  taskStats: { done: number; total: number }
}

/** One day in the effort grid (level 0..4, GitHub-style intensity). */
export interface GoalGridDayDTO {
  iso: string
  amountMilli: number
  tasksDone: number
  level: number
  future: boolean
  /** false = day not tappable (e.g. habit rest days); undefined = pickable */
  pickable?: boolean
}

export interface GoalContributionsDTO {
  goal: {
    id: string
    title: string
    emoji: string
    color: string
    metric: GoalMetric | null
    unitLabel: string | null
    targetValueMilli: number | null
    targetDate: string | null
    status: GoalStatus
    createdAt: string
  }
  today: string
  window: { start: string; end: string } | null
  /** leading blank cells (Monday-anchored first week) */
  pad: number
  labels: { label: string; span: number }[]
  days: GoalGridDayDTO[]
  stats: {
    totalMilli: number
    daysLogged: number
    taskDays: number
    currentStreak: number
    bestStreak: number
    benchmarkMilli: number | null
    actualPct: number | null
    expectedPct: number | null
    deltaPp: number | null
    band: 'ahead' | 'on_track' | 'behind' | 'at_risk' | null
    neededPerDayMilli: number | null
    projectedDate: string | null
  }
  /** Phase 10 — full-history weekly/monthly roll-ups (never window-capped) */
  rollups: RollupsDTO
}

/* ---------- Phase 11 — goal journal (milestone daily logs) ---------- */

export interface GoalJournalDayDTO {
  iso: string
  minutes: number
  level: number
  future: boolean
}

export interface GoalJournalDTO {
  goal: {
    id: string
    title: string
    emoji: string
    color: string
    status: GoalStatus
    targetDate: string | null
  }
  today: string
  hasLogs: boolean
  milestones: JournalMilestoneDTO[]
  window: { start: string; end: string } | null
  pad: number
  labels: { label: string; span: number }[]
  days: GoalJournalDayDTO[]
  stats: {
    totalMinutes: number
    daysLogged: number
    todayMinutes: number
    currentStreak: number
    bestStreak: number
  }
  rollups: RollupsDTO
}

/** One day's journal entries across all of a goal's milestones (grid tap → edit). */
export interface GoalDayLogsDTO {
  date: string
  entries: {
    milestoneId: string
    milestoneTitle: string
    logId: string | null
    minutes: number | null
    did: string | null
    learned: string | null
    keyLearning: string | null
  }[]
}

/* ---------- Phase 12 — key-learnings digest (Journal tab) ---------- */

/** One milestone-log key takeaway in the monthly digest, with goal context. */
export interface LearningItemDTO {
  id: string
  date: string
  minutes: number
  keyLearning: string
  did: string | null
  learned: string | null
  milestoneId: string
  milestoneTitle: string
  goalId: string
  goalTitle: string
  goalEmoji: string
  goalColor: string
}

export interface JournalLearningsDTO {
  /** "YYYY-MM" — the month the digest covers */
  monthKey: string
  /** newest first */
  items: LearningItemDTO[]
  stats: {
    count: number
    totalMinutes: number
    /** distinct goals the learnings came from */
    goalCount: number
  }
}

/* ---------- Phase 10 — effort grids + roll-ups (shared shapes) ---------- */

export interface WeekRollupDTO {
  start: string
  end: string
  total: number
  activeDays: number
  current: boolean
}

export interface MonthRollupDTO {
  monthKey: string
  total: number
  activeDays: number
  current: boolean
}

export interface RollupsDTO {
  weeks: WeekRollupDTO[]
  months: MonthRollupDTO[]
}

export interface EffortGridDayDTO {
  iso: string
  /** unit value of the day (habit: 0|1 check-in; study: minutes) */
  value: number
  level: number
  future: boolean
  /** habits only: was the day scheduled? (rest days are not misses) */
  scheduled: boolean
}

export interface EffortGridBaseDTO {
  today: string
  window: { start: string; end: string } | null
  pad: number
  labels: { label: string; span: number }[]
  days: EffortGridDayDTO[]
  rollups: RollupsDTO
}

export interface HabitGridPayloadDTO extends EffortGridBaseDTO {
  habit: {
    id: string
    name: string
    emoji: string
    color: string
    weekdays: string
    buildingDays: number
    startDate: string
    archived: boolean
  }
  stats: {
    scheduledToday: boolean
    doneToday: boolean
    streak: number
    longest: number
    /** 0..1 completion over the trailing 30 days */
    rate30: number
    building: { day: number; total: number; pct: number; built: boolean; daysLeft: number }
  }
}

export interface CourseGridPayloadDTO extends EffortGridBaseDTO {
  course: {
    id: string
    title: string
    emoji: string
    color: string
    status: string
    startDate: string
    targetEndDate: string | null
  }
  stats: {
    totalMinutes: number
    activeDays: number
    minutes7d: number
    /** minutes/day across active days, 1dp; null with no active days */
    avgActiveDayMinutes: number | null
  }
}

export type CourseStatus = 'active' | 'completed' | 'paused' | 'dropped'
export type TopicStatus = 'todo' | 'learning' | 'done'

export interface CourseTopicDTO {
  id: string
  courseId: string
  order: number
  title: string
  estMinutes: number | null
  status: TopicStatus
  nextRevisionAt: string | null
  revisionStage: number
}

export interface StudySessionDTO {
  id: string
  courseId: string
  topicId: string | null
  topicTitle?: string | null
  date: string
  minutes: number
  note: string | null
  createdAt: string
}

export interface CourseDTO {
  id: string
  title: string
  provider: string | null
  emoji: string
  color: string
  startDate: string
  targetEndDate: string | null
  status: CourseStatus
  createdAt: string
  topics: CourseTopicDTO[]
  pacing: {
    elapsedDays: number
    totalDays: number | null
    expectedPct: number | null
    actualPct: number
    deltaPct: number | null
    unitsPerDay: number
    projectedEndDate: string | null
    health: 'done' | 'no_target' | 'ahead' | 'on_track' | 'behind' | 'at_risk'
  }
  stats: {
    totalMinutes: number
    minutes7d: number
    revisionsDue: number
  }
  recentSessions: StudySessionDTO[]
}

export interface WorkoutDTO {
  id: string
  date: string
  type: string
  minutes: number
  intensity: string
  note: string | null
  createdAt: string
  /**
   * Where the row came from. 'quick' = a `Workout` row logged on the Body
   * screen (editable/deletable here). 'session' = a finished strength
   * `WorkoutSession` from the Fitness coach, surfaced read-only so the Body
   * stats stop pretending gym work never happened — `id` is the SESSION id and
   * must never be sent to /api/workouts/:id.
   */
  source: 'quick' | 'session'
}

export interface BodyMetricDTO {
  id: string
  date: string
  kind: string
  valueMilli: number
  note: string | null
  createdAt: string
}

export interface BodyMetricSeries {
  kind: string
  unit: string
  /** `id` is the BodyMetric row id, so a single reading can be corrected or deleted */
  points: { id: string; iso: string; valueMilli: number }[]
  latest: { iso: string; valueMilli: number } | null
  delta7dMilli: number | null
  delta30dMilli: number | null
  minMilli: number | null
  maxMilli: number | null
  avg7: { iso: string; valueMilli: number }[]
}

export interface WorkoutsPayload {
  workouts: WorkoutDTO[]
  weekStats: { minutes: number; count: number; byType: Record<string, number> }
  weekStart: string
  monthMinutes: number
  totals: { count: number; minutes: number }
}

export interface SkinProductDTO {
  id: string
  name: string
  brand: string | null
  kind: string
  openedDate: string | null
  paoMonths: number | null
  status: string
  notes: string | null
  createdAt: string
  pao: {
    level: 'no_pao' | 'ok' | 'expiring' | 'soon' | 'expired'
    daysLeft: number | null
    expiryISO: string | null
  }
}

export interface SkinCheckInDTO {
  date: string
  amDone: boolean
  pmDone: boolean
}

export interface SkinPayload {
  products: SkinProductDTO[]
  today: SkinCheckInDTO
  streak: number
  /** last 35 days of am-or-pm check-ins for the calendar */
  recent: { iso: string; done: boolean | null }[]
}

/* ---------- Phase 10 — planner ↔ goals link ---------- */

/** One linked money goal as shown inside a planner job row. */
export interface PlannerGoalLinkDTO {
  id: string
  title: string
  emoji: string
  color: string
  targetDate: string | null
  targetMilli: number | null
  contributedMilli: number
  remainingMilli: number | null
  pct: number | null
  achieved: boolean
}

export interface GoalsFundingDTO {
  byJob: Partial<Record<JobKey, { goals: PlannerGoalLinkDTO[]; committedMilli: number; contributedMilli: number; goalCount: number }>>
  totalCommittedMilli: number
  totalContributedMilli: number
  linkedCount: number
  unlinkedCount: number
}

/* ---------- Phase 6 — Advanced capture ---------- */

export type CaptureEngine = 'rules' | 'llm' | 'asr+rules' | 'asr+llm' | 'vision'

/** Draft returned by /api/capture/* — prefill for the Quick-Add form. */
export interface CaptureParseResponse {
  direction: Direction | null
  amountPaise: number | null
  dateISO: string
  note: string | null
  confidence: number
  /** voice only — what the recognizer heard */
  transcript?: string
  engine: CaptureEngine
  /** optional category suggestion (when requested) */
  categoryId?: string | null
}

export interface ImportCsvRow {
  amountPaise: number
  direction: Direction
  date: string
  note?: string | null
  categoryId?: string | null
}

export interface ImportCsvResult {
  created: number
  skippedDuplicates: number
  failedRows: Array<{ index: number; message: string }>
  createdIds: string[]
}

/* ---------- Phase 13 — Strength Coach ---------- */

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core' | 'full_body' | 'cardio' | 'other'
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other'

export interface ExerciseDTO {
  id: string
  name: string
  muscleGroup: MuscleGroup
  equipment: Equipment
  /** how many working sets the user has ever logged on it */
  usageCount: number
}

export interface PlanExerciseDTO {
  id: string
  exerciseId: string
  name: string
  muscleGroup: MuscleGroup
  equipment: Equipment
  order: number
  sets: number
  repMin: number | null
  repMax: number | null
  secondsMin: number | null
  secondsMax: number | null
  restSeconds: number | null
  note: string | null
}

export interface PlanDayDTO {
  id: string
  order: number
  label: string
  focus: string | null
  exercises: PlanExerciseDTO[]
}

export interface WorkoutPlanDTO {
  id: string
  name: string
  emoji: string
  note: string | null
  active: boolean
  days: PlanDayDTO[]
  sessionCount: number
}

export interface SetLogDTO {
  id: string
  exerciseId: string
  exerciseName: string
  muscleGroup: MuscleGroup
  order: number
  setNumber: number
  weightGrams: number | null
  reps: number | null
  durationSeconds: number | null
  isWarmup: boolean
}

export interface WorkoutSessionDTO {
  id: string
  date: string
  label: string
  durationMin: number
  note: string | null
  planId: string | null
  planDayId: string | null
  /** durationMin === 0 ⇒ still open */
  open: boolean
  sets: SetLogDTO[]
  volumeGrams: number
  topSetWeightGrams: number | null
}

/** Per-exercise view inside a session logger: targets + last-time values. */
export interface SessionExerciseDTO {
  exerciseId: string
  name: string
  muscleGroup: MuscleGroup
  target: {
    sets: number
    repMin: number | null
    repMax: number | null
    secondsMin: number | null
    secondsMax: number | null
    restSeconds: number | null
    note: string | null
  } | null
  /** the working top set of the PREVIOUS session on this exercise */
  lastTop: { date: string; weightGrams: number | null; reps: number | null } | null
  progression: ProgressionDTO | null
  sets: SetLogDTO[]
  /** Phase 19 — attached form media (YouTube ID derived, photo flag) */
  media: { youtubeId: string | null; hasPhoto: boolean } | null
}

export interface ProgressionDTO {
  direction: 'up' | 'flat' | 'down'
  est1RMDeltaG: number
  weightDeltaG: number
  repsDelta: number | null
}

export interface WorkoutSessionDetailDTO extends WorkoutSessionDTO {
  exercises: SessionExerciseDTO[]
}

export interface NutritionProfileDTO {
  calorieTarget: number
  proteinTargetG: number
  proteinPerKgMilli: number
  weeklyGainTargetG: number
}

/**
 * One day of nutrition. `caloriesKcal` / `proteinG` are the COMBINED total
 * (manual quick-adds + meal log, Decision #70) — that is what every average,
 * chart and adherence check reads. `manual*` is the NutritionDay row alone and
 * is the base the quick-add handlers must add to; `meal*` is the meal log alone.
 * Built by mergeDailyNutrition() in lib/meals.ts.
 */
export interface NutritionDayDTO {
  iso: string
  caloriesKcal: number | null
  proteinG: number | null
  manualCaloriesKcal: number | null
  manualProteinG: number | null
  mealCaloriesKcal: number
  mealProteinG: number
}

export interface NutritionAdherenceDTO {
  hitDays: number
  loggedDays: number
  avgG: number
  hitRate: number | null
}

/* ---------- Phase 19 — meals & exercise media ---------- */

export interface MealEntryDTO {
  id: string
  date: string
  /** breakfast | lunch | dinner | snack */
  mealType: string
  name: string
  caloriesKcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  createdAt: string
}

export interface MealTotalsDTO {
  caloriesKcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

export interface NutritionPayloadDTO {
  profile: NutritionProfileDTO | null
  /** suggested starting targets from the latest weigh-in (null when no weight yet) */
  suggestions: { proteinTargetG: number; calorieTarget: number } | null
  latestWeightKg: number | null
  days: NutritionDayDTO[]
  adherence30: NutritionAdherenceDTO
  /** meal-level log for `mealsDate` (today unless requested) — Decision #70 */
  meals: { date: string; entries: MealEntryDTO[]; totals: MealTotalsDTO }
}

export interface NextWorkoutDTO {
  planId: string
  planName: string
  planEmoji: string
  planDayId: string
  label: string
  focus: string | null
  rotationHint: string | null
  exercises: PlanExerciseDTO[]
}

export interface FitnessHighlightDTO {
  exerciseId: string
  name: string
  direction: 'up' | 'flat' | 'down'
  weightDeltaG: number
  est1RMDeltaG: number
  /** previous → current top set, as "50kg×8" strings */
  fromLabel: string
  toLabel: string
  date: string
}

export interface FitnessSummaryDTO {
  today: string
  activePlan: { id: string; name: string; emoji: string; dayCount: number } | null
  nextWorkout: NextWorkoutDTO | null
  openSession: { id: string; label: string; setCount: number } | null
  lastSession: { id: string; date: string; label: string; durationMin: number } | null
  week: { sessions: number; minutes: number; volumeKg: number }
  weight: { latestKg: number | null; kgPerWeek: number | null; verdict: string; spanDays: number; weeklyTargetG: number } | null
  nutrition: {
    proteinG: number | null
    caloriesKcal: number | null
    proteinTargetG: number | null
    calorieTarget: number | null
    week: NutritionAdherenceDTO
  }
  highlights: FitnessHighlightDTO[]
}

/** Per-exercise progression series (Progress panel). */
export interface ExerciseProgressDTO {
  exerciseId: string
  name: string
  muscleGroup: MuscleGroup
  sessions: { date: string; topWeightGrams: number | null; topReps: number | null; est1RMGrams: number; volumeGrams: number; setCount: number }[]
  est1RMDeltaG: number | null
  direction: 'up' | 'flat' | 'down' | null
}

/* ---------- Phase 14 — Password Vault (zero-knowledge) ---------- */

/** PBKDF2 + verifier parameters — enough for the browser to unlock offline. */
export interface VaultConfigDTO {
  salt: string
  iterations: number
  verifier: string
  verifierIv: string
}

/** One credential as an opaque ciphertext blob — plaintext lives only in the browser. */
export interface VaultEntryDTO {
  id: string
  data: string
  iv: string
  createdAt: string
  updatedAt: string
}

/** Decrypted shape inside the blob (never sent to the server in the clear). */
export interface VaultSecret {
  title: string
  username: string
  password: string
  url: string
  notes: string
}

/* ---------- Phase 16 — Books, Reader & Quotes ---------- */

export interface SessionDTO {
  id: string
  bookId: string
  date: string
  minutes: number
  pages: number
}

export interface HighlightDTO {
  id: string
  bookId: string
  cfi: string | null
  page: number | null
  text: string
  note: string | null
  color: string
  chapter: string | null
  createdAt: string
}

export interface BookmarkDTO {
  id: string
  bookId: string
  cfi: string | null
  page: number | null
  label: string | null
  createdAt: string
}

export interface NoteDTO {
  id: string
  bookId: string
  page: number
  text: string
  createdAt: string
  updatedAt: string
}

export interface BookDTO {
  id: string
  title: string
  author: string | null
  format: 'physical' | 'epub' | 'pdf'
  formatLabel: string
  formatEmoji: string
  status: 'to_read' | 'reading' | 'finished' | 'abandoned'
  statusLabel: string
  statusEmoji: string
  totalPages: number
  currentPage: number
  percent: number | null
  hasFile: boolean
  fileName: string | null
  fileSize: number | null
  rating: number | null
  takeaway: string | null
  tags: string[]
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  progressPct: number | null
  minutesTotal: number
  minutes7d: number
  streak: number
  pace: number | null
  eta: number | null
  lastReadAt: string | null
  sessionsCount: number
}

export interface BookDetailDTO extends BookDTO {
  position: string | null
  sessions: SessionDTO[]
  highlights: HighlightDTO[]
  bookmarks: BookmarkDTO[]
  notes: NoteDTO[]
}

export interface QuoteDTO {
  id: string
  text: string
  author: string | null
  source: string | null
  bookId: string | null
  bookTitle: string | null
  bookAuthor: string | null
  highlightId: string | null
  tags: string[]
  favorite: boolean
  createdAt: string
}

/* ---------- Phase 17 — Skills & People ---------- */

export interface SkillLogDTO {
  id: string
  date: string
  minutes: number
  note: string | null
}

export interface SkillWithStats {
  id: string
  name: string
  category: string
  categoryLabel: string
  categoryEmoji: string
  /** 1..10 — what "done" looks like */
  targetLevel: number
  /** active | paused | archived */
  status: string
  notes: string | null
  createdAt: string
  /** total XP = total practice minutes */
  xp: number
  level: number
  /** position inside the current level band */
  levelProgress: { level: number; into: number; span: number; pct: number; nextAt: number | null; isMax: boolean }
  targetReached: boolean
  /** consecutive practice days ending today (grace rule applies) */
  streak: number
  minutesToday: number
  minutes7d: number
  minutes30d: number
  lastPracticed: string | null
  /** days to target level at trailing-30 pace; 0 = reached; null = unknown pace */
  etaDays: number | null
  /** human one-liner for the next level, null when pace is unknown */
  etaLabel: string | null
  /** 14-day practice strip ending today (minutes per day) */
  recent: { iso: string; minutes: number }[]
  /** most recent practice logs (newest first) */
  logs: SkillLogDTO[]
}

export interface TouchpointDTO {
  id: string
  date: string
  type: string
  note: string | null
}

export interface PersonWithMeta {
  id: string
  name: string
  category: string
  categoryLabel: string
  categoryEmoji: string
  /** 3 = core · 2 = regular · 1 = extended */
  importance: number
  /** resolved cadence in days (override applied) */
  cadenceDays: number
  /** raw override, null when derived from importance */
  cadenceOverride: number | null
  role: string | null
  howMet: string | null
  contact: string | null
  notes: string | null
  tags: string[]
  archived: boolean
  createdAt: string
  /** derived from touchpoints — source of truth */
  lastTouch: string | null
  touchCount: number
  touchCount30: number
  reconnect: { status: 'never' | 'ok' | 'due' | 'overdue'; dueInDays: number; daysSinceLast: number | null }
  /** 14-day touch strip ending today (count per day) */
  recent: { iso: string; count: number }[]
  /** most recent touchpoints (newest first) */
  logs: TouchpointDTO[]
}

/* ---------- Phase 18 — Content Library & Ideas Lab ---------- */

export interface ContentItemDTO {
  id: string
  title: string
  /** video | article | link | file */
  kind: string
  kindLabel: string
  kindEmoji: string
  url: string | null
  /** derived from the URL for videos — never stored (Decision #62 spirit) */
  youtubeId: string | null
  notes: string | null
  tags: string[]
  /** inbox | active | done | archived */
  status: string
  statusLabel: string
  favorite: boolean
  hasFile: boolean
  fileName: string | null
  fileMime: string | null
  fileSize: number | null
  fileView: 'video' | 'audio' | 'pdf' | 'image' | 'download' | null
  hasReader: boolean
  readerTitle: string | null
  readerFetchedAt: string | null
  /** ISO day the reader cache was fetched, for "stale" hints in the UI */
  readerFetchedOn: string | null
  consumedAt: string | null
  addedOn: string
  ageDays: number
  createdAt: string
}

export interface IdeaDTO {
  id: string
  title: string
  category: string
  categoryLabel: string
  categoryEmoji: string
  /** spark | exploring | planned | launched | parked | dropped */
  status: string
  statusLabel: string
  statusEmoji: string
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
  /** derived: impact × confidence ÷ effort, 2-decimal */
  ice: number | null
  iceBand: 'strong' | 'promising' | 'seed'
  tags: string[]
  notes: string | null
  launchedAt: string | null
  addedOn: string
  ageDays: number
  ageLabel: string
  createdAt: string
}

/* ================= Phase 21 — Food library & thali builder ================= */

/** A configurable food. Macros describe `basisQty` of `unit`, in milli-units. */
export interface FoodItemDTO {
  id: string
  name: string
  brand: string | null
  unit: string
  basisQty: number
  caloriesMilliKcal: number
  proteinMilliG: number
  carbsMilliG: number
  fatMilliG: number
  fiberMilliG: number | null
  category: string
  isVeg: boolean
  tier: string | null
  note: string | null
  /** how many recipes reference this food — deleting one warns first */
  usageCount: number
  createdAt: string
}

/** One ingredient inside a recipe, with its scaled contribution. */
export interface RecipeItemDTO {
  id: string
  foodItemId: string
  name: string
  unit: string
  order: number
  quantityMilli: number
  caloriesMilliKcal: number
  proteinMilliG: number
  carbsMilliG: number
  fatMilliG: number
  fiberMilliG: number
  /** share of the plate's calories, 0–100 (null when the plate has none) */
  caloriePct: number | null
}

export interface MacroMilliDTO {
  caloriesMilliKcal: number
  proteinMilliG: number
  carbsMilliG: number
  fatMilliG: number
  fiberMilliG: number
}

/** A saved plate. Totals are always computed from the items, never stored. */
export interface RecipeDTO {
  id: string
  name: string
  emoji: string
  note: string | null
  servings: number
  items: RecipeItemDTO[]
  total: MacroMilliDTO
  perServing: MacroMilliDTO
  createdAt: string
}

export interface FoodLibraryPayloadDTO {
  foods: FoodItemDTO[]
  recipes: RecipeDTO[]
  /** preset group ids the user has already seeded, so the picker can say so */
  seededGroups: string[]
}

/* ================= Phase 22 — body composition ================= */

export interface BodyProfileDTO {
  /** cm × 1000 (178.0 cm = 178000) */
  heightMilliCm: number | null
  birthYear: number | null
  /** male | female | other */
  sex: string | null
  /** goal body weight in grams */
  goalWeightG: number | null
  /** derived from birthYear and today — null when no birth year is set */
  age: number | null
}

/** One readout in the composition panel: value, trend and (where defensible) a band. */
export interface CompositionMetricDTO {
  kind: string
  label: string
  unit: string
  emoji: string
  valueMilli: number | null
  iso: string | null
  delta30dMilli: number | null
  /** null when no published reference range applies to this metric */
  band: { level: string; label: string; tone: string } | null
  /** true when the figure was computed by Saarthi rather than logged */
  derived: boolean
}

export interface CompositionGroupDTO {
  id: string
  label: string
  metrics: CompositionMetricDTO[]
}

export interface BodyCompositionDTO {
  profile: BodyProfileDTO
  groups: CompositionGroupDTO[]
  /** every kind that has at least one reading, for the charts list */
  series: BodyMetricSeries[]
  latestWeightG: number | null
  /** coach starting targets for the current weight and chosen goal */
  suggestion: {
    goal: string
    calorieTarget: number
    proteinTargetG: number
    weeklyChangeG: number
    rationale: string
    bracketLabel: string
    extrapolated: boolean
  } | null
  /** kg/week pace and verdict against the active goal */
  pace: { kgPerWeek: number | null; verdict: string; spanDays: number; weeklyTargetG: number } | null
  /** distance to the goal weight, and an ETA at the current pace */
  goalProgress: { goalWeightG: number; deltaG: number; weeksToGoal: number | null } | null
}

/* ================= Phase 23 — daily coach check-in ================= */

export interface ReadinessDTO {
  score: number
  verdict: 'push' | 'train' | 'easy' | 'rest'
  label: string
  basis: string[]
  reason: string
}

export interface CheckInDayDTO {
  iso: string
  energy: number | null
  soreness: number | null
  stress: number | null
  sleepQuality: number | null
  sleepMinutes: number | null
  steps: number | null
  waterMl: number | null
  note: string | null
  /** null until at least two subjective scales are answered */
  readiness: ReadinessDTO | null
}

export interface CheckInPromptDTO {
  key: string
  label: string
  emoji: string
  answered: boolean
  detail: string | null
}

export interface CheckInAveragesDTO {
  energy: number | null
  soreness: number | null
  stress: number | null
  sleepQuality: number | null
  sleepMinutes: number | null
  steps: number | null
  waterMl: number | null
  loggedDays: number
}

export interface CheckInPayloadDTO {
  date: string
  today: string
  day: CheckInDayDTO | null
  /** the coach's question list, with what is already answered elsewhere */
  prompts: CheckInPromptDTO[]
  completeness: number
  streak: number
  history: CheckInDayDTO[]
  averages30: CheckInAveragesDTO
  /** a session started but not finished today, so the card can link to it */
  openSessionId: string | null
  proteinTargetG: number | null
}

/* ================= Phase 24 — progress photos ================= */

export interface ProgressPhotoDTO {
  id: string
  date: string
  /** front | side | back | other */
  pose: string
  mime: string
  fileName: string | null
  /** body weight (grams) at the time the photo was taken — snapshotted */
  weightG: number | null
  note: string | null
  createdAt: string
}

export interface ProgressPhotoDayDTO {
  date: string
  photos: ProgressPhotoDTO[]
  weightG: number | null
}

export interface ProgressPhotosPayloadDTO {
  photos: ProgressPhotoDTO[]
  /** newest first, one entry per day that has photos */
  days: ProgressPhotoDayDTO[]
  poses: string[]
}

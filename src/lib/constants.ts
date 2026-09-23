// App-wide constants shared by server and client.

export interface DefaultCategory {
  name: string
  emoji: string
  color: string
  kind: 'expense' | 'income'
}

/** Seeded on first login (task 1.4). Names are unique per user. */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: 'Food', emoji: '🍜', color: '#F97316', kind: 'expense' },
  { name: 'Groceries', emoji: '🛒', color: '#84CC16', kind: 'expense' },
  { name: 'Transport', emoji: '🚕', color: '#0EA5E9', kind: 'expense' },
  { name: 'Bills', emoji: '🧾', color: '#64748B', kind: 'expense' },
  { name: 'Shopping', emoji: '🛍️', color: '#EC4899', kind: 'expense' },
  { name: 'Health', emoji: '💊', color: '#EF4444', kind: 'expense' },
  { name: 'Travel', emoji: '✈️', color: '#14B8A6', kind: 'expense' },
  { name: 'Entertainment', emoji: '🎬', color: '#A855F7', kind: 'expense' },
  { name: 'EMI', emoji: '🏦', color: '#78716C', kind: 'expense' },
  { name: 'Income', emoji: '💰', color: '#16A34A', kind: 'income' },
  { name: 'Investment', emoji: '📈', color: '#0D9488', kind: 'expense' },
  { name: 'Other', emoji: '📦', color: '#94A3B8', kind: 'expense' },
]

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  savings: 'Savings',
  cash: 'Cash',
  credit_card: 'Credit card',
}

/** Real-asset categories (Phase 1.5) — shared by service + UI. */
export const ASSET_CATEGORIES = [
  'real_estate',
  'vehicle',
  'machinery',
  'gold_jewellery',
  'electronics',
  'furniture',
  'art',
  'other',
] as const

export type AssetCategoryKey = (typeof ASSET_CATEGORIES)[number]

export const ASSET_CATEGORY_LABELS: Record<AssetCategoryKey, { label: string; emoji: string }> = {
  real_estate: { label: 'Real estate', emoji: '🏠' },
  vehicle: { label: 'Vehicle', emoji: '🚗' },
  machinery: { label: 'Machinery', emoji: '⚙️' },
  gold_jewellery: { label: 'Gold & jewellery', emoji: '🥇' },
  electronics: { label: 'Electronics', emoji: '💻' },
  furniture: { label: 'Furniture', emoji: '🛋️' },
  art: { label: 'Art', emoji: '🖼️' },
  other: { label: 'Other', emoji: '📦' },
}

export const DEFAULT_TIMEZONE = 'Asia/Kolkata'
export const DEFAULT_CURRENCY = 'INR'

/* ---------- Phase 3 — Goals, Study, Body, Skin ---------- */

/** Emoji presets for goals. */
export const GOAL_EMOJIS = ['🎯', '🏆', '💪', '📚', '💰', '🧘', '🚀', '🏠', '🎓', '❤️'] as const

export const GOAL_COLORS = ['#0D9488', '#F97316', '#8B5CF6', '#EC4899', '#0EA5E9', '#84CC16'] as const

export const COURSE_EMOJIS = ['📚', '🧠', '💻', '🗣️', '🎨', '🧮', '⚖️', '🩺'] as const

export const COURSE_COLORS = ['#8B5CF6', '#0D9488', '#F97316', '#0EA5E9', '#EC4899', '#84CC16'] as const

export const COURSE_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  paused: 'Paused',
  dropped: 'Dropped',
}

export const TOPIC_STATUS_LABELS: Record<string, string> = {
  todo: 'To learn',
  learning: 'Learning',
  done: 'Learned',
}

/** Workout types — label + emoji, shared by service and UI. */
export const WORKOUT_TYPES = [
  'strength',
  'cardio',
  'yoga',
  'sports',
  'walk',
  'hiit',
  'other',
] as const

export type WorkoutTypeKey = (typeof WORKOUT_TYPES)[number]

export const WORKOUT_TYPE_LABELS: Record<WorkoutTypeKey, { label: string; emoji: string }> = {
  strength: { label: 'Strength', emoji: '🏋️' },
  cardio: { label: 'Cardio', emoji: '🏃' },
  yoga: { label: 'Yoga', emoji: '🧘' },
  sports: { label: 'Sports', emoji: '⚽' },
  walk: { label: 'Walk', emoji: '🚶' },
  hiit: { label: 'HIIT', emoji: '🔥' },
  other: { label: 'Other', emoji: '🤸' },
}

export const INTENSITY_LABELS: Record<string, string> = {
  light: 'Light',
  moderate: 'Moderate',
  hard: 'Hard',
}

/**
 * Every body metric we track — label, unit and emoji.
 *
 * `BodyMetric` is a generic (kind, valueMilli) table with one row per kind per
 * day, so the whole smart-scale panel is DATA, not schema: adding a readout
 * means adding a line here. Values are milli-units (72.5 kg = 72500,
 * 19.8 BMI = 19800) per Decision #21.
 *
 * Categorical scale readouts (obesity level, obesity grade) are deliberately
 * absent — they are bands over BMI and body fat, so they are DERIVED in
 * lib/body.ts rather than stored, and can never drift from the numbers.
 */
export const BODY_METRIC_KINDS = [
  // headline
  'weight',
  'body_fat',
  'bmi',
  // composition (smart scale)
  'muscle_mass',
  'muscle_rate',
  'skeletal_muscle',
  'fat_free_weight',
  'body_water',
  'water_weight',
  'bone_mass',
  'protein_mass',
  'protein_rate',
  'visceral_fat',
  'subcutaneous_fat',
  'fat_mass_index',
  'bmr',
  'metabolic_age',
  'body_score',
  'ideal_weight',
  // tape measurements
  'neck',
  'shoulders',
  'chest',
  'waist',
  'hips',
  'arm',
  'forearm',
  'thigh',
  'calf',
  'other',
] as const

export type BodyMetricKindKey = (typeof BODY_METRIC_KINDS)[number]

export const BODY_METRIC_LABELS: Record<BodyMetricKindKey, { label: string; unit: string; emoji: string }> = {
  weight: { label: 'Weight', unit: 'kg', emoji: '⚖️' },
  body_fat: { label: 'Body fat', unit: '%', emoji: '🧬' },
  bmi: { label: 'BMI', unit: '', emoji: '📊' },
  muscle_mass: { label: 'Muscle mass', unit: 'kg', emoji: '💪' },
  muscle_rate: { label: 'Muscle rate', unit: '%', emoji: '💪' },
  skeletal_muscle: { label: 'Skeletal muscle', unit: 'kg', emoji: '🦾' },
  fat_free_weight: { label: 'Weight without fat', unit: 'kg', emoji: '🪶' },
  body_water: { label: 'Body water', unit: '%', emoji: '💧' },
  water_weight: { label: 'Water weight', unit: 'kg', emoji: '💧' },
  bone_mass: { label: 'Bone mass', unit: 'kg', emoji: '🦴' },
  protein_mass: { label: 'Protein mass', unit: 'kg', emoji: '🧪' },
  protein_rate: { label: 'Protein rate', unit: '%', emoji: '🧪' },
  visceral_fat: { label: 'Visceral fat', unit: '', emoji: '🫀' },
  subcutaneous_fat: { label: 'Subcutaneous fat', unit: '%', emoji: '🧈' },
  fat_mass_index: { label: 'Fat mass index', unit: '', emoji: '📉' },
  bmr: { label: 'BMR', unit: 'kcal', emoji: '🔥' },
  metabolic_age: { label: 'Metabolic age', unit: 'yrs', emoji: '⏳' },
  body_score: { label: 'Body score', unit: 'pts', emoji: '🏅' },
  ideal_weight: { label: 'Ideal weight', unit: 'kg', emoji: '🎯' },
  neck: { label: 'Neck', unit: 'cm', emoji: '📐' },
  shoulders: { label: 'Shoulders', unit: 'cm', emoji: '📏' },
  chest: { label: 'Chest', unit: 'cm', emoji: '📏' },
  waist: { label: 'Waist', unit: 'cm', emoji: '📐' },
  hips: { label: 'Hips', unit: 'cm', emoji: '📐' },
  arm: { label: 'Arm', unit: 'cm', emoji: '💪' },
  forearm: { label: 'Forearm', unit: 'cm', emoji: '🦾' },
  thigh: { label: 'Thigh', unit: 'cm', emoji: '🦵' },
  calf: { label: 'Calf', unit: 'cm', emoji: '🦵' },
  other: { label: 'Other', unit: '', emoji: '📊' },
}

/** Safe lookup — an unknown kind falls back to the generic "Other" meta. */
export function bodyMetricMeta(kind: string): { label: string; unit: string; emoji: string } {
  return BODY_METRIC_LABELS[kind as BodyMetricKindKey] ?? BODY_METRIC_LABELS.other
}

/**
 * Upper bound per kind, in milli-units. One global ceiling cannot serve
 * kilograms, percentages and kilocalories at once: a BMR of 1592 kcal is
 * 1_592_000 milli, which a 1_000_000 cap wrongly rejects, while that same cap
 * would happily accept a 1000 kg body weight.
 */
const MAX_KG = 400_000 // 400 kg
const MAX_PCT = 100_000 // 100 %
const MAX_CM = 300_000 // 300 cm

export const BODY_METRIC_MAX_MILLI: Record<BodyMetricKindKey, number> = {
  weight: MAX_KG,
  body_fat: MAX_PCT,
  bmi: 100_000,
  muscle_mass: MAX_KG,
  muscle_rate: MAX_PCT,
  skeletal_muscle: MAX_KG,
  fat_free_weight: MAX_KG,
  body_water: MAX_PCT,
  water_weight: MAX_KG,
  bone_mass: MAX_KG,
  protein_mass: MAX_KG,
  protein_rate: MAX_PCT,
  visceral_fat: 60_000,
  subcutaneous_fat: MAX_PCT,
  fat_mass_index: 100_000,
  bmr: 10_000_000, // 10 000 kcal
  metabolic_age: 130_000, // 130 years
  body_score: 100_000,
  ideal_weight: MAX_KG,
  neck: MAX_CM,
  shoulders: MAX_CM,
  chest: MAX_CM,
  waist: MAX_CM,
  hips: MAX_CM,
  arm: MAX_CM,
  forearm: MAX_CM,
  thigh: MAX_CM,
  calf: MAX_CM,
  other: 10_000_000,
}

/** The largest value any kind allows — the zod ceiling; per-kind checks follow. */
export const BODY_METRIC_ABSOLUTE_MAX = 10_000_000

export function bodyMetricMax(kind: string): number {
  return BODY_METRIC_MAX_MILLI[kind as BodyMetricKindKey] ?? BODY_METRIC_ABSOLUTE_MAX
}

/** How the Body screen groups the panel. Order is display order. */
export const BODY_METRIC_GROUPS: readonly { id: string; label: string; kinds: readonly BodyMetricKindKey[] }[] = [
  { id: 'headline', label: 'Headline', kinds: ['weight', 'body_fat', 'bmi'] },
  {
    id: 'composition',
    label: 'Composition',
    kinds: [
      'muscle_mass',
      'muscle_rate',
      'skeletal_muscle',
      'fat_free_weight',
      'protein_mass',
      'protein_rate',
      'bone_mass',
    ],
  },
  { id: 'fat_water', label: 'Fat & water', kinds: ['visceral_fat', 'subcutaneous_fat', 'fat_mass_index', 'body_water', 'water_weight'] },
  { id: 'metabolic', label: 'Metabolic', kinds: ['bmr', 'metabolic_age', 'body_score', 'ideal_weight'] },
  {
    id: 'measurements',
    label: 'Tape measurements',
    kinds: ['neck', 'shoulders', 'chest', 'waist', 'hips', 'arm', 'forearm', 'thigh', 'calf'],
  },
]

export const SKIN_PRODUCT_KINDS = [
  'cleanser',
  'toner',
  'serum',
  'moisturizer',
  'sunscreen',
  'eye_cream',
  'exfoliant',
  'mask',
  'other',
] as const

export type SkinProductKindKey = (typeof SKIN_PRODUCT_KINDS)[number]

export const SKIN_PRODUCT_LABELS: Record<SkinProductKindKey, { label: string; emoji: string }> = {
  cleanser: { label: 'Cleanser', emoji: '🧼' },
  toner: { label: 'Toner', emoji: '💧' },
  serum: { label: 'Serum', emoji: '🧪' },
  moisturizer: { label: 'Moisturizer', emoji: '🫧' },
  sunscreen: { label: 'Sunscreen', emoji: '☀️' },
  eye_cream: { label: 'Eye cream', emoji: '👁️' },
  exfoliant: { label: 'Exfoliant', emoji: '✨' },
  mask: { label: 'Mask', emoji: '🎭' },
  other: { label: 'Other', emoji: '🧴' },
}

/* ---------- Phase 5 — Intelligence layer ---------- */

/** Emoji presets for trips. */
export const TRIP_EMOJIS = ['✈️', '🏖️', '🏔️', '🚗', '🛕', '🏙️', '⛺', '🎒', '🚂', '🛳️'] as const

export const BUDGET_BAND_META: Record<string, { label: string; className: string; tone: 'income' | 'warn' | 'expense' }> = {
  over: { label: 'Over', className: 'bg-expense/10 text-expense', tone: 'expense' },
  watch: { label: 'Watch', className: 'bg-warn/10 text-warn', tone: 'warn' },
  on_track: { label: 'On track', className: 'bg-income/10 text-income', tone: 'income' },
  none: { label: '—', className: 'bg-muted text-muted-foreground', tone: 'warn' },
}

export const TRIP_PHASE_META: Record<string, { label: string; className: string }> = {
  planned: { label: 'Upcoming', className: 'bg-primary/10 text-primary' },
  ongoing: { label: 'Ongoing', className: 'bg-income/10 text-income' },
  past: { label: 'Past', className: 'bg-muted text-muted-foreground' },
}

/* ---------- Phase 2 — Growth & Reflection ---------- */

/** Emoji presets for new habits. */
export const HABIT_EMOJIS = ['✅', '🏃', '💪', '🧘', '📚', '💧', '🛏️', '🥗', '🚭', '🧴', '🎸', '✍️'] as const

/** Colour presets for habit cards. */
export const HABIT_COLORS = ['#0D9488', '#F97316', '#8B5CF6', '#EC4899', '#0EA5E9', '#84CC16'] as const

export const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

/** Built-in journal templates: key → structured seed content. */
export const JOURNAL_TEMPLATES: { key: string; emoji: string; name: string; hint: string; content: () => string }[] = [
  {
    key: 'gratitude',
    emoji: '🙏',
    name: 'Gratitude',
    hint: 'Three things that went right',
    content: () => 'Three things I am grateful for today:\n1. \n2. \n3. \n\nWhy they mattered:\n',
  },
  {
    key: 'wins',
    emoji: '🏆',
    name: 'Wins',
    hint: 'What did I accomplish?',
    content: () => 'Today\u2019s wins (however small):\n- \n\nWhat made them possible:\n',
  },
  {
    key: 'learned',
    emoji: '🎓',
    name: 'What I learned',
    hint: 'One lesson worth keeping',
    content: () => 'One lesson worth keeping:\n\n\nHow I\u2019ll apply it tomorrow:\n',
  },
  {
    key: 'tomorrow',
    emoji: '➡️',
    name: 'Tomorrow\u2019s priority',
    hint: 'The one thing that matters next',
    content: () => 'Tomorrow\u2019s #1 priority:\n\n\nWhy it matters:\n\nFirst step (2 minutes or less):\n',
  },
]

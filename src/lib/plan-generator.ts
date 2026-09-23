// Workout plan generator (Phase 19). Pure + deterministic — the SAME inputs
// always produce the SAME plan, so tests can assert exact output.
//
// Semantics (simpler interpretation, documented in PROGRESS.md):
//  - The day-count picks the split (no RNG, no cleverness):
//      2 → Full A / Full B · 3 → Push / Pull / Legs ·
//      4 → Upper / Lower / Push / Pull · 5 → PPL + Upper / Lower ·
//      6 → PPL ×2 (the note tells you to add load on the second cycle).
//  - The goal only tunes PRESCRIPTIONS (sets × rep range × rest) — it never
//    swaps exercises. Strength = heavier & longer rest, lean = higher reps &
//    short rest. Timed core moves keep a fixed window for every goal.
//  - Equipment tier picks the exercise VARIANT: every move defines a gym,
//    dumbbells and bodyweight form, so any tier produces a complete plan.
//  - Output matches the plan-create payload exactly (name/emoji/note/days),
//    so the UI creates it through the existing endpoint — no new API.

export type GeneratorGoal = 'strength' | 'muscle' | 'lean' | 'general'
export type GeneratorEquipment = 'gym' | 'dumbbells' | 'bodyweight'

export const GENERATOR_GOALS: readonly { key: GeneratorGoal; label: string; emoji: string; hint: string }[] = [
  { key: 'muscle', label: 'Build muscle', emoji: '💪', hint: '8–12 reps · moderate rest' },
  { key: 'strength', label: 'Get stronger', emoji: '🏋️', hint: '4–6 reps on the big lifts · long rest' },
  { key: 'lean', label: 'Get lean', emoji: '🔥', hint: '10–15 reps · short rest · high density' },
  { key: 'general', label: 'General fitness', emoji: '⚡', hint: 'Balanced reps and effort' },
]

export const GENERATOR_EQUIPMENT: readonly { key: GeneratorEquipment; label: string; emoji: string }[] = [
  { key: 'gym', label: 'Full gym', emoji: '🏟️' },
  { key: 'dumbbells', label: 'Dumbbells', emoji: '🏠' },
  { key: 'bodyweight', label: 'Bodyweight', emoji: '🤸' },
]

export interface GenExercise {
  name: string
  muscleGroup: string
  equipment: string
  sets: number
  repMin?: number
  repMax?: number
  secondsMin?: number
  secondsMax?: number
  restSeconds: number
  note?: string
}

export interface GenDay {
  label: string
  focus: string
  exercises: GenExercise[]
}

export interface GeneratedPlan {
  name: string
  emoji: string
  note: string
  days: GenDay[]
}

/* ---------------- goal prescription tuning ---------------- */

interface GoalConfig {
  label: string
  emoji: string
  mainSets: number
  mainReps: [number, number]
  mainRest: number
  auxSets: number
  auxReps: [number, number]
  auxRest: number
  /** per-day volume tweak: lean drops aux sets to keep sessions tight */
  coachingNote: string
}

const GOAL_CONFIG: Record<GeneratorGoal, GoalConfig> = {
  strength: {
    label: 'Strength',
    emoji: '🏋️',
    mainSets: 4,
    mainReps: [4, 6],
    mainRest: 180,
    auxSets: 3,
    auxReps: [6, 10],
    auxRest: 120,
    coachingNote: 'Strength block: 4–6 reps on the big lifts, 2–3 reps in reserve, full rest between sets. Add load when every set hits the top of the range.',
  },
  muscle: {
    label: 'Muscle',
    emoji: '💪',
    mainSets: 3,
    mainReps: [8, 12],
    mainRest: 150,
    auxSets: 3,
    auxReps: [10, 15],
    auxRest: 90,
    coachingNote: 'Hypertrophy block: 8–12 reps on compounds, 10–15 on accessories, 2–3 reps in reserve. Add reps first, then load.',
  },
  lean: {
    label: 'Lean',
    emoji: '🔥',
    mainSets: 3,
    mainReps: [10, 15],
    mainRest: 90,
    auxSets: 2,
    auxReps: [12, 20],
    auxRest: 60,
    coachingNote: 'Lean block: 10–15 reps, short rests, keep the session dense. Pair it with a daily step target and your protein goal.',
  },
  general: {
    label: 'General',
    emoji: '⚡',
    mainSets: 3,
    mainReps: [8, 12],
    mainRest: 120,
    auxSets: 2,
    auxReps: [10, 15],
    auxRest: 75,
    coachingNote: 'Balanced block: 8–12 reps, moderate rest, leave 2–3 reps in reserve on everything. Consistency beats intensity.',
  },
}

const CORE_SECONDS: [number, number] = [20, 45]

/* ---------------- move catalog: every move has all three tiers ---------------- */

interface Variant {
  name: string
  equipment: string
}

interface Move {
  muscleGroup: string
  /** main lifts get the strength 4×4–6 treatment; everything else is auxiliary */
  main?: boolean
  /** timed moves use CORE_SECONDS instead of a rep range */
  timed?: boolean
  variants: Record<GeneratorEquipment, Variant>
  note?: string
}

interface DayTemplate {
  key: string
  focus: string
  moves: Move[]
}

const m = (muscleGroup: string, variants: Record<GeneratorEquipment, Variant>, opts?: Partial<Move>): Move => ({
  muscleGroup,
  ...opts,
  variants,
})

const DAY_TEMPLATES: Record<string, DayTemplate> = {
  push: {
    key: 'push',
    focus: 'Chest · Shoulders · Triceps',
    moves: [
      m('chest', {
        gym: { name: 'Barbell Bench Press', equipment: 'barbell' },
        dumbbells: { name: 'Dumbbell Bench Press', equipment: 'dumbbell' },
        bodyweight: { name: 'Push-up', equipment: 'bodyweight' },
      }, { main: true, note: 'Or machine chest press. Depth and control first.' }),
      m('shoulders', {
        gym: { name: 'Overhead Press', equipment: 'barbell' },
        dumbbells: { name: 'Dumbbell Shoulder Press', equipment: 'dumbbell' },
        bodyweight: { name: 'Pike Push-up', equipment: 'bodyweight' },
      }, { main: true }),
      m('chest', {
        gym: { name: 'Incline Bench Press', equipment: 'barbell' },
        dumbbells: { name: 'Incline Dumbbell Press', equipment: 'dumbbell' },
        bodyweight: { name: 'Decline Push-up', equipment: 'bodyweight' },
      }, { note: 'Feet-elevated push-up on the bodyweight tier.' }),
      m('shoulders', {
        gym: { name: 'Dumbbell Lateral Raise', equipment: 'dumbbell' },
        dumbbells: { name: 'Dumbbell Lateral Raise', equipment: 'dumbbell' },
        bodyweight: { name: 'Diamond Push-up', equipment: 'bodyweight' },
      }),
      m('arms', {
        gym: { name: 'Cable Triceps Pushdown', equipment: 'cable' },
        dumbbells: { name: 'Overhead Triceps Extension', equipment: 'dumbbell' },
        bodyweight: { name: 'Bench Dip', equipment: 'bodyweight' },
      }),
    ],
  },
  pull: {
    key: 'pull',
    focus: 'Back · Rear delts · Biceps',
    moves: [
      m('back', {
        gym: { name: 'Barbell Row', equipment: 'barbell' },
        dumbbells: { name: 'One-Arm Dumbbell Row', equipment: 'dumbbell' },
        bodyweight: { name: 'Inverted Row', equipment: 'bodyweight' },
      }, { main: true, note: 'Hinge and pull to the lower ribs — no jerking.' }),
      m('back', {
        gym: { name: 'Lat Pulldown', equipment: 'machine' },
        dumbbells: { name: 'Pull-up', equipment: 'bodyweight' },
        bodyweight: { name: 'Pull-up', equipment: 'bodyweight' },
      }, { main: true, note: 'Assisted pull-ups are fine — reduce assistance over time.' }),
      m('back', {
        gym: { name: 'Seated Cable Row', equipment: 'cable' },
        dumbbells: { name: 'Incline Dumbbell Row', equipment: 'dumbbell' },
        bodyweight: { name: 'Prone Y-T-W Raise', equipment: 'bodyweight' },
      }),
      m('shoulders', {
        gym: { name: 'Face Pull', equipment: 'cable' },
        dumbbells: { name: 'Rear Delt Raise', equipment: 'dumbbell' },
        bodyweight: { name: 'Prone T Raise', equipment: 'bodyweight' },
      }),
      m('arms', {
        gym: { name: 'Barbell Curl', equipment: 'barbell' },
        dumbbells: { name: 'Dumbbell Curl', equipment: 'dumbbell' },
        bodyweight: { name: 'Chin-up', equipment: 'bodyweight' },
      }),
    ],
  },
  legs: {
    key: 'legs',
    focus: 'Quads · Hamstrings · Glutes',
    moves: [
      m('legs', {
        gym: { name: 'Back Squat', equipment: 'barbell' },
        dumbbells: { name: 'Goblet Squat', equipment: 'dumbbell' },
        bodyweight: { name: 'Bulgarian Split Squat', equipment: 'bodyweight' },
      }, { main: true, note: 'Depth below parallel when mobility allows.' }),
      m('legs', {
        gym: { name: 'Romanian Deadlift', equipment: 'barbell' },
        dumbbells: { name: 'Dumbbell Romanian Deadlift', equipment: 'dumbbell' },
        bodyweight: { name: 'Single-Leg Glute Bridge', equipment: 'bodyweight' },
      }, { main: true, note: 'Hinge — push the hips back, don\u2019t squat the weight down.' }),
      m('legs', {
        gym: { name: 'Leg Press', equipment: 'machine' },
        dumbbells: { name: 'Walking Lunge', equipment: 'dumbbell' },
        bodyweight: { name: 'Walking Lunge', equipment: 'bodyweight' },
      }),
      m('legs', {
        gym: { name: 'Seated Calf Raise', equipment: 'machine' },
        dumbbells: { name: 'Dumbbell Calf Raise', equipment: 'dumbbell' },
        bodyweight: { name: 'Standing Calf Raise', equipment: 'bodyweight' },
      }),
      m('core', {
        gym: { name: 'Hanging Knee Raise', equipment: 'bodyweight' },
        dumbbells: { name: 'Hanging Knee Raise', equipment: 'bodyweight' },
        bodyweight: { name: 'Lying Leg Raise', equipment: 'bodyweight' },
      }),
    ],
  },
  upper: {
    key: 'upper',
    focus: 'Upper body — push + pull',
    moves: [
      m('chest', {
        gym: { name: 'Barbell Bench Press', equipment: 'barbell' },
        dumbbells: { name: 'Dumbbell Bench Press', equipment: 'dumbbell' },
        bodyweight: { name: 'Push-up', equipment: 'bodyweight' },
      }, { main: true }),
      m('back', {
        gym: { name: 'Barbell Row', equipment: 'barbell' },
        dumbbells: { name: 'One-Arm Dumbbell Row', equipment: 'dumbbell' },
        bodyweight: { name: 'Inverted Row', equipment: 'bodyweight' },
      }, { main: true }),
      m('shoulders', {
        gym: { name: 'Overhead Press', equipment: 'barbell' },
        dumbbells: { name: 'Dumbbell Shoulder Press', equipment: 'dumbbell' },
        bodyweight: { name: 'Pike Push-up', equipment: 'bodyweight' },
      }),
      m('back', {
        gym: { name: 'Lat Pulldown', equipment: 'machine' },
        dumbbells: { name: 'Pull-up', equipment: 'bodyweight' },
        bodyweight: { name: 'Pull-up', equipment: 'bodyweight' },
      }),
      m('arms', {
        gym: { name: 'Superset: Barbell Curl', equipment: 'barbell' },
        dumbbells: { name: 'Superset: Dumbbell Curl', equipment: 'dumbbell' },
        bodyweight: { name: 'Superset: Chin-up', equipment: 'bodyweight' },
      }, { note: 'Pair with triceps — one set each, back to back.' }),
      m('core', {
        gym: { name: 'Plank', equipment: 'bodyweight' },
        dumbbells: { name: 'Plank', equipment: 'bodyweight' },
        bodyweight: { name: 'Plank', equipment: 'bodyweight' },
      }, { timed: true }),
    ],
  },
  lower: {
    key: 'lower',
    focus: 'Lower body — squat + hinge',
    moves: [
      m('legs', {
        gym: { name: 'Back Squat', equipment: 'barbell' },
        dumbbells: { name: 'Goblet Squat', equipment: 'dumbbell' },
        bodyweight: { name: 'Bulgarian Split Squat', equipment: 'bodyweight' },
      }, { main: true }),
      m('legs', {
        gym: { name: 'Romanian Deadlift', equipment: 'barbell' },
        dumbbells: { name: 'Dumbbell Romanian Deadlift', equipment: 'dumbbell' },
        bodyweight: { name: 'Single-Leg Glute Bridge', equipment: 'bodyweight' },
      }, { main: true }),
      m('legs', {
        gym: { name: 'Leg Press', equipment: 'machine' },
        dumbbells: { name: 'Walking Lunge', equipment: 'dumbbell' },
        bodyweight: { name: 'Walking Lunge', equipment: 'bodyweight' },
      }),
      m('legs', {
        gym: { name: 'Standing Calf Raise', equipment: 'machine' },
        dumbbells: { name: 'Dumbbell Calf Raise', equipment: 'dumbbell' },
        bodyweight: { name: 'Standing Calf Raise', equipment: 'bodyweight' },
      }),
      m('core', {
        gym: { name: 'Lying Leg Raise', equipment: 'bodyweight' },
        dumbbells: { name: 'Lying Leg Raise', equipment: 'bodyweight' },
        bodyweight: { name: 'Lying Leg Raise', equipment: 'bodyweight' },
      }),
    ],
  },
  full_a: {
    key: 'full_a',
    focus: 'Squat · Press · Row',
    moves: [
      m('legs', {
        gym: { name: 'Back Squat', equipment: 'barbell' },
        dumbbells: { name: 'Goblet Squat', equipment: 'dumbbell' },
        bodyweight: { name: 'Bulgarian Split Squat', equipment: 'bodyweight' },
      }, { main: true }),
      m('chest', {
        gym: { name: 'Barbell Bench Press', equipment: 'barbell' },
        dumbbells: { name: 'Dumbbell Bench Press', equipment: 'dumbbell' },
        bodyweight: { name: 'Push-up', equipment: 'bodyweight' },
      }, { main: true }),
      m('back', {
        gym: { name: 'Barbell Row', equipment: 'barbell' },
        dumbbells: { name: 'One-Arm Dumbbell Row', equipment: 'dumbbell' },
        bodyweight: { name: 'Inverted Row', equipment: 'bodyweight' },
      }, { main: true }),
      m('legs', {
        gym: { name: 'Romanian Deadlift', equipment: 'barbell' },
        dumbbells: { name: 'Dumbbell Romanian Deadlift', equipment: 'dumbbell' },
        bodyweight: { name: 'Single-Leg Glute Bridge', equipment: 'bodyweight' },
      }),
      m('shoulders', {
        gym: { name: 'Dumbbell Lateral Raise', equipment: 'dumbbell' },
        dumbbells: { name: 'Dumbbell Lateral Raise', equipment: 'dumbbell' },
        bodyweight: { name: 'Diamond Push-up', equipment: 'bodyweight' },
      }),
      m('core', {
        gym: { name: 'Plank', equipment: 'bodyweight' },
        dumbbells: { name: 'Plank', equipment: 'bodyweight' },
        bodyweight: { name: 'Plank', equipment: 'bodyweight' },
      }, { timed: true }),
    ],
  },
  full_b: {
    key: 'full_b',
    focus: 'Hinge · Press · Pull-up',
    moves: [
      m('legs', {
        gym: { name: 'Leg Press', equipment: 'machine' },
        dumbbells: { name: 'Walking Lunge', equipment: 'dumbbell' },
        bodyweight: { name: 'Walking Lunge', equipment: 'bodyweight' },
      }, { main: true }),
      m('shoulders', {
        gym: { name: 'Overhead Press', equipment: 'barbell' },
        dumbbells: { name: 'Dumbbell Shoulder Press', equipment: 'dumbbell' },
        bodyweight: { name: 'Pike Push-up', equipment: 'bodyweight' },
      }, { main: true }),
      m('back', {
        gym: { name: 'Lat Pulldown', equipment: 'machine' },
        dumbbells: { name: 'Pull-up', equipment: 'bodyweight' },
        bodyweight: { name: 'Pull-up', equipment: 'bodyweight' },
      }, { main: true }),
      m('chest', {
        gym: { name: 'Incline Dumbbell Press', equipment: 'dumbbell' },
        dumbbells: { name: 'Incline Dumbbell Press', equipment: 'dumbbell' },
        bodyweight: { name: 'Decline Push-up', equipment: 'bodyweight' },
      }),
      m('arms', {
        gym: { name: 'Barbell Curl', equipment: 'barbell' },
        dumbbells: { name: 'Dumbbell Curl', equipment: 'dumbbell' },
        bodyweight: { name: 'Chin-up', equipment: 'bodyweight' },
      }),
      m('core', {
        gym: { name: 'Hanging Knee Raise', equipment: 'bodyweight' },
        dumbbells: { name: 'Hanging Knee Raise', equipment: 'bodyweight' },
        bodyweight: { name: 'Lying Leg Raise', equipment: 'bodyweight' },
      }),
    ],
  },
}

/** Day-count → ordered split. The whole "intelligence" is this table — on purpose. */
export const SPLIT_BY_DAYS: Record<number, readonly string[]> = {
  2: ['full_a', 'full_b'],
  3: ['push', 'pull', 'legs'],
  4: ['upper', 'lower', 'push', 'pull'],
  5: ['push', 'pull', 'legs', 'upper', 'lower'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
}

const EQUIPMENT_LABEL: Record<GeneratorEquipment, string> = {
  gym: 'full gym',
  dumbbells: 'dumbbells',
  bodyweight: 'bodyweight',
}

export interface GeneratorInput {
  goal: GeneratorGoal
  daysPerWeek: number
  equipment: GeneratorEquipment
}

/**
 * Generate a complete plan payload (create-plan compatible). Deterministic:
 * same input → identical output. Throws on invalid input so bad UI state can
 * never silently produce a broken plan.
 */
export function generatePlan(input: GeneratorInput): GeneratedPlan {
  if (!Number.isInteger(input.daysPerWeek) || input.daysPerWeek < 2 || input.daysPerWeek > 6) {
    throw new Error('daysPerWeek must be an integer between 2 and 6')
  }
  const goal = GOAL_CONFIG[input.goal]
  if (!goal) throw new Error('unknown goal')
  const split = SPLIT_BY_DAYS[input.daysPerWeek]
  if (!split) throw new Error('daysPerWeek must be an integer between 2 and 6')

  const dayNames = ['A', 'B', 'C', 'D', 'E', 'F']
  const days: GenDay[] = split.map((key, i) => {
    const template = DAY_TEMPLATES[key]
    if (!template) throw new Error(`unknown day template: ${key}`)
    const exercises: GenExercise[] = template.moves.map((move) => {
      const variant = move.variants[input.equipment]
      if (move.timed) {
        return {
          name: variant.name,
          muscleGroup: move.muscleGroup,
          equipment: variant.equipment,
          sets: goal.auxSets,
          secondsMin: CORE_SECONDS[0],
          secondsMax: CORE_SECONDS[1],
          restSeconds: 60,
          ...(move.note ? { note: move.note } : {}),
        }
      }
      const isMain = Boolean(move.main)
      const sets = isMain ? goal.mainSets : goal.auxSets
      const [repMin, repMax] = isMain ? goal.mainReps : goal.auxReps
      const restSeconds = isMain ? goal.mainRest : goal.auxRest
      return {
        name: variant.name,
        muscleGroup: move.muscleGroup,
        equipment: variant.equipment,
        sets,
        repMin,
        repMax,
        restSeconds,
        ...(move.note ? { note: move.note } : {}),
      }
    })
    return {
      label: `Workout ${dayNames[i]}`,
      focus: template.focus,
      exercises,
    }
  })

  const secondCycleNote =
    input.daysPerWeek === 6
      ? ' The week runs PPL twice — treat the second cycle as your heavy/pass days.'
      : ''
  return {
    name: `${input.daysPerWeek}-day ${goal.label} (${EQUIPMENT_LABEL[input.equipment]})`,
    emoji: goal.emoji,
    note: `${goal.coachingNote}${secondCycleNote}`,
    days,
  }
}

/**
 * Weekly working sets per muscle group across the plan — the sanity metric
 * for a split (10–20 sets/week per muscle is the useful band). Sorted desc.
 */
export function weeklySetVolume(plan: GeneratedPlan): { muscleGroup: string; sets: number }[] {
  const totals = new Map<string, number>()
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      totals.set(ex.muscleGroup, (totals.get(ex.muscleGroup) ?? 0) + ex.sets)
    }
  }
  return [...totals.entries()]
    .map(([muscleGroup, sets]) => ({ muscleGroup, sets }))
    .sort((a, b) => b.sets - a.sets || a.muscleGroup.localeCompare(b.muscleGroup))
}

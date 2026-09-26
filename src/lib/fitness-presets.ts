// Phase 13 — one-tap plan preset + veg protein quick-add reference data.
// The Foundation A/B template reproduces the coach's 4-week beginner plan
// verbatim for Workout A; Workout B is constructed in the same full-body
// mirrored spirit (documented interpretation — the source plan detailed
// only A). Nutrition chips are TYPICAL per-portion estimates for Indian
// vegetarian staples; the app always tells the user to check package labels.

export interface PresetExercise {
  name: string
  muscleGroup: 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core' | 'full_body' | 'cardio' | 'other'
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other'
  sets: number
  repMin?: number
  repMax?: number
  secondsMin?: number
  secondsMax?: number
  restSeconds?: number
  note?: string
}

export interface PresetDay {
  label: string
  focus: string
  exercises: PresetExercise[]
}

export interface PlanPreset {
  id: string
  name: string
  emoji: string
  note: string
  days: PresetDay[]
}

/** The user's requested 6-month vegetarian transformation blueprint. */
export const VEGETARIAN_TRANSFORMATION: PlanPreset = {
  id: 'vegetarian_transformation',
  name: 'Vegetarian Transformation',
  emoji: '🌱',
  note: 'Six-month coach system: 4 strength days, 1 active recovery day and 1 cardio/core day. Add reps or load weekly when form stays clean; every 4th week deload by cutting sets 40-50%. Daily anchors: 8k-10k steps, 3 L water, 7-9 h sleep, SPF every morning, protein at every meal and mostly whole vegetarian foods.',
  days: [
    {
      label: 'Push',
      focus: 'Chest · Shoulders · Triceps',
      exercises: [
        { name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', sets: 3, repMin: 8, repMax: 12, restSeconds: 180, note: 'Or machine chest press. Form before load.' },
        { name: 'Overhead Shoulder Press', muscleGroup: 'shoulders', equipment: 'barbell', sets: 3, repMin: 8, repMax: 12, restSeconds: 150 },
        { name: 'Incline Dumbbell Press', muscleGroup: 'chest', equipment: 'dumbbell', sets: 3, repMin: 10, repMax: 12, restSeconds: 120 },
        { name: 'Dumbbell Lateral Raise', muscleGroup: 'shoulders', equipment: 'dumbbell', sets: 3, repMin: 12, repMax: 15, restSeconds: 75 },
        { name: 'Dips', muscleGroup: 'arms', equipment: 'bodyweight', sets: 3, repMin: 6, repMax: 12, restSeconds: 120, note: 'Use assistance if needed; stop before shoulders pinch.' },
        { name: 'Push-up', muscleGroup: 'chest', equipment: 'bodyweight', sets: 2, repMin: 10, repMax: 20, restSeconds: 60 },
      ],
    },
    {
      label: 'Lower',
      focus: 'Squat · Hinge · Lunge',
      exercises: [
        { name: 'Barbell Squat', muscleGroup: 'legs', equipment: 'barbell', sets: 4, repMin: 6, repMax: 10, restSeconds: 210, note: 'Depth and bracing first; leave 2 reps in reserve.' },
        { name: 'Romanian Deadlift', muscleGroup: 'legs', equipment: 'barbell', sets: 3, repMin: 8, repMax: 12, restSeconds: 180 },
        { name: 'Walking Lunge', muscleGroup: 'legs', equipment: 'dumbbell', sets: 3, repMin: 10, repMax: 12, restSeconds: 120, note: 'Reps are per leg.' },
        { name: 'Leg Curl', muscleGroup: 'legs', equipment: 'machine', sets: 3, repMin: 10, repMax: 15, restSeconds: 90 },
        { name: 'Calf Raise', muscleGroup: 'legs', equipment: 'machine', sets: 4, repMin: 12, repMax: 20, restSeconds: 60 },
      ],
    },
    {
      label: 'Active Recovery',
      focus: 'Walking · Yoga · Mobility',
      exercises: [
        { name: 'Brisk Walk', muscleGroup: 'cardio', equipment: 'bodyweight', sets: 1, secondsMin: 1800, secondsMax: 2700, restSeconds: 60, note: 'Easy conversational pace; this supports fat loss without draining recovery.' },
        { name: 'Cat-Cow', muscleGroup: 'back', equipment: 'bodyweight', sets: 2, repMin: 8, repMax: 12, restSeconds: 20 },
        { name: 'Hip Flexor Stretch', muscleGroup: 'legs', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 45, restSeconds: 15, note: 'Each side.' },
        { name: 'Thoracic Rotation', muscleGroup: 'back', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 45, restSeconds: 15, note: 'Each side.' },
        { name: 'Childs Pose Breathing', muscleGroup: 'other', equipment: 'bodyweight', sets: 2, secondsMin: 60, secondsMax: 90, restSeconds: 15 },
      ],
    },
    {
      label: 'Pull',
      focus: 'Back · Rear delts · Biceps',
      exercises: [
        { name: 'Pull-up', muscleGroup: 'back', equipment: 'bodyweight', sets: 3, repMin: 5, repMax: 10, restSeconds: 150, note: 'Assisted pull-ups are fine; reduce assistance over time.' },
        { name: 'Barbell Row', muscleGroup: 'back', equipment: 'barbell', sets: 3, repMin: 8, repMax: 12, restSeconds: 150 },
        { name: 'Seated Cable Row', muscleGroup: 'back', equipment: 'cable', sets: 3, repMin: 10, repMax: 12, restSeconds: 120 },
        { name: 'Face Pull', muscleGroup: 'shoulders', equipment: 'cable', sets: 3, repMin: 12, repMax: 15, restSeconds: 75, note: 'Shoulder health; keep this crisp and controlled.' },
        { name: 'Dumbbell Curl', muscleGroup: 'arms', equipment: 'dumbbell', sets: 3, repMin: 10, repMax: 15, restSeconds: 75 },
      ],
    },
    {
      label: 'Full Body Conditioning',
      focus: 'Circuit · Carries · HIIT',
      exercises: [
        { name: 'Goblet Squat', muscleGroup: 'legs', equipment: 'dumbbell', sets: 3, repMin: 10, repMax: 15, restSeconds: 75 },
        { name: 'Push-up', muscleGroup: 'chest', equipment: 'bodyweight', sets: 3, repMin: 8, repMax: 15, restSeconds: 60 },
        { name: 'Kettlebell Swing', muscleGroup: 'full_body', equipment: 'other', sets: 3, repMin: 12, repMax: 20, restSeconds: 75, note: 'Dumbbell swing works if no kettlebell is available.' },
        { name: 'Farmer Carry', muscleGroup: 'full_body', equipment: 'dumbbell', sets: 4, secondsMin: 30, secondsMax: 45, restSeconds: 75 },
        { name: 'HIIT Bike', muscleGroup: 'cardio', equipment: 'machine', sets: 1, secondsMin: 900, secondsMax: 1200, restSeconds: 60, note: '15-20 minutes total: hard intervals, easy recoveries.' },
      ],
    },
    {
      label: 'Cardio + Core',
      focus: 'Zone 2 · Abs',
      exercises: [
        { name: 'Moderate Cardio', muscleGroup: 'cardio', equipment: 'machine', sets: 1, secondsMin: 1800, secondsMax: 2700, restSeconds: 60, note: 'Jog, cycle, swim or incline walk at a sustainable pace.' },
        { name: 'Plank', muscleGroup: 'core', equipment: 'bodyweight', sets: 3, secondsMin: 30, secondsMax: 60, restSeconds: 60 },
        { name: 'Hanging Knee Raise', muscleGroup: 'core', equipment: 'bodyweight', sets: 3, repMin: 10, repMax: 15, restSeconds: 60 },
        { name: 'Dead Bug', muscleGroup: 'core', equipment: 'bodyweight', sets: 3, repMin: 8, repMax: 12, restSeconds: 45, note: 'Per side; slow and braced.' },
      ],
    },
  ],
}

export const FOUNDATION_AB: PlanPreset = {
  id: 'foundation_ab',
  name: 'Foundation A/B',
  emoji: '🏋️',
  note: 'Beginner full-body, 3 days a week (Mon/Wed/Fri), alternating A and B. 2–3 reps in reserve on every set — do not train to failure. Rest 2–3 min on big compounds, 60–120 s on smaller moves.',
  days: [
    {
      label: 'Workout A',
      focus: 'Squat · Bench · Pulldown',
      exercises: [
        { name: 'Squat', muscleGroup: 'legs', equipment: 'barbell', sets: 3, repMin: 8, repMax: 12, restSeconds: 180, note: 'Or leg press. Depth below parallel when mobility allows.' },
        { name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', sets: 3, repMin: 8, repMax: 12, restSeconds: 180, note: 'Or machine chest press.' },
        { name: 'Lat Pulldown', muscleGroup: 'back', equipment: 'machine', sets: 3, repMin: 8, repMax: 12, restSeconds: 120 },
        { name: 'Romanian Deadlift', muscleGroup: 'legs', equipment: 'barbell', sets: 2, repMin: 8, repMax: 10, restSeconds: 150, note: 'Hamstrings & glutes — hinge, don\u2019t squat the weight down.' },
        { name: 'Dumbbell Lateral Raise', muscleGroup: 'shoulders', equipment: 'dumbbell', sets: 2, repMin: 12, repMax: 15, restSeconds: 90, note: 'Side delts for shoulder width.' },
        { name: 'Plank', muscleGroup: 'core', equipment: 'bodyweight', sets: 3, secondsMin: 20, secondsMax: 45, restSeconds: 60 },
      ],
    },
    {
      label: 'Workout B',
      focus: 'Press · Row · Pull-up',
      exercises: [
        { name: 'Leg Press', muscleGroup: 'legs', equipment: 'machine', sets: 3, repMin: 8, repMax: 12, restSeconds: 180 },
        { name: 'Dumbbell Shoulder Press', muscleGroup: 'shoulders', equipment: 'dumbbell', sets: 3, repMin: 8, repMax: 12, restSeconds: 150 },
        { name: 'Seated Cable Row', muscleGroup: 'back', equipment: 'cable', sets: 3, repMin: 8, repMax: 12, restSeconds: 120 },
        { name: 'Incline Dumbbell Press', muscleGroup: 'chest', equipment: 'dumbbell', sets: 3, repMin: 8, repMax: 12, restSeconds: 150 },
        { name: 'Assisted Pull-up', muscleGroup: 'back', equipment: 'bodyweight', sets: 2, repMin: 6, repMax: 10, restSeconds: 120, note: 'Band or machine assist — reduce it over the weeks.' },
        { name: 'Hanging Knee Raise', muscleGroup: 'core', equipment: 'bodyweight', sets: 3, repMin: 10, repMax: 15, restSeconds: 60 },
      ],
    },
  ],
}


/* ================= Phase 24 — more plan presets ================= */
//
// Split templates, transcribed from the reference programmes the user
// supplied. Rep ranges and set counts are kept as written; rest times are a
// documented interpretation (the sources gave sets × reps only) following the
// same guidance as Foundation A/B: 2–3 min on big compounds, 60–120 s on
// smaller moves. Every preset lands as an ordinary editable plan.

/** Push / Pull / Legs, 6 days: Push · Pull · Legs · Push · Pull · Legs. */
export const PPL_SIX_DAY: PlanPreset = {
  id: 'ppl_6',
  name: 'Push / Pull / Legs',
  emoji: '🔁',
  note: 'Six training days, each muscle group twice a week: Push · Pull · Legs, repeated. Rest or active recovery on the seventh day. High frequency — only worth it once you can already recover from four sessions a week.',
  days: [
    {
      label: 'Push',
      focus: 'Chest · Shoulders · Triceps',
      exercises: [
        { name: 'Flat Bench Press', muscleGroup: 'chest', equipment: 'barbell', sets: 4, repMin: 8, repMax: 12, restSeconds: 180 },
        { name: 'Incline Dumbbell Press', muscleGroup: 'chest', equipment: 'dumbbell', sets: 3, repMin: 10, repMax: 12, restSeconds: 150 },
        { name: 'Overhead Shoulder Press', muscleGroup: 'shoulders', equipment: 'barbell', sets: 4, repMin: 8, repMax: 10, restSeconds: 180 },
        { name: 'Dumbbell Lateral Raise', muscleGroup: 'shoulders', equipment: 'dumbbell', sets: 3, repMin: 12, repMax: 15, restSeconds: 90 },
        { name: 'Tricep Pushdown', muscleGroup: 'arms', equipment: 'cable', sets: 3, repMin: 12, repMax: 15, restSeconds: 90 },
        { name: 'Overhead Tricep Extension', muscleGroup: 'arms', equipment: 'dumbbell', sets: 3, repMin: 10, repMax: 12, restSeconds: 90 },
        { name: 'Incline Treadmill Walk', muscleGroup: 'cardio', equipment: 'machine', sets: 1, secondsMin: 1200, secondsMax: 1200, restSeconds: 60, note: '20 minutes, easy pace.' },
      ],
    },
    {
      label: 'Pull',
      focus: 'Back · Biceps · Rear delts',
      exercises: [
        { name: 'Lat Pulldown', muscleGroup: 'back', equipment: 'machine', sets: 4, repMin: 6, repMax: 10, restSeconds: 150 },
        { name: 'Seated Cable Row', muscleGroup: 'back', equipment: 'cable', sets: 4, repMin: 8, repMax: 12, restSeconds: 150 },
        { name: 'Single-Arm Dumbbell Row', muscleGroup: 'back', equipment: 'dumbbell', sets: 3, repMin: 10, repMax: 12, restSeconds: 120 },
        { name: 'Face Pull', muscleGroup: 'shoulders', equipment: 'cable', sets: 3, repMin: 12, repMax: 15, restSeconds: 90, note: 'Rear delts and shoulder health — keep it light.' },
        { name: 'Barbell Curl', muscleGroup: 'arms', equipment: 'barbell', sets: 3, repMin: 10, repMax: 12, restSeconds: 90 },
        { name: 'Hammer Curl', muscleGroup: 'arms', equipment: 'dumbbell', sets: 3, repMin: 10, repMax: 12, restSeconds: 90 },
        { name: 'Cycling', muscleGroup: 'cardio', equipment: 'machine', sets: 1, secondsMin: 720, secondsMax: 900, restSeconds: 60, note: '12–15 minutes.' },
      ],
    },
    {
      label: 'Legs',
      focus: 'Quads · Hamstrings · Glutes · Calves',
      exercises: [
        { name: 'Barbell Squat', muscleGroup: 'legs', equipment: 'barbell', sets: 4, repMin: 8, repMax: 12, restSeconds: 210 },
        { name: 'Romanian Deadlift', muscleGroup: 'legs', equipment: 'barbell', sets: 4, repMin: 10, repMax: 12, restSeconds: 180 },
        { name: 'Leg Press', muscleGroup: 'legs', equipment: 'machine', sets: 3, repMin: 10, repMax: 15, restSeconds: 150 },
        { name: 'Leg Curl', muscleGroup: 'legs', equipment: 'machine', sets: 3, repMin: 10, repMax: 12, restSeconds: 90 },
        { name: 'Walking Lunge', muscleGroup: 'legs', equipment: 'dumbbell', sets: 3, repMin: 12, repMax: 12, restSeconds: 120, note: '12 per leg.' },
        { name: 'Calf Raise', muscleGroup: 'legs', equipment: 'machine', sets: 4, repMin: 15, repMax: 20, restSeconds: 60 },
        { name: 'Walking', muscleGroup: 'cardio', equipment: 'bodyweight', sets: 1, secondsMin: 300, secondsMax: 300, restSeconds: 60, note: '5 minutes to finish.' },
      ],
    },
  ],
}

/** Upper / Lower, 4 days — each muscle group twice a week. */
export const UPPER_LOWER_FOUR_DAY: PlanPreset = {
  id: 'upper_lower_4',
  name: 'Upper / Lower',
  emoji: '⚖️',
  note: 'Four days: Upper A · Lower A · Upper B · Lower B. Each muscle group twice a week with more recovery than PPL — the workhorse split for intermediates. Heavier, lower reps on the A days; higher reps on the B days.',
  days: [
    {
      label: 'Upper A',
      focus: 'Heavy push & pull',
      exercises: [
        { name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', sets: 4, repMin: 5, repMax: 8, restSeconds: 210 },
        { name: 'Barbell Row', muscleGroup: 'back', equipment: 'barbell', sets: 4, repMin: 6, repMax: 8, restSeconds: 180 },
        { name: 'Overhead Shoulder Press', muscleGroup: 'shoulders', equipment: 'barbell', sets: 3, repMin: 6, repMax: 8, restSeconds: 180 },
        { name: 'Pull-up', muscleGroup: 'back', equipment: 'bodyweight', sets: 3, repMin: 6, repMax: 10, restSeconds: 150, note: 'Band or machine assist if needed.' },
        { name: 'Dumbbell Lateral Raise', muscleGroup: 'shoulders', equipment: 'dumbbell', sets: 3, repMin: 12, repMax: 15, restSeconds: 90 },
      ],
    },
    {
      label: 'Lower A',
      focus: 'Squat pattern',
      exercises: [
        { name: 'Barbell Squat', muscleGroup: 'legs', equipment: 'barbell', sets: 4, repMin: 5, repMax: 8, restSeconds: 210 },
        { name: 'Romanian Deadlift', muscleGroup: 'legs', equipment: 'barbell', sets: 3, repMin: 8, repMax: 10, restSeconds: 180 },
        { name: 'Leg Press', muscleGroup: 'legs', equipment: 'machine', sets: 3, repMin: 10, repMax: 12, restSeconds: 150 },
        { name: 'Calf Raise', muscleGroup: 'legs', equipment: 'machine', sets: 4, repMin: 15, repMax: 20, restSeconds: 60 },
        { name: 'Plank', muscleGroup: 'core', equipment: 'bodyweight', sets: 3, secondsMin: 30, secondsMax: 60, restSeconds: 60 },
      ],
    },
    {
      label: 'Upper B',
      focus: 'Volume push & pull',
      exercises: [
        { name: 'Incline Bench Press', muscleGroup: 'chest', equipment: 'barbell', sets: 4, repMin: 8, repMax: 12, restSeconds: 180 },
        { name: 'Lat Pulldown', muscleGroup: 'back', equipment: 'machine', sets: 4, repMin: 10, repMax: 12, restSeconds: 150 },
        { name: 'Dumbbell Shoulder Press', muscleGroup: 'shoulders', equipment: 'dumbbell', sets: 3, repMin: 10, repMax: 12, restSeconds: 150 },
        { name: 'Seated Cable Row', muscleGroup: 'back', equipment: 'cable', sets: 3, repMin: 10, repMax: 12, restSeconds: 120 },
        { name: 'Barbell Curl', muscleGroup: 'arms', equipment: 'barbell', sets: 3, repMin: 10, repMax: 12, restSeconds: 90 },
        { name: 'Tricep Pushdown', muscleGroup: 'arms', equipment: 'cable', sets: 3, repMin: 12, repMax: 15, restSeconds: 90 },
      ],
    },
    {
      label: 'Lower B',
      focus: 'Hinge pattern',
      exercises: [
        { name: 'Deadlift', muscleGroup: 'legs', equipment: 'barbell', sets: 3, repMin: 5, repMax: 6, restSeconds: 240, note: 'Heaviest lift of the week — leave 2–3 reps in reserve.' },
        { name: 'Front Squat', muscleGroup: 'legs', equipment: 'barbell', sets: 3, repMin: 8, repMax: 10, restSeconds: 180 },
        { name: 'Walking Lunge', muscleGroup: 'legs', equipment: 'dumbbell', sets: 3, repMin: 12, repMax: 12, restSeconds: 120, note: '12 per leg.' },
        { name: 'Leg Curl', muscleGroup: 'legs', equipment: 'machine', sets: 3, repMin: 10, repMax: 12, restSeconds: 90 },
        { name: 'Hanging Knee Raise', muscleGroup: 'core', equipment: 'bodyweight', sets: 3, repMin: 10, repMax: 15, restSeconds: 60 },
      ],
    },
  ],
}

/** Beginner full body, 3 days a week, every exercise a compound. */
export const FULL_BODY_THREE_DAY: PlanPreset = {
  id: 'full_body_3',
  name: 'Full Body 3×',
  emoji: '🏃',
  note: 'Three full-body sessions a week (Mon/Wed/Fri), every exercise a compound. Low volume, high frequency — add weight whenever you complete all sets at the top of the range with good form.',
  days: [
    {
      label: 'Full Body',
      focus: 'Squat · Press · Row',
      exercises: [
        { name: 'Barbell Squat', muscleGroup: 'legs', equipment: 'barbell', sets: 3, repMin: 5, repMax: 5, restSeconds: 210 },
        { name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', sets: 3, repMin: 5, repMax: 5, restSeconds: 210 },
        { name: 'Bent-Over Row', muscleGroup: 'back', equipment: 'barbell', sets: 3, repMin: 5, repMax: 5, restSeconds: 180 },
        { name: 'Overhead Shoulder Press', muscleGroup: 'shoulders', equipment: 'barbell', sets: 3, repMin: 5, repMax: 5, restSeconds: 180 },
        { name: 'Plank', muscleGroup: 'core', equipment: 'bodyweight', sets: 3, secondsMin: 30, secondsMax: 60, restSeconds: 60 },
      ],
    },
  ],
}

/** 15-minute daily core flow — timed holds, no equipment. */
export const CORE_FLOW: PlanPreset = {
  id: 'core_flow',
  name: 'Core & Belly Flow',
  emoji: '🧘',
  note: 'A 15-minute daily core circuit. Move straight from one hold to the next; the rest is the transition. Pair it with walking — core work builds the muscle, it does not burn the fat on top of it.',
  days: [
    {
      label: 'Core Flow',
      focus: '15-minute daily circuit',
      exercises: [
        { name: 'Plank Hold', muscleGroup: 'core', equipment: 'bodyweight', sets: 1, secondsMin: 45, secondsMax: 45, restSeconds: 20 },
        { name: 'Bicycle Crunch', muscleGroup: 'core', equipment: 'bodyweight', sets: 1, repMin: 24, repMax: 24, restSeconds: 20 },
        { name: 'Bird-Dog', muscleGroup: 'core', equipment: 'bodyweight', sets: 2, secondsMin: 25, secondsMax: 25, restSeconds: 20, note: '25 s each side.' },
        { name: 'Glute Bridge Hold', muscleGroup: 'core', equipment: 'bodyweight', sets: 3, secondsMin: 40, secondsMax: 40, restSeconds: 20 },
        { name: 'Leg Raise Hold', muscleGroup: 'core', equipment: 'bodyweight', sets: 4, secondsMin: 35, secondsMax: 35, restSeconds: 20 },
        { name: "Child's Pose", muscleGroup: 'core', equipment: 'bodyweight', sets: 1, secondsMin: 50, secondsMax: 50, restSeconds: 10, note: 'Relax and breathe.' },
        { name: 'Cobra Pose', muscleGroup: 'core', equipment: 'bodyweight', sets: 3, secondsMin: 30, secondsMax: 30, restSeconds: 20 },
      ],
    },
  ],
}

/** Mobility: upper body, spine and ankles — timed holds, done on rest days. */
export const MOBILITY_FLOW: PlanPreset = {
  id: 'mobility',
  name: 'Mobility & Stretch',
  emoji: '🤸',
  note: 'Three short mobility sessions for rest days or after training. Hold each stretch for the time shown, breathe out into it, and never push into sharp pain.',
  days: [
    {
      label: 'Upper Body',
      focus: 'Neck · Shoulders · Chest · Lats',
      exercises: [
        { name: 'Neck Stretch', muscleGroup: 'other', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 10, note: '30 s each side.' },
        { name: 'Shoulder Stretch', muscleGroup: 'shoulders', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 10 },
        { name: 'Chest Stretch', muscleGroup: 'chest', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 10, note: 'Doorway or wall — opens the chest, helps posture.' },
        { name: 'Tricep Stretch', muscleGroup: 'arms', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 10 },
        { name: 'Lat Stretch', muscleGroup: 'back', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 10 },
        { name: 'Wrist Stretch', muscleGroup: 'arms', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 10 },
      ],
    },
    {
      label: 'Spine',
      focus: 'Mobility & flexibility',
      exercises: [
        { name: 'Cat-Cow', muscleGroup: 'back', equipment: 'bodyweight', sets: 1, repMin: 10, repMax: 10, restSeconds: 15 },
        { name: "Child's Pose", muscleGroup: 'back', equipment: 'bodyweight', sets: 1, secondsMin: 45, secondsMax: 45, restSeconds: 15 },
        { name: 'Thoracic Rotation', muscleGroup: 'back', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 15, note: '30 s each side.' },
        { name: 'Thread the Needle', muscleGroup: 'back', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 15 },
        { name: 'Seated Spinal Twist', muscleGroup: 'back', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 15 },
        { name: 'Knees to Chest', muscleGroup: 'back', equipment: 'bodyweight', sets: 1, secondsMin: 45, secondsMax: 45, restSeconds: 15 },
      ],
    },
    {
      label: 'Ankles',
      focus: 'Mobility & stability',
      exercises: [
        { name: 'Calf Stretch', muscleGroup: 'legs', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 10, note: '30 s per leg, back leg straight.' },
        { name: 'Soleus Stretch', muscleGroup: 'legs', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 10, note: 'Back knee bent, heel down.' },
        { name: 'Ankle Dorsiflexion Mobilisation', muscleGroup: 'legs', equipment: 'bodyweight', sets: 2, repMin: 10, repMax: 15, restSeconds: 10, note: 'Knee towards the wall without lifting the heel.' },
        { name: 'Ankle Circles', muscleGroup: 'legs', equipment: 'bodyweight', sets: 2, repMin: 10, repMax: 15, restSeconds: 10, note: 'Both directions.' },
        { name: 'Plantar Fascia Stretch', muscleGroup: 'legs', equipment: 'bodyweight', sets: 2, secondsMin: 30, secondsMax: 30, restSeconds: 10 },
        { name: 'Heel Raise', muscleGroup: 'legs', equipment: 'bodyweight', sets: 2, repMin: 10, repMax: 15, restSeconds: 30, note: 'Rise slowly, lower slower.' },
      ],
    },
  ],
}

export const PLAN_PRESETS: readonly PlanPreset[] = [
  VEGETARIAN_TRANSFORMATION,
  FOUNDATION_AB,
  FULL_BODY_THREE_DAY,
  UPPER_LOWER_FOUR_DAY,
  PPL_SIX_DAY,
  CORE_FLOW,
  MOBILITY_FLOW,
]

/** Short "who is this for" line shown next to each preset in the picker. */
export const PLAN_PRESET_LEVELS: Record<string, string> = {
  vegetarian_transformation: '6 days · 6-month system',
  foundation_ab: '3 days · beginner',
  full_body_3: '3 days · beginner',
  upper_lower_4: '4 days · intermediate',
  ppl_6: '6 days · advanced',
  core_flow: 'daily · 15 min',
  mobility: 'rest days · mobility',
}

/* ---------------- veg protein quick-add chips ---------------- */

export interface ProteinChip {
  id: string
  label: string
  portion: string
  /** typical protein grams for the portion */
  proteinG: number
  /** typical kcal for the portion */
  kcal: number
}

export const PROTEIN_CHIPS: readonly ProteinChip[] = [
  { id: 'paneer', label: 'Paneer', portion: '100 g', proteinG: 18, kcal: 265 },
  { id: 'whey', label: 'Whey scoop', portion: '30 g', proteinG: 24, kcal: 120 },
  { id: 'soy_chunks', label: 'Soy chunks', portion: '50 g dry', proteinG: 26, kcal: 172 },
  { id: 'tofu', label: 'Tofu', portion: '150 g', proteinG: 15, kcal: 115 },
  { id: 'greek_yogurt', label: 'Greek yogurt', portion: '170 g cup', proteinG: 17, kcal: 100 },
  { id: 'milk', label: 'Milk', portion: '300 ml', proteinG: 10, kcal: 190 },
  { id: 'dal', label: 'Dal', portion: '1 cup cooked', proteinG: 12, kcal: 180 },
  { id: 'chana', label: 'Roasted chana', portion: '30 g', proteinG: 6, kcal: 110 },
  { id: 'peanut_butter', label: 'Peanut butter', portion: '2 tbsp', proteinG: 8, kcal: 190 },
  { id: 'curd', label: 'Curd / dahi', portion: '200 g', proteinG: 7, kcal: 120 },
  { id: 'oats', label: 'Oats', portion: '40 g dry', proteinG: 5, kcal: 150 },
  { id: 'roti', label: 'Roti', portion: '1 medium', proteinG: 3, kcal: 100 },
]

// Static reference card content (Fuel panel) — from the coach guidance.
export const SUPPLEMENT_NOTES: readonly { name: string; verdict: string; detail: string }[] = [
  { name: 'Creatine monohydrate', verdict: 'Useful', detail: '3–5 g daily; loading is optional. Choose a reputable brand.' },
  { name: 'Whey / plant protein', verdict: 'Optional', detail: 'Only when food alone can\u2019t reach the daily protein target.' },
  { name: 'Vitamin B12', verdict: 'Check', detail: 'Vegetarian diets run low — get tested or use a reliable source.' },
  { name: 'Vitamin D', verdict: 'Individual', detail: 'Depends on sun exposure and bloodwork. Never megadose.' },
  { name: 'Omega-3', verdict: 'Food first', detail: 'Use walnuts, flax/chia or algae oil if your clinician recommends it.' },
  { name: 'Fat burners / boosters', verdict: 'Avoid', detail: 'Skip fat burners, testosterone boosters and “muscle” blends.' },
]

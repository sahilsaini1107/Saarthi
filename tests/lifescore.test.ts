// Phase 5.3 — Life Score component + aggregation math.
import { describe, expect, it } from 'vitest'
import {
  budgetScore,
  computeLifeScore,
  CONTENT_MONTHLY_TARGET,
  contentScore,
  ideaScore,
  goalJournalScore,
  GOAL_JOURNAL_WEEKLY_TARGET_MIN,
  habitScore,
  journalScore,
  moodScore,
  moodToScore,
  mealScore,
  netWorthScore,
  peopleScore,
  READING_WEEKLY_TARGET_MIN,
  readingScore,
  savingsRateScore,
  skinScore,
  SKILL_WEEKLY_TARGET_MIN,
  skillScore,
  studyScore,
  workoutScore,
} from '@/lib/lifescore'

describe('component scores — clamps and nulls', () => {
  it('savings rate: linear to 30%, negative clamps to 0', () => {
    expect(savingsRateScore(30)).toBe(100)
    expect(savingsRateScore(15)).toBe(50)
    expect(savingsRateScore(0)).toBe(0)
    expect(savingsRateScore(-10)).toBe(0) // spending more than earning
    expect(savingsRateScore(60)).toBe(100)
    expect(savingsRateScore(null)).toBeNull()
  })

  it('budgets: ratio × 100', () => {
    expect(budgetScore(0.75)).toBe(75)
    expect(budgetScore(1)).toBe(100)
    expect(budgetScore(null)).toBeNull()
  })

  it('net worth: boolean mapping, null passes through', () => {
    expect(netWorthScore(true)).toBe(100)
    expect(netWorthScore(false)).toBe(0)
    expect(netWorthScore(null)).toBeNull()
  })

  it('habits: 30-day rate × 100 (components keep raw precision)', () => {
    expect(habitScore(0.8333)).toBeCloseTo(83.33, 2)
    expect(habitScore(null)).toBeNull()
  })

  it('workout: 150 min weekly target', () => {
    expect(workoutScore(150)).toBe(100)
    expect(workoutScore(75)).toBe(50)
    expect(workoutScore(300)).toBe(100) // capped
    expect(workoutScore(0)).toBe(0)
    expect(workoutScore(null)).toBeNull()
  })

  it('study: 120 min weekly target', () => {
    expect(studyScore(120)).toBe(100)
    expect(studyScore(30)).toBe(25)
    expect(studyScore(null)).toBeNull()
  })

  it('journal: 20 entries/month target', () => {
    expect(journalScore(20)).toBe(100)
    expect(journalScore(10)).toBe(50)
    expect(journalScore(35)).toBe(100) // capped
    expect(journalScore(null)).toBeNull()
  })

  it('mood + skin', () => {
    expect(moodScore(80)).toBe(80)
    expect(skinScore(21)).toBe(100)
    expect(skinScore(7)).toBeCloseTo(33.33, 2)
    expect(skinScore(null)).toBeNull()
  })

  it('mood key → score mapping', () => {
    expect(moodToScore('great')).toBe(100)
    expect(moodToScore('okay')).toBe(50)
    expect(moodToScore('bad')).toBe(0)
  })
})

describe('computeLifeScore — pillars and overall', () => {
  it('empty inputs → everything null (not enough data)', () => {
    const s = computeLifeScore({
      savingsRatePct: null,
      budgetOnTrackRatio: null,
      netWorthUp: null,
      habitRate30: null,
      workoutMinutes7d: null,
      studyMinutes7d: null,
      journalEntries30d: null,
      moodScore: null,
      skinStreak: null,
    })
    expect(s.overall).toBeNull()
    expect(s.wealth.score).toBeNull()
    expect(s.growth.score).toBeNull()
    expect(s.reflection.score).toBeNull()
  })

  it('wealth = mean of present components (missing skipped)', () => {
    // savings 15% → 50, budgets missing, net worth up → 100 → mean = 75
    const s = computeLifeScore({
      savingsRatePct: 15,
      budgetOnTrackRatio: null,
      netWorthUp: true,
      habitRate30: null,
      workoutMinutes7d: null,
      studyMinutes7d: null,
      journalEntries30d: null,
      moodScore: null,
      skinStreak: null,
    })
    expect(s.wealth.score).toBe(75)
    expect(s.overall).toBe(75)
    expect(s.wealth.components.find((c) => c.label === 'Savings rate')?.score).toBe(50)
    expect(s.wealth.components.find((c) => c.label === 'Budgets on track')?.score).toBeNull()
  })

  it('hand-verified full example', () => {
    // wealth: savings 15% → 50; budgets 1.0 → 100; networth down → 0 ⇒ mean 50
    // growth: habits 0.9 → 90; workout 75 → 50; study null ⇒ mean 70
    // reflection: journal 10 → 50; mood 75 → 75; skin 21 → 100 ⇒ mean 75
    const s = computeLifeScore({
      savingsRatePct: 15,
      budgetOnTrackRatio: 1,
      netWorthUp: false,
      habitRate30: 0.9,
      workoutMinutes7d: 75,
      studyMinutes7d: null,
      journalEntries30d: 10,
      moodScore: 75,
      skinStreak: 21,
    })
    expect(s.wealth.score).toBe(50)
    expect(s.growth.score).toBe(70)
    expect(s.reflection.score).toBe(75)
    expect(s.overall).toBe(65) // round((50+70+75)/3) = round(65.0)
  })

  it('overall = round(mean of pillars): (100+80+75)/3 = 85', () => {
    const s = computeLifeScore({
      savingsRatePct: 30, // → 100 (30% target met)
      budgetOnTrackRatio: 1, // → 100
      netWorthUp: true, // → 100
      habitRate30: 0.9, // → 90
      workoutMinutes7d: 112.5, // → 75
      studyMinutes7d: 90, // → 75
      journalEntries30d: null,
      moodScore: 75, // → 75
      skinStreak: null,
    })
    // wealth = (100+100+100)/3 = 100; growth = (90+75+75)/3 = 80; reflection = 75
    expect(s.wealth.score).toBe(100)
    expect(s.growth.score).toBe(80)
    expect(s.reflection.score).toBe(75)
    expect(s.overall).toBe(85)
  })

  it('pillar rounding: fractional means round to nearest int', () => {
    const s = computeLifeScore({
      savingsRatePct: null,
      budgetOnTrackRatio: null,
      netWorthUp: null,
      habitRate30: null,
      workoutMinutes7d: null,
      studyMinutes7d: null,
      journalEntries30d: 18, // 90
      moodScore: 55, // 55
      skinStreak: 19, // (19/21)*100 = 90.476…
    })
    // reflection = (90 + 55 + 90.476)/3 = 78.49 → 78
    expect(s.reflection.score).toBe(78)
    expect(s.overall).toBe(78)
  })
})

describe('goalJournalScore — Phase 12 goal-effort component', () => {
  it('null / idle semantics', () => {
    expect(goalJournalScore(null)).toBeNull()
    expect(goalJournalScore(Number.NaN)).toBeNull()
    expect(goalJournalScore(0)).toBe(0) // feature used but idle this week → honest 0
  })
  it('linear against the 150 min/week target, clamped at 100', () => {
    expect(GOAL_JOURNAL_WEEKLY_TARGET_MIN).toBe(150)
    expect(goalJournalScore(75)).toBe(50)
    expect(goalJournalScore(150)).toBe(100)
    expect(goalJournalScore(300)).toBe(100)
    expect(goalJournalScore(37.5)).toBe(25)
  })
  it('growth pillar: goal effort joins the mean only when present', () => {
    // study 90 → 75, goal effort 45 → 30: growth = (75 + 30) / 2 = 52.5 → 53
    const both = computeLifeScore({
      savingsRatePct: null,
      budgetOnTrackRatio: null,
      netWorthUp: null,
      habitRate30: null,
      workoutMinutes7d: null,
      studyMinutes7d: 90,
      journalEntries30d: null,
      moodScore: null,
      skinStreak: null,
      goalJournalMinutes7d: 45,
    })
    expect(both.growth.score).toBe(53)
    expect(both.growth.components.find((c) => c.label === 'Goal effort')?.score).toBe(30)
    // absent (never journaled a milestone) → skipped, growth = study alone
    const onlyStudy = computeLifeScore({
      savingsRatePct: null,
      budgetOnTrackRatio: null,
      netWorthUp: null,
      habitRate30: null,
      workoutMinutes7d: null,
      studyMinutes7d: 90,
      journalEntries30d: null,
      moodScore: null,
      skinStreak: null,
    })
    expect(onlyStudy.growth.score).toBe(75)
  })
})

describe('Phase F components (task 20)', () => {
  it('reading: 105 min/week target, clamped', () => {
    expect(READING_WEEKLY_TARGET_MIN).toBe(105)
    expect(readingScore(105)).toBe(100)
    expect(readingScore(52.5)).toBe(50)
    expect(readingScore(0)).toBe(0) // used but idle → honest 0
    expect(readingScore(null)).toBeNull()
  })

  it('skills: 150 min/week target (matches goal effort)', () => {
    expect(SKILL_WEEKLY_TARGET_MIN).toBe(150)
    expect(skillScore(75)).toBe(50)
    expect(skillScore(150)).toBe(100)
    expect(skillScore(999)).toBe(100)
    expect(skillScore(null)).toBeNull()
  })

  it('content: 4 completions/month target', () => {
    expect(CONTENT_MONTHLY_TARGET).toBe(4)
    expect(contentScore(4)).toBe(100)
    expect(contentScore(1)).toBe(25)
    expect(contentScore(9)).toBe(100)
    expect(contentScore(null)).toBeNull()
  })

  it('ratio components: straight percentage, clamped, null passes', () => {
    expect(ideaScore(0.5)).toBe(50)
    expect(ideaScore(1)).toBe(100)
    expect(ideaScore(null)).toBeNull()
    expect(peopleScore(0.75)).toBe(75)
    expect(peopleScore(0)).toBe(0)
    expect(peopleScore(null)).toBeNull()
    expect(mealScore(0.4286)).toBeCloseTo(42.86, 2)
    expect(mealScore(null)).toBeNull()
  })

  it('new growth components join the mean only when present', () => {
    // study 90 → 75, reading 105 → 100: growth = (75 + 100) / 2 = 87.5 → 88
    const both = computeLifeScore({
      savingsRatePct: null,
      budgetOnTrackRatio: null,
      netWorthUp: null,
      habitRate30: null,
      workoutMinutes7d: null,
      studyMinutes7d: 90,
      journalEntries30d: null,
      moodScore: null,
      skinStreak: null,
      readingMinutes7d: 105,
    })
    expect(both.growth.score).toBe(88)
    expect(both.growth.components.find((c) => c.label === 'Reading')?.score).toBe(100)
  })

  it('reflection picks up people + meals without breaking old payloads', () => {
    // journal 20 → 100, people 0.5 → 50: reflection = (100 + 50) / 2 = 75
    const withPeople = computeLifeScore({
      savingsRatePct: null,
      budgetOnTrackRatio: null,
      netWorthUp: null,
      habitRate30: null,
      workoutMinutes7d: null,
      studyMinutes7d: null,
      journalEntries30d: 20,
      moodScore: null,
      skinStreak: null,
      peopleOkRatio: 0.5,
    })
    expect(withPeople.reflection.score).toBe(75)
    expect(withPeople.reflection.components.find((c) => c.label === 'People in rhythm')?.score).toBe(50)
    // meals join too: (100 + 50 + 100) / 3 = 83.33 → 83
    const withMeals = computeLifeScore({
      savingsRatePct: null,
      budgetOnTrackRatio: null,
      netWorthUp: null,
      habitRate30: null,
      workoutMinutes7d: null,
      studyMinutes7d: null,
      journalEntries30d: 20,
      moodScore: null,
      skinStreak: null,
      peopleOkRatio: 0.5,
      mealProteinHit7: 1,
    })
    expect(withMeals.reflection.score).toBe(83)
  })

  it('a fully-unused account still scores null overall (no fake zeros)', () => {
    const empty = computeLifeScore({
      savingsRatePct: null,
      budgetOnTrackRatio: null,
      netWorthUp: null,
      habitRate30: null,
      workoutMinutes7d: null,
      studyMinutes7d: null,
      journalEntries30d: null,
      moodScore: null,
      skinStreak: null,
      readingMinutes7d: null,
      skillMinutes7d: null,
      contentDone30: null,
      ideaNextStepRatio: null,
      peopleOkRatio: null,
      mealProteinHit7: null,
    })
    expect(empty.overall).toBeNull()
    expect(empty.growth.score).toBeNull()
    expect(empty.reflection.score).toBeNull()
  })
})

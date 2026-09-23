// Dincharya (दिनचर्या) — the classical Ayurvedic daily-rhythm routine,
// adapted to a modern productive day. One-tap preset for the routine builder
// (Phase 15).
//
// Invariants enforced by tests (and by the routine service on import):
//  - at most 20 steps, every title 1..80 chars, minutes null or 0..240.
// Timed minutes are gentle targets — play mode counts up and records real
// time either way. Untimed steps (null) simply sequence the day.

export interface DincharyaStep {
  title: string
  minutes: number | null
}

export const DINCHARYA = {
  name: 'Dincharya — daily rhythm',
  emoji: '🌅',
  steps: [
    { title: 'Wake before sunrise — no snooze, no phone', minutes: null },
    { title: 'Tongue scrape + oil pull', minutes: 5 },
    { title: 'Warm water, hydrate', minutes: 5 },
    { title: 'Move: yoga / walk / workout', minutes: 45 },
    { title: 'Bath + get ready', minutes: 20 },
    { title: 'Deep work block 1 — hardest thing first', minutes: 120 },
    { title: 'Lunch at midday — biggest meal, eat calm', minutes: 30 },
    { title: 'Slow 100-step walk after eating', minutes: 10 },
    { title: 'Deep work block 2', minutes: 120 },
    { title: 'Sunset wind-down — walk / stretch / family', minutes: 20 },
    { title: 'Light dinner, early', minutes: 30 },
    { title: 'Screens off — read or journal instead', minutes: 30 },
    { title: 'In bed by 22:30', minutes: null },
  ] as DincharyaStep[],
} as const

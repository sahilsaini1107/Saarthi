// Rest-timer defaults (Phase 14). The coach's guidance: 2–3 min on compounds,
// 60–120 s on isolation. A plan exercise that declares restSeconds always
// wins; otherwise equipment class picks a sensible default inside those bands.
// Pure — nothing here reads the clock.

export const REST_MIN_S = 10
export const REST_MAX_S = 600

/**
 * Default rest for a set, seconds:
 *  - plan-declared restSeconds (clamped 10–600) when present
 *  - timed holds (plank etc.) → 60 s
 *  - barbell compounds → 150 s (middle of the 2–3 min band)
 *  - machines → 120 s · cables → 105 s (stack walks are part of the rest)
 *  - dumbbells → 90 s (middle of the 60–120 s band)
 *  - bodyweight → 75 s · anything else → 90 s
 */
export function defaultRestSeconds(input: { restSeconds?: number | null; equipment?: string | null; timed?: boolean }): number {
  const declared = input.restSeconds
  if (declared != null && Number.isFinite(declared)) {
    return Math.min(REST_MAX_S, Math.max(REST_MIN_S, Math.round(declared)))
  }
  if (input.timed) return 60
  switch (input.equipment) {
    case 'barbell':
      return 150
    case 'machine':
      return 120
    case 'cable':
      return 105
    case 'dumbbell':
      return 90
    case 'bodyweight':
      return 75
    default:
      return 90
  }
}

/** mm:ss for the timer face. */
export function formatRest(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Sliding-window rate limiter (Phase 7 security hardening). In-memory,
// per-instance — the right trade-off for a single-user personal app on one
// server process (Decision #37). Pure core with an injectable clock so the
// window boundaries are unit-tested.

export interface RateLimitConfig {
  /** max requests allowed inside the window */
  limit: number
  /** window length in ms */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  /** 1..limit — how many calls remain in the current window */
  remaining: number
  /** ms until the oldest in-window call falls out (only when blocked) */
  retryAfterMs: number
}

/** Store shape: key → timestamps of calls inside the current window. */
export type RateLimitStore = Map<string, number[]>

export function createStore(): RateLimitStore {
  return new Map()
}

/**
 * Record a call for `key` at `now` and decide whether it's allowed.
 * Calls older than the window are pruned lazily per key.
 */
export function checkRateLimit(store: RateLimitStore, config: RateLimitConfig, key: string, now: number): RateLimitResult {
  const nowMs = Math.floor(now)
  const windowStart = nowMs - config.windowMs
  const hits = (store.get(key) ?? []).filter((t) => t > windowStart)

  if (hits.length >= config.limit) {
    const oldest = hits[0]
    store.set(key, hits)
    return { allowed: false, remaining: 0, retryAfterMs: oldest + config.windowMs - nowMs }
  }

  hits.push(nowMs)
  store.set(key, hits)
  return { allowed: true, remaining: config.limit - hits.length, retryAfterMs: 0 }
}

/** Drop every entry that has fully aged out of its window — call periodically. */
export function pruneStore(store: RateLimitStore, config: RateLimitConfig, now: number): void {
  const windowStart = now - config.windowMs
  for (const [key, hits] of store) {
    const fresh = hits.filter((t) => t > windowStart)
    if (fresh.length === 0) store.delete(key)
    else store.set(key, fresh)
  }
}

/** Reset one key (tests, admin). */
export function resetKey(store: RateLimitStore, key: string): void {
  store.delete(key)
}

/* ---------- shared limiter instances (per server process) ---------- */

/** Auth endpoints (login/register): 10 attempts per 15 min per IP. */
export const AUTH_RATE_LIMIT: RateLimitConfig = { limit: 10, windowMs: 15 * 60 * 1000 }
/** AI capture endpoints (LLM/ASR/vision are expensive): 30 per minute per user. */
export const CAPTURE_RATE_LIMIT: RateLimitConfig = { limit: 30, windowMs: 60 * 1000 }
/** Vault setup/reset (irreversible + PBKDF2 cost): 20 per 15 min per user+IP. */
export const VAULT_RATE_LIMIT: RateLimitConfig = { limit: 20, windowMs: 15 * 60 * 1000 }

const authStore = createStore()
const captureStore = createStore()
const vaultStore = createStore()

export function checkAuthRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  return checkRateLimit(authStore, AUTH_RATE_LIMIT, key, now)
}

export function checkCaptureRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  return checkRateLimit(captureStore, CAPTURE_RATE_LIMIT, key, now)
}

export function checkVaultRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  return checkRateLimit(vaultStore, VAULT_RATE_LIMIT, key, now)
}

// prune every 10 minutes so long-running processes don't grow the map
let lastPrune = 0
export function pruneRateLimitStores(now: number = Date.now()): void {
  if (now - lastPrune < 10 * 60 * 1000) return
  lastPrune = now
  pruneStore(authStore, AUTH_RATE_LIMIT, now)
  pruneStore(captureStore, CAPTURE_RATE_LIMIT, now)
  pruneStore(vaultStore, VAULT_RATE_LIMIT, now)
}

/**
 * Best-effort client IP for rate-limit keying: the preview proxy forwards
 * x-forwarded-for; fall back to a shared bucket when absent.
 */
export function clientIpFromRequest(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

import { describe, expect, it } from 'vitest'
import {
  AUTH_RATE_LIMIT,
  checkRateLimit,
  clientIpFromRequest,
  createStore,
  pruneStore,
  resetKey,
} from '@/lib/rate-limit'

describe('sliding window rate limiter', () => {
  it('allows up to the limit, then blocks within the same window', () => {
    const store = createStore()
    const cfg = { limit: 3, windowMs: 60_000 }
    expect(checkRateLimit(store, cfg, 'ip1', 1000).allowed).toBe(true)
    expect(checkRateLimit(store, cfg, 'ip1', 2000).allowed).toBe(true)
    expect(checkRateLimit(store, cfg, 'ip1', 3000).allowed).toBe(true)
    const blocked = checkRateLimit(store, cfg, 'ip1', 3500)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    // the OLDEST call (t=1000) expires at 61_000
    expect(blocked.retryAfterMs).toBe(61_000 - 3_500)
  })

  it('keys are isolated', () => {
    const store = createStore()
    const cfg = { limit: 1, windowMs: 60_000 }
    expect(checkRateLimit(store, cfg, 'a', 1000).allowed).toBe(true)
    expect(checkRateLimit(store, cfg, 'b', 1001).allowed).toBe(true)
    expect(checkRateLimit(store, cfg, 'a', 1002).allowed).toBe(false)
  })

  it('frees the slot exactly when the oldest call leaves the window', () => {
    const store = createStore()
    const cfg = { limit: 1, windowMs: 10_000 }
    checkRateLimit(store, cfg, 'k', 5_000)
    // 14_999: the 5s call is still inside (window = (4_999, 14_999])
    expect(checkRateLimit(store, cfg, 'k', 14_999).allowed).toBe(false)
    // 15_000: the 5s call fell out
    const again = checkRateLimit(store, cfg, 'k', 15_000)
    expect(again.allowed).toBe(true)
    expect(again.remaining).toBe(cfg.limit - 1)
  })

  it('sliding window counts only in-window calls (not fixed buckets)', () => {
    const store = createStore()
    const cfg = { limit: 2, windowMs: 10_000 }
    checkRateLimit(store, cfg, 'k', 0)
    checkRateLimit(store, cfg, 'k', 9_000)
    // at 19_000: t=0 fell out, t=9_000 expires exactly now (also out) → clean slate
    const r = checkRateLimit(store, cfg, 'k', 19_000)
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(1) // only the call we just made
    // one more fills the window, then it blocks
    expect(checkRateLimit(store, cfg, 'k', 19_100).allowed).toBe(true)
    expect(checkRateLimit(store, cfg, 'k', 19_200).allowed).toBe(false)
  })

  it('retryAfterMs points at when the oldest call expires', () => {
    const store = createStore()
    const cfg = { limit: 2, windowMs: 60_000 }
    checkRateLimit(store, cfg, 'k', 10_000)
    checkRateLimit(store, cfg, 'k', 20_000)
    const blocked = checkRateLimit(store, cfg, 'k', 25_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(70_000 - 25_000)
  })

  it('resetKey clears one caller', () => {
    const store = createStore()
    const cfg = { limit: 1, windowMs: 60_000 }
    checkRateLimit(store, cfg, 'k', 1000)
    expect(checkRateLimit(store, cfg, 'k', 1001).allowed).toBe(false)
    resetKey(store, 'k')
    expect(checkRateLimit(store, cfg, 'k', 1002).allowed).toBe(true)
  })

  it('pruneStore drops aged keys entirely', () => {
    const store = createStore()
    const cfg = { limit: 1, windowMs: 1_000 }
    checkRateLimit(store, cfg, 'gone', 1000)
    pruneStore(store, cfg, 5_000)
    expect(store.has('gone')).toBe(false)
  })

  it('auth config is tight (10 per 15 min)', () => {
    expect(AUTH_RATE_LIMIT.limit).toBe(10)
    expect(AUTH_RATE_LIMIT.windowMs).toBe(900_000)
  })
})

describe('clientIpFromRequest', () => {
  it('takes the first x-forwarded-for entry', () => {
    const req = new Request('https://x.test', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })
    expect(clientIpFromRequest(req)).toBe('1.2.3.4')
  })
  it('falls back to x-real-ip then the shared bucket', () => {
    const req = new Request('https://x.test', { headers: { 'x-real-ip': '9.9.9.9' } })
    expect(clientIpFromRequest(req)).toBe('9.9.9.9')
    expect(clientIpFromRequest(new Request('https://x.test'))).toBe('unknown')
  })
})

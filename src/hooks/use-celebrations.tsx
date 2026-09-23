'use client'

// Celebrations (Phase 7 gamification): watches the gamification profile and
// detects NEW badges / level-ups vs the last-seen state in localStorage.
// New badges fire a CSS confetti burst + toast. Fully derived — the profile
// is recomputed from activity, so "new" simply means "not seen before".
//
// Implementation note: the celebration lives in a tiny external store so the
// detection effect never calls setState directly (react-hooks/set-state-in-
// effect); ConfettiBurst subscribes via useSyncExternalStore instead.

import { useEffect, useSyncExternalStore, useRef } from 'react'
import { useGamification } from '@/hooks/queries'
import { toast } from 'sonner'

const SEEN_KEY = 'saarthi.seenBadges.v1'
const LEVEL_KEY = 'saarthi.seenLevel.v1'

export interface Celebration {
  emoji: string
  title: string
  /** monotonic id so identical back-to-back celebrations still re-render */
  id: number
}

/* ---------- external store ---------- */

let current: Celebration | null = null
let clearTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function fire(c: Omit<Celebration, 'id'>, holdMs = 3200) {
  current = { ...c, id: Date.now() + Math.random() }
  emit()
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    current = null
    emit()
  }, holdMs)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/* ---------- detection ---------- */

function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

function saveSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids))
  } catch {
    // storage blocked — badges would re-celebrate per session; harmless
  }
}

export function useCelebrations() {
  const gamification = useGamification()
  const baselineDone = useRef(false)

  useEffect(() => {
    const data = gamification.data
    if (!data) return

    // first load ever: baseline without fanfare (no confetti on sign-in)
    if (!baselineDone.current) {
      baselineDone.current = true
      if (localStorage.getItem(SEEN_KEY) == null) {
        saveSeen(data.badges.filter((b) => b.earned).map((b) => b.id))
        localStorage.setItem(LEVEL_KEY, String(data.level.level))
        return
      }
    }

    const seen = new Set(loadSeen())
    const newBadges = data.badges.filter((b) => b.earned && !seen.has(b.id))
    const prevLevel = Number(localStorage.getItem(LEVEL_KEY) ?? data.level.level)
    const leveledUp = data.level.level > prevLevel

    if (newBadges.length > 0 || leveledUp) {
      const first = newBadges[0]
      const emoji = leveledUp ? data.level.emoji : first?.emoji ?? '🎉'
      const title = leveledUp
        ? `Level ${data.level.level} — ${data.level.title}!`
        : newBadges.length === 1
          ? `Badge unlocked: ${first.title}`
          : `${newBadges.length} new badges unlocked!`
      saveSeen(data.badges.filter((b) => b.earned).map((b) => b.id))
      localStorage.setItem(LEVEL_KEY, String(data.level.level))
      fire({ emoji, title })
      toast.success(`${emoji} ${title}`, {
        description: newBadges.length > 1 ? newBadges.map((b) => b.title).join(' · ') : leveledUp ? 'Keep the streak going 🚀' : first?.description,
      })
    }
  }, [gamification.data])

  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  )
}

/* ---------- presentation ---------- */

/** Fixed-position confetti burst — pure CSS, no dependencies. */
export function ConfettiBurst({ celebration }: { celebration: Celebration | null }) {
  const pieces = useRef(
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 1.8 + Math.random() * 1.2,
      color: ['#0D9488', '#F59E0B', '#8B5CF6', '#10B981', '#EF4444'][i % 5],
      size: 6 + Math.random() * 6,
    })),
  )

  if (!celebration) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" role="status" aria-label={celebration.title}>
      {pieces.current.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-20px] animate-[saarthi-confetti-fall_2.4s_ease-in_forwards]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            borderRadius: 2,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
      <div className="absolute left-1/2 top-24 -translate-x-1/2 animate-[saarthi-pop_0.5s_ease-out]">
        <div className="flex flex-col items-center gap-1 rounded-2xl border bg-card/95 px-6 py-4 shadow-xl backdrop-blur">
          <span className="text-4xl" aria-hidden>{celebration.emoji}</span>
          <p className="text-sm font-bold">{celebration.title}</p>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes saarthi-confetti-fall {
          0% { transform: translateY(-4vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(540deg); opacity: 0.9; }
        }
        @keyframes saarthi-pop {
          0% { transform: translate(-50%, 12px) scale(0.8); opacity: 0; }
          60% { transform: translate(-50%, -4px) scale(1.04); opacity: 1; }
          100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }
      ` }} />
    </div>
  )
}

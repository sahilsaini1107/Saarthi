'use client'

import { Activity, Dumbbell, HeartPulse, Sparkles, Utensils } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { cn } from '@/lib/utils'

const ITEMS = [
  { id: 'coach', label: 'Coach', path: '/growth/health', icon: HeartPulse },
  { id: 'fitness', label: 'Fitness', path: '/growth/fitness', icon: Dumbbell },
  { id: 'food', label: 'Food', path: '/growth/fitness/food', icon: Utensils },
  { id: 'body', label: 'Body', path: '/growth/body', icon: Activity },
  { id: 'skin', label: 'Skin', path: '/growth/skin', icon: Sparkles },
] as const

export type HealthArea = (typeof ITEMS)[number]['id']

/** Persistent wayfinding across the four closely-related health modules. */
export function HealthNav({ active }: { active: HealthArea }) {
  const { navigate } = useUi()

  return (
    <nav
      aria-label="Health sections"
      className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border bg-muted/40 p-1"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon
        const selected = active === item.id
        return (
          <button
            key={item.id}
            type="button"
            aria-current={selected ? 'page' : undefined}
            onClick={() => !selected && navigate(item.path)}
            className={cn(
              'flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition-colors sm:flex-row sm:text-xs',
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
            )}
          >
            <Icon className={cn('size-4', selected && 'text-primary')} />
            <span className="truncate">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

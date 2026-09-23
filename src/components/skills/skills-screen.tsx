'use client'

// Skills (Phase 17) — a deliberate-practice tracker. XP = minutes, levels on
// a fixed curve, streaks with a grace rule, and an ETA to your target level.

import { useState } from 'react'
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorCard, ProgressBar, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { SkillFormSheet } from '@/components/skills/skill-form-sheet'
import { PracticeSheet } from '@/components/skills/practice-sheet'
import { useDeletePractice, useSkills, useUpdateSkill } from '@/hooks/queries'
import { todayISO } from '@/lib/date'
import { MAX_LEVEL, levelProgress, xpForLevel } from '@/lib/skills'
import { cn } from '@/lib/utils'
import type { SkillWithStats } from '@/lib/types'

const STARTERS = [
  { name: 'Public speaking', category: 'communication' },
  { name: 'System design', category: 'technical' },
  { name: 'Writing', category: 'creative' },
  { name: 'Negotiation', category: 'professional' },
]

export function SkillsScreen() {
  const { user } = useUi()
  const today = todayISO(user.timezone)
  const skills = useSkills()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SkillWithStats | 'new' | null>(null)
  const [prefill, setPrefill] = useState<{ name: string; category: string } | undefined>(undefined)
  const [practiceTarget, setPracticeTarget] = useState<SkillWithStats | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  if (skills.isLoading) return <SkeletonRow />
  if (skills.isError) return <ErrorCard message={(skills.error as Error).message} onRetry={() => skills.refetch()} />

  const list = skills.data ?? []
  const active = list.filter((s) => s.status === 'active')
  const paused = list.filter((s) => s.status === 'paused')
  const archived = list.filter((s) => s.status === 'archived')
  const practicedToday = active.filter((s) => s.minutesToday > 0).length
  const minutes7d = active.reduce((sum, s) => sum + s.minutes7d, 0)
  const bestStreak = active.reduce((m, s) => Math.max(m, s.streak), 0)
  const totalXp = list.reduce((sum, s) => sum + s.xp, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skills</h1>
          <p className="text-sm text-muted-foreground">Deliberate practice, compounding. 1 minute = 1 XP.</p>
        </div>
        <Button
          size="sm"
          className="h-9 rounded-full"
          onClick={() => {
            setEditing('new')
            setPrefill(undefined)
            setFormOpen(true)
          }}
        >
          <Plus className="mr-1 size-4" /> New
        </Button>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border bg-card p-3 text-center">
            <p className="text-lg font-bold tabular-nums">
              {practicedToday}/{active.length}
            </p>
            <p className="text-[10px] text-muted-foreground">practiced today</p>
          </div>
          <div className="rounded-2xl border bg-card p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{minutes7d}m</p>
            <p className="text-[10px] text-muted-foreground">this week</p>
          </div>
          <div className="rounded-2xl border bg-card p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{bestStreak > 0 ? `🔥${bestStreak}` : '—'}</p>
            <p className="text-[10px] text-muted-foreground">best streak</p>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          emoji="⚡"
          title="No skills yet"
          body="Pick what you're becoming good at. Log practice sittings, watch XP stack into levels, and let the streak do its thing. Tap a suggestion to start:"
          action={
            <div className="mt-3 flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => {
                    setEditing('new')
                    setPrefill(s)
                    setFormOpen(true)
                  }}
                  className="rounded-xl border bg-card px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent"
                >
                  + {s.name}
                </button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="mt-1 self-center rounded-full"
                onClick={() => {
                  setEditing('new')
                  setPrefill(undefined)
                  setFormOpen(true)
                }}
              >
                <Sparkles className="mr-1 size-4" /> Name my own
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          <SectionHeader title="Practice" />
          {[...active, ...paused].map((s) => (
            <SkillRow
              key={s.id}
              skill={s}
              today={today}
              expanded={expanded === s.id}
              onToggleExpand={() => setExpanded(expanded === s.id ? null : s.id)}
              onLog={() => setPracticeTarget(s)}
              onEdit={() => {
                setEditing(s)
                setPrefill(undefined)
                setFormOpen(true)
              }}
            />
          ))}

          {archived.length > 0 && (
            <>
              <SectionHeader title="Archived" />
              {archived.map((s) => (
                <ArchivedRow key={s.id} skill={s} />
              ))}
            </>
          )}

          {list.length > 0 && (
            <p className="pt-1 text-center text-xs text-muted-foreground">
              {totalXp.toLocaleString('en-IN')} XP lifetime — that&apos;s {Math.round(totalXp / 60)}h of deliberate practice
            </p>
          )}
        </div>
      )}

      <SkillFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        skill={editing && editing !== 'new' ? editing : null}
        prefill={editing === 'new' ? prefill : undefined}
      />
      <PracticeSheet skill={practiceTarget} today={today} onOpenChange={(o) => !o && setPracticeTarget(null)} />
    </div>
  )
}

/* ---------- row ---------- */

function SkillRow({
  skill,
  today,
  expanded,
  onToggleExpand,
  onLog,
  onEdit,
}: {
  skill: SkillWithStats
  today: string
  expanded: boolean
  onToggleExpand: () => void
  onLog: () => void
  onEdit: () => void
}) {
  const delPractice = useDeletePractice({ success: 'Log removed' })
  const lp = skill.levelProgress
  const isPaused = skill.status === 'paused'

  return (
    <div className={cn('rounded-2xl border bg-card', isPaused && 'opacity-70')}>
      <div className="flex items-center gap-2 p-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggleExpand} aria-expanded={expanded}>
          <p className="truncate text-sm font-semibold">
            {skill.name}
            {skill.streak > 0 && <span className="ml-1.5 whitespace-nowrap text-xs font-medium text-warn">🔥 {skill.streak}</span>}
            {isPaused && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">PAUSED</span>}
            {skill.targetReached && <span className="ml-1.5 rounded-full bg-income/15 px-1.5 py-0.5 text-[9px] font-bold text-income">TARGET ✓</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {skill.categoryEmoji} {skill.categoryLabel} · Lvl {skill.level}
            {skill.minutesToday > 0 && ` · ${skill.minutesToday}m today`}
            {skill.etaLabel && skill.minutesToday === 0 && ` · ${skill.etaLabel.toLowerCase()}`}
          </p>
        </button>
        <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold" onClick={onLog}>
          Log
        </Button>
        <button
          type="button"
          aria-label={`Edit ${skill.name}`}
          onClick={onEdit}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      <div className="px-3 pb-3">
        <ProgressBar value={lp.pct} tone={skill.targetReached ? 'income' : 'primary'} className="h-1.5" />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>
            {lp.isMax ? `MAX · ${skill.xp.toLocaleString('en-IN')} XP` : `${lp.into}/${lp.span} XP → Lvl ${lp.level + 1}`}
          </span>
          <span>{skill.etaDays === 0 ? 'target reached' : skill.etaDays != null ? `~${skill.etaDays}d to target` : ''}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3.5 py-3">
          <DayStrip days={skill.recent} today={today} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted p-2">
              <p className="text-sm font-bold tabular-nums">{skill.xp.toLocaleString('en-IN')}</p>
              <p className="text-[10px] text-muted-foreground">total XP</p>
            </div>
            <div className="rounded-xl bg-muted p-2">
              <p className="text-sm font-bold tabular-nums">{skill.minutes30d}m</p>
              <p className="text-[10px] text-muted-foreground">last 30 days</p>
            </div>
            <div className="rounded-xl bg-muted p-2">
              <p className="truncate text-sm font-bold tabular-nums">{skill.lastPracticed ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground">last practiced</p>
            </div>
          </div>

          {skill.notes && <p className="mt-3 rounded-xl bg-muted p-2.5 text-xs text-muted-foreground">“{skill.notes}”</p>}

          {skill.logs.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Recent sittings</p>
              {skill.logs.map((log) => (
                <div key={log.id} className="flex items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-2">
                  <span className="text-xs font-semibold tabular-nums text-income">+{log.minutes} XP</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">{log.note ?? <span className="text-muted-foreground">—</span>}</p>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{log.date}</span>
                  <button
                    type="button"
                    aria-label="Delete log"
                    onClick={() => delPractice.mutate({ skillId: skill.id, logId: log.id })}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-expense"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[10px] text-muted-foreground">
            Level {Math.min(MAX_LEVEL, skill.level + 1)} starts at {xpForLevel(skill.level + 1).toLocaleString('en-IN')} XP
            {skill.targetLevel <= skill.level ? ' — target reached 🎉' : ` · target: level ${skill.targetLevel}`}
          </p>
        </div>
      )}
    </div>
  )
}

function ArchivedRow({ skill }: { skill: SkillWithStats }) {
  const update = useUpdateSkill({ success: 'Skill restored' })
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 opacity-60">
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">ARCHIVED</span>
      <p className="min-w-0 flex-1 truncate text-sm">{skill.name}</p>
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => update.mutate({ id: skill.id, status: 'active' })}>
        Restore
      </Button>
    </div>
  )
}

/* ---------- 14-day practice strip ---------- */

function DayStrip({ days, today }: { days: SkillWithStats['recent']; today: string }) {
  const max = Math.max(1, ...days.map((d) => d.minutes))
  return (
    <div className="flex justify-between gap-1" aria-label="Last 14 days of practice">
      {days.map((d) => {
        const intensity = d.minutes === 0 ? 0 : Math.max(0.35, d.minutes / max)
        return (
          <div
            key={d.iso}
            title={`${d.iso}${d.minutes ? `: ${d.minutes}m` : ': no practice'}`}
            aria-label={`${d.iso}${d.minutes ? `: ${d.minutes}m` : ': no practice'}`}
            className={cn('h-6 flex-1 rounded-md border', d.minutes === 0 && 'bg-muted')}
            style={d.minutes > 0 ? { backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(intensity * 100)}%, transparent)` } : undefined}
          />
        )
      })}
      <span className="sr-only">today: {today}</span>
    </div>
  )
}

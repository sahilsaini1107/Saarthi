'use client'

// Settings: profile, gamification (level + badges), preferences, reminders,
// security (sessions), data export, theme, about. (Phase 7 expanded)

import { useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import { useAuthSessions, useGamification, useLogout, useRevokeOtherSessions, useRevokeSession, useUpdateUser } from '@/hooks/queries'
import { Field, ProgressBar, SectionHeader } from '@/components/ui/saarthi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTheme } from 'next-themes'
import { Bell, BellOff, Download, KeyRound, LogOut, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { DEFAULT_TIMEZONE } from '@/lib/constants'
import { getJournalNudge, setJournalNudge, useReminders } from '@/hooks/use-reminders'
import { useOnlineStatus } from '@/hooks/use-offline-queue'
import { cn } from '@/lib/utils'

export function SettingsScreen({ user }: { user: import('@/lib/types').UserDTO }) {
  const logout = useLogout()
  const update = useUpdateUser({ success: 'Settings saved' })
  const { theme, setTheme } = useTheme()
  const [timezone, setTimezone] = useState(user.timezone)
  const [dirty, setDirty] = useState(false)
  const online = useOnlineStatus()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 text-2xl font-bold tracking-tight">Settings</h1>

      {/* profile + gamification */}
      <ProfileCard name={user.name} email={user.email} />

      <SectionHeader title="Preferences" />
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <Field label="Currency" hint="INR is the home currency.">
          <Input value={`${user.currency} (₹)`} disabled />
        </Field>
        <Field label="Timezone" hint="All dates, streaks and reminders use this.">
          <Input
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value)
              setDirty(true)
            }}
            placeholder={DEFAULT_TIMEZONE}
          />
        </Field>
        {dirty && (
          <Button size="sm" className="rounded-full self-start" onClick={() => update.mutate({ timezone }, { onSuccess: () => setDirty(false) })} disabled={update.isPending}>
            Save timezone
          </Button>
        )}
      </section>

      <SectionHeader title="Reminders" />
      <NotificationsSection />

      <SectionHeader title="Security" />
      <SecuritySection />

      <SectionHeader title="Your data" />
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Export everything</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One JSON file with every account, transaction, habit, journal entry and more. Yours to keep.
          </p>
        </div>
        <Button
          variant="outline"
          className="self-start rounded-full"
          disabled={!online}
          onClick={async () => {
            try {
              const { apiRaw } = await import('@/lib/client')
              const blob = await apiRaw('/api/export')
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `saarthi-export-${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              URL.revokeObjectURL(url)
              toast.success('Export downloaded')
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Export failed')
            }
          }}
        >
          <Download className="size-4" /> Export my data
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {online ? 'No bank aggregation, ever — what you export is exactly what you entered.' : 'Back online to export.'}
        </p>
      </section>

      <SectionHeader title="Appearance" />
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            <p className="text-sm font-medium">Theme</p>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`h-8 rounded-lg px-3 text-xs font-semibold capitalize ${theme === t ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      <SectionHeader title="Design system" />
      <p className="px-1 text-xs text-muted-foreground">
        Every component, in both themes, on one page.
      </p>
      <Button variant="outline" className="rounded-full" onClick={() => (window.location.hash = '/styleguide')}>
        Open styleguide gallery →
      </Button>

      <SectionHeader title="About" />
      <section className="rounded-2xl border bg-card p-4 text-sm">
        <p className="font-semibold">Saarthi · Personal Life OS</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Phase 7 of 7 complete — money core, investments & net worth, habits & journal, goals · study · body · skin,
          intelligence (budgets · travel · Life Score · insights), AI capture, gamification & security hardening.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">No bank aggregation. Your data stays scoped to your account on every query.</p>
      </section>

      <Button variant="outline" className="rounded-xl text-expense" disabled={logout.isPending} onClick={() => logout.mutate()}>
        <LogOut className="size-4" /> {logout.isPending ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  )
}

/* ---------- profile + gamification (Phase 7) ---------- */

function ProfileCard({ name, email }: { name: string; email: string }) {
  const gamification = useGamification()

  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">{name.slice(0, 1).toUpperCase()}</span>
        <div>
          <p className="font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">{email}</p>
        </div>
      </div>

      {gamification.data && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-warn/10 text-xl" aria-hidden>
              {gamification.data.level.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  Level {gamification.data.level.level} · {gamification.data.level.title}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {gamification.data.xp} XP
                </p>
              </div>
              <ProgressBar value={gamification.data.level.pct} tone="warn" className="mt-1.5 h-1.5" />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {gamification.data.level.xpForNext - gamification.data.level.xpIntoLevel} XP to next level · {gamification.data.earnedCount}/{gamification.data.totalCount} badges
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-2">
            {gamification.data.badges.map((b) => (
              <div
                key={b.id}
                title={`${b.title} — ${b.description}${b.earned ? '' : ' (locked)'}`}
                className={cn(
                  'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border text-center',
                  b.earned ? 'border-warn/40 bg-warn/5' : 'border-dashed bg-muted/30 opacity-45',
                )}
              >
                <span className="text-lg leading-none" aria-hidden>{b.earned ? b.emoji : '🔒'}</span>
                <span className="w-full truncate px-0.5 text-[8px] font-medium leading-tight text-muted-foreground">{b.title}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Tap a badge to see how to earn it.</p>
        </>
      )}
    </section>
  )
}

/* ---------- security: sessions (Phase 7) ---------- */

function SecuritySection() {
  const sessions = useAuthSessions()
  const revoke = useRevokeSession({ success: 'Device signed out' })
  const revokeOthers = useRevokeOtherSessions({ success: 'Signed out {n} other device(s)' })
  const others = (sessions.data ?? []).filter((s) => !s.current)

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <p className="text-sm font-medium">Active devices</p>
        </div>
        {others.length > 0 && (
          <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" disabled={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
            Sign out others ({others.length})
          </Button>
        )}
      </div>
      {sessions.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading sessions…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {(sessions.data ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2">
              <div>
                <p className="text-xs font-semibold">
                  {s.current ? 'This device' : `Signed in ${new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                  {s.current && <span className="ml-1.5 rounded-full bg-income/10 px-1.5 py-0.5 text-[9px] font-bold text-income">CURRENT</span>}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Expires {new Date(s.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              {!s.current && (
                <Button size="sm" variant="ghost" className="h-7 rounded-full px-2.5 text-[11px] text-expense" disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>
                  Revoke
                </Button>
              )}
            </div>
          ))}
          {(sessions.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">No other sessions.</p>}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Sessions expire after 30 days. Signing out of a device immediately invalidates its token there.
      </p>
    </section>
  )
}

/* ---------- notifications (Phase 2, task 2.5) ---------- */

function NotificationsSection() {
  const { permission, enable } = useReminders()
  const [nudge, setNudge] = useState(getJournalNudge() ?? '')

  const granted = permission === 'granted'
  const unsupported = permission === 'unsupported'

  const statusText = unsupported
    ? 'This browser does not support notifications.'
    : granted
      ? 'On — habit, routine and journal nudges will fire on this device.'
      : permission === 'denied'
        ? 'Blocked in browser settings. Allow notifications for this site to enable nudges.'
        : 'Off — turn on to get gentle local nudges for habits, routines and journaling.'

  async function onEnable() {
    const result = await enable()
    if (result === 'granted') {
      toast.success('Reminders on')
      try {
        new Notification('🔔 Saarthi reminders are live', { body: 'You\u2019ll get nudges at the times you set.' })
      } catch {
        // permission granted but construction blocked — no-op
      }
    } else if (result === 'denied') {
      toast.error('Notifications blocked — enable them in browser settings')
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {granted ? <Bell className="size-4 text-income" /> : <BellOff className="size-4 text-muted-foreground" />}
          <p className="text-sm font-medium">Local notifications</p>
        </div>
        {!granted && !unsupported && (
          <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={onEnable}>
            Enable
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{statusText}</p>
      {granted && (
        <Field
          label="Journal nudge"
          hint="Daily reminder to write — fires only if today has no entry yet."
        >
          <Input
            type="time"
            value={nudge}
            onChange={(e) => {
              setNudge(e.target.value)
              setJournalNudge(e.target.value || null)
              toast.success(e.target.value ? 'Journal nudge set' : 'Journal nudge cleared')
            }}
            className="h-11 rounded-xl"
          />
        </Field>
      )}
      <p className="text-[11px] text-muted-foreground">
        Habit and routine reminder times live on each habit/routine (Growth tab). Reminders work while Saarthi is open in a tab.
      </p>
    </section>
  )
}

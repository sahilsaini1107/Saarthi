'use client'

// Styleguide gallery (task 0.3 AC): every primitive, light + dark.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Chip, EmptyState, Money, ProgressBar, SectionHeader, StatTile, utilizationTone } from '@/components/ui/saarthi'
import { AmountPad, formatAmountDisplay } from '@/components/ui/amount-pad'
import { StreakCalendar } from '@/components/ui/streak-calendar'
import { useTheme } from 'next-themes'
import { shiftISO, todayISO } from '@/lib/date'
import { ArrowLeft, Moon, Sun } from 'lucide-react'

export function StyleguideScreen() {
  const { theme, setTheme } = useTheme()
  const [chip, setChip] = useState(0)
  const [amount, setAmount] = useState('1250.5')
  const today = todayISO('Asia/Kolkata')
  const demoDays = Array.from({ length: 35 }, (_, i) => ({ iso: shiftISO(today, i - 34), done: i % 7 !== 5 ? i % 3 !== 2 : false }))

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px] px-4 pt-6 pb-16">
      <header className="mb-4 flex items-center justify-between px-1">
        <button type="button" onClick={() => (window.location.hash = '/today')} className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Back">
          <ArrowLeft className="size-4" /> Saarthi
        </button>
        <Button size="sm" variant="outline" className="h-9 rounded-full" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </header>

      <h1 className="text-2xl font-bold tracking-tight">Styleguide</h1>
      <p className="mb-2 px-1 text-sm text-muted-foreground">Saarthi design system · 8px grid · 12–16px radii · both themes.</p>

      <SectionHeader title="Buttons" />
      <div className="flex flex-wrap gap-2">
        <Button className="rounded-xl">Primary</Button>
        <Button variant="secondary" className="rounded-xl">Secondary</Button>
        <Button variant="outline" className="rounded-xl">Outline</Button>
        <Button variant="ghost" className="rounded-xl">Ghost</Button>
        <Button variant="destructive" className="rounded-xl">Destructive</Button>
        <Button className="rounded-full">Pill</Button>
        <Button disabled className="rounded-xl">Disabled</Button>
      </div>

      <SectionHeader title="Money text (semantic)" />
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
        <Money paise={123456789} className="text-lg font-bold" />
        <Money paise={500000} signed="in" className="font-semibold" />
        <Money paise={500000} signed="out" className="font-semibold" />
        <Money paise={987654321} compact className="font-bold" />
      </div>

      <SectionHeader title="Chips" />
      <div className="flex flex-wrap gap-2">
        {['🍜 Food', '🛒 Groceries', '🚕 Transport'].map((label, i) => (
          <Chip key={label} label={label.split(' ')[1]} emoji={label.split(' ')[0]} active={chip === i} onClick={() => setChip(i)} />
        ))}
        <Chip label="Colour dot" color="#0D9488" />
      </div>

      <SectionHeader title="Cards & stat tiles" />
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <p className="font-semibold">Card title</p>
          <p className="text-sm text-muted-foreground">Cards are rounded-2xl with 16px padding and a hairline border.</p>
        </CardContent>
      </Card>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <StatTile label="Spent · Sept" value="₹18.2K" sub="+12% vs Aug" tone="warn" />
        <StatTile label="Liquid money" value="₹1.2L" sub="Savings + cash" />
        <StatTile label="Income" value="+₹45K" tone="income" />
        <StatTile label="Cards owed" value="₹9.5K" tone="expense" />
      </div>

      <SectionHeader title="Progress (utilization tones)" />
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
        {[20, 55, 85].map((v) => (
          <div key={v}>
            <p className="mb-1 text-xs text-muted-foreground">{v}% · {utilizationTone(v)}</p>
            <ProgressBar value={v} tone={utilizationTone(v)} />
          </div>
        ))}
      </div>

      <SectionHeader title="Inputs" />
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <Input placeholder="Text input" className="rounded-xl" />
        <Input type="date" className="rounded-xl" />
        <Textarea placeholder="Textarea for journal entries (Phase 2)" className="rounded-xl" />
      </div>

      <SectionHeader title="AmountPad" />
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-1 text-center text-sm text-muted-foreground">₹{formatAmountDisplay(amount)}</p>
        <AmountPad value={amount} onChange={setAmount} />
      </div>

      <SectionHeader title="StreakCalendar (sample data)" />
      <div className="rounded-2xl border bg-card p-4">
        <StreakCalendar days={demoDays} />
      </div>

      <SectionHeader title="EmptyState" />
      <EmptyState emoji="🏦" title="No accounts yet" body="Empty states are calm, explain value, and offer one action." action={<Button size="sm" className="mt-1 rounded-full">Add account</Button>} />
    </div>
  )
}

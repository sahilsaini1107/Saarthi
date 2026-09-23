'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/saarthi'
import { useAuthMutation } from '@/hooks/queries'
import { useHashRoute } from '@/hooks/use-hash-route'

export function AuthScreen() {
  const { navigate } = useHashRoute()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const login = useAuthMutation('login')
  const register = useAuthMutation('register')

  const pending = login.isPending || register.isPending
  const error = (login.error ?? register.error)?.message

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'login') login.mutate({ email, password })
    else register.mutate({ email, password, name })
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-5xl" aria-hidden>
          🧭
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Saarthi</h1>
        <p className="text-sm text-muted-foreground">Your Personal Life OS — Wealth · Growth · Reflection</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Auth mode">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`h-9 rounded-lg text-sm font-semibold transition-all ${mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {mode === 'register' && (
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" required />
          </Field>
        )}
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
        </Field>
        <Field label="Password" hint={mode === 'register' ? 'At least 8 characters' : undefined}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="h-11 rounded-xl text-base font-semibold">
          {pending ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          New accounts start with 12 default categories — everything works in INR, no bank linking.
        </p>
      </form>

      <button type="button" onClick={() => navigate('/styleguide')} className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline">
        Curious? View the design system gallery →
      </button>
    </div>
  )
}

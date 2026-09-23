'use client'

// Hash-based router (sandbox exposes a single page route; deep links live in
// the hash — #/money/fds etc. Decision #1 in PROGRESS.md).

import { useCallback, useEffect, useState } from 'react'

function normalize(raw: string): string {
  const h = raw.replace(/^#/, '')
  if (!h || h === '/') return '/'
  return h.startsWith('/') ? h : `/${h}`
}

export function useHashRoute() {
  const [path, setPath] = useState(() => (typeof window === 'undefined' ? '/' : normalize(window.location.hash)))

  useEffect(() => {
    const onChange = () => setPath(normalize(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((to: string) => {
    const next = normalize(to)
    if (normalize(window.location.hash) === next) {
      setPath(next) // re-render even if unchanged (e.g. re-opening a screen)
      return
    }
    window.location.hash = next
  }, [])

  return { path, navigate }
}

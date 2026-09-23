// Tiny typed fetch wrapper.
// Sessions ride an httpOnly cookie when possible, but the app is embedded in a
// cross-site preview iframe where third-party cookie policies can drop cookies
// entirely. So the token is also kept in localStorage and sent as an
// Authorization: Bearer header — that path works in every browser context.

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const TOKEN_KEY = 'saarthi_session_token'

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // private mode / storage blocked — cookie auth still covers top-level use
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const token = getStoredToken()
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'same-origin',
  })
  const payload = (await res.json().catch(() => ({}))) as { data?: T; error?: { message?: string } }
  if (!res.ok) {
    if (res.status === 401) clearStoredToken() // expired/invalid — stop replaying it
    throw new ApiError(payload.error?.message ?? `Request failed (${res.status})`, res.status)
  }
  return payload.data as T
}

/**
 * Raw variant for non-JSON responses (file downloads, e.g. the data export).
 * Same auth + error handling, returns the unwrapped body as a Blob.
 */
export async function apiRaw(path: string, init?: RequestInit & { json?: unknown }): Promise<Blob> {
  const { json, ...rest } = init ?? {}
  const token = getStoredToken()
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'same-origin',
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    if (res.status === 401) clearStoredToken()
    throw new ApiError(payload.error?.message ?? `Request failed (${res.status})`, res.status)
  }
  return res.blob()
}

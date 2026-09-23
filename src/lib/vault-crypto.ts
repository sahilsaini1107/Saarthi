// Zero-knowledge vault crypto (Phase 14). Everything sensitive happens in the
// browser: the master password NEVER leaves the client. The server stores only
//   salt + PBKDF2 iteration count + a GCM "verifier" blob (a fixed known
//   string encrypted with the derived key) + per-entry AES-256-GCM ciphertext.
//
//   master password ──PBKDF2-SHA256(salt, iterations)──▶ 256-bit AES-GCM key
//
// Wrong password ⇒ the verifier fails to authenticate (GCM tag) ⇒ unlock
// refused without a single server round-trip of secret material.
//
// Password generation uses crypto.getRandomValues with rejection sampling —
// never `Math.random`, never `% pool.length` (modulo bias).

import { VAULT_WORDLIST } from '@/lib/vault-wordlist'

/* ---------------- base64 helpers ---------------- */

export function b64encode(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function b64decode(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** n random bytes as base64 (16 → 24-char string, standard salt size). */
export function randomB64(n = 16): string {
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  return b64encode(buf)
}

/* ---------------- key derivation + AEAD ---------------- */

export const DEFAULT_ITERATIONS = 310_000 // OWASP 2023 guidance for PBKDF2-SHA256
export const MIN_ITERATIONS = 100_000
export const MAX_ITERATIONS = 2_000_000

/** The fixed string encrypted into the verifier blob. */
export const VERIFIER_PLAINTEXT = 'saarthi-vault-v1'

/** Derive a non-extractable AES-256-GCM key from the master password. */
export async function deriveVaultKey(password: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  if (password.length === 0) throw new Error('master password is empty')
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error(`iterations must be ${MIN_ITERATIONS}–${MAX_ITERATIONS}`)
  }
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64decode(saltB64) as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable — the raw key material can never be read back
    ['encrypt', 'decrypt'],
  )
}

export interface CipherBlob {
  data: string // base64 ciphertext (includes the 16-byte GCM tag)
  iv: string // base64 12-byte nonce
}

/** AES-256-GCM encrypt a UTF-8 string with a fresh random IV. */
export async function encryptString(key: CryptoKey, plaintext: string): Promise<CipherBlob> {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext))
  return { data: b64encode(new Uint8Array(data)), iv: b64encode(iv) }
}

/** AES-256-GCM decrypt. Throws (OperationError) on wrong key / tampered data. */
export async function decryptString(key: CryptoKey, blob: CipherBlob): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(blob.iv) as BufferSource },
    key,
    b64decode(blob.data) as BufferSource,
  )
  return new TextDecoder().decode(plain)
}

/** Produce the verifier pair to register at vault setup. */
export async function makeVerifier(key: CryptoKey): Promise<CipherBlob> {
  return encryptString(key, VERIFIER_PLAINTEXT)
}

/** True iff this key decrypts the stored verifier (i.e. the password was right). */
export async function verifyMasterKey(key: CryptoKey, verifier: string, verifierIv: string): Promise<boolean> {
  try {
    return (await decryptString(key, { data: verifier, iv: verifierIv })) === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}

/* ---------------- password generator ---------------- */

export const LOWER = 'abcdefghijklmnopqrstuvwxyz'
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const DIGITS = '0123456789'
export const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/'
/** Look-alikes dropped when "avoid ambiguous" is on. */
export const AMBIGUOUS = 'Il1O0o'

export const MIN_LENGTH = 8
export const MAX_LENGTH = 128

export interface GenOptions {
  length: number
  lower: boolean
  upper: boolean
  digits: boolean
  symbols: boolean
  /** drop Il1O0o look-alikes */
  excludeAmbiguous: boolean
  /** guarantee ≥1 char from every enabled class */
  requireEach: boolean
}

export const DEFAULT_GEN_OPTIONS: GenOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: true,
  requireEach: true,
}

/**
 * Uniform random integer in [0, maxExclusive). Rejection-samples above the
 * largest multiple of maxExclusive that fits in a u32, so every value is
 * equally likely (no modulo bias).
 */
export function randomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error('maxExclusive must be a positive integer')
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive
  const buf = new Uint32Array(1)
  let x: number
  do {
    crypto.getRandomValues(buf)
    x = buf[0]
  } while (x >= limit)
  return x % maxExclusive
}

/** Character pool after class toggles + ambiguity filter. Empty pool throws. */
export function buildPool(opts: Pick<GenOptions, 'lower' | 'upper' | 'digits' | 'symbols' | 'excludeAmbiguous'>): string {
  let pool = ''
  if (opts.lower) pool += LOWER
  if (opts.upper) pool += UPPER
  if (opts.digits) pool += DIGITS
  if (opts.symbols) pool += SYMBOLS
  if (opts.excludeAmbiguous) {
    pool = [...pool].filter((c) => !AMBIGUOUS.includes(c)).join('')
  }
  if (pool.length === 0) throw new Error('enable at least one character class')
  return pool
}

/** Classes actually represented in a pool (after filtering). */
function activeClasses(opts: GenOptions, pool: string): string[] {
  const classes: string[] = []
  for (const set of [LOWER, UPPER, DIGITS, SYMBOLS]) {
    const filtered = opts.excludeAmbiguous ? [...set].filter((c) => !AMBIGUOUS.includes(c)).join('') : set
    if ([...filtered].some((c) => pool.includes(c))) classes.push(filtered)
  }
  return classes
}

/**
 * Generate a password from `opts`. With requireEach, one char per enabled
 * (and, after filtering, still populated) class is placed first and the rest
 * of the slots draw from the whole pool; the result is Fisher–Yates shuffled
 * so the guaranteed chars are not trivially at the front.
 */
export function generatePassword(opts: GenOptions): string {
  const length = Math.round(opts.length)
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    throw new Error(`length must be ${MIN_LENGTH}–${MAX_LENGTH}`)
  }
  const pool = buildPool(opts)
  const chars: string[] = []

  if (opts.requireEach) {
    for (const cls of activeClasses(opts, pool)) {
      if (chars.length < length) chars.push(cls[randomInt(cls.length)])
    }
  }
  while (chars.length < length) chars.push(pool[randomInt(pool.length)])

  // Fisher–Yates with unbiased randomInt.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/* ---------------- passphrase mode ---------------- */

export interface PassphraseOptions {
  words: number // 3–8
  separator: string
  capitalize: boolean
  /** append a random 2-digit number (+log2(100) ≈ 6.6 bits) */
  appendNumber: boolean
}

export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = {
  words: 4,
  separator: '-',
  capitalize: true,
  appendNumber: true,
}

export function generatePassphrase(opts: PassphraseOptions): string {
  const count = Math.round(opts.words)
  if (!Number.isInteger(count) || count < 3 || count > 8) throw new Error('words must be 3–8')
  const parts: string[] = []
  for (let i = 0; i < count; i++) {
    let word = VAULT_WORDLIST[randomInt(VAULT_WORDLIST.length)]
    if (opts.capitalize) word = word[0].toUpperCase() + word.slice(1)
    parts.push(word)
  }
  let out = parts.join(opts.separator)
  if (opts.appendNumber) out += opts.separator + String(randomInt(100)).padStart(2, '0')
  return out
}

/* ---------------- strength math ---------------- */

/** Shannon-style entropy estimate for a uniform pool: length × log2(poolSize). */
export function passwordEntropyBits(poolSize: number, length: number): number {
  if (poolSize <= 1 || length <= 0) return 0
  return length * Math.log2(poolSize)
}

/** 7 bits per word + 6.64 for the 2-digit suffix when present. */
export function passphraseEntropyBits(words: number, appendNumber: boolean): number {
  return words * 7 + (appendNumber ? Math.log2(100) : 0)
}

/** Entropy estimate for a TYPED password (master-password setup meter). */
export function estimateEntropyBits(password: string): number {
  if (password.length === 0) return 0
  let pool = 0
  if (/[a-z]/.test(password)) pool += 26
  if (/[A-Z]/.test(password)) pool += 26
  if (/[0-9]/.test(password)) pool += 10
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33
  return passwordEntropyBits(pool, password.length)
}

export type StrengthLabel = 'weak' | 'fair' | 'good' | 'strong' | 'excellent'

/** Bands (documented interpretation): <36 weak, <60 fair, <80 good, <100 strong, else excellent. */
export function strengthLabel(bits: number): { label: StrengthLabel; pct: number } {
  const label: StrengthLabel = bits < 36 ? 'weak' : bits < 60 ? 'fair' : bits < 80 ? 'good' : bits < 100 ? 'strong' : 'excellent'
  return { label, pct: Math.min(100, Math.round((bits / 120) * 100)) }
}

const GUESSES_PER_SEC = 1e10 // offline attack on fast hashes — conservative for real users

/** Human-readable offline crack-time estimate (median: 2^(bits−1) guesses). */
export function crackTimeText(bits: number): string {
  if (bits <= 0) return 'instantly'
  const seconds = Math.pow(2, bits - 1) / GUESSES_PER_SEC
  if (seconds < 1) return 'instantly'
  if (seconds < 60) return `${Math.round(seconds)} seconds`
  const minutes = seconds / 60
  if (minutes < 60) return `${Math.round(minutes)} minutes`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours)} hours`
  const days = hours / 24
  if (days < 30) return `${Math.round(days)} days`
  const months = days / 30.44
  if (months < 12) return `${Math.round(months)} months`
  const years = days / 365.25
  if (years < 1_000) return `${Math.round(years)} years`
  if (years < 1e9) return `${Math.round(years / 100) * 100}+ years`
  if (years < 1e12) return `${Math.round(years / 1e6)} million+ years`
  return 'billions of years'
}

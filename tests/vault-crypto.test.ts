import { describe, expect, it } from 'vitest'
import {
  b64decode,
  b64encode,
  buildPool,
  crackTimeText,
  DEFAULT_GEN_OPTIONS,
  DEFAULT_ITERATIONS,
  deriveVaultKey,
  encryptString,
  decryptString,
  estimateEntropyBits,
  generatePassphrase,
  generatePassword,
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  passphraseEntropyBits,
  passwordEntropyBits,
  randomB64,
  randomInt,
  strengthLabel,
  VERIFIER_PLAINTEXT,
  verifyMasterKey,
  makeVerifier,
} from '@/lib/vault-crypto'
import { VAULT_WORDLIST } from '@/lib/vault-wordlist'

// WebCrypto is available in the Node ≥18 runtime that vitest uses.

const SALT = 'AAAAAAAAAAAAAAAAAAAAAA==' // 16 zero bytes, base64

describe('base64 helpers', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 127])
    expect(b64decode(b64encode(bytes))).toEqual(bytes)
  })

  it('randomB64 length matches byte count (4/3 ratio)', () => {
    expect(randomB64(16)).toHaveLength(24) // 16 bytes → 24 chars (with padding)
    expect(randomB64(12)).toHaveLength(16) // 12 bytes (one GCM IV)
    expect(randomB64(16)).not.toBe(randomB64(16))
  })
})

describe('deriveVaultKey + AEAD', () => {
  it('encrypts and decrypts a secret', async () => {
    const key = await deriveVaultKey('correct horse battery staple', SALT, MIN_ITERATIONS)
    const blob = await encryptString(key, 'netflix / sohil@gmail / p@ss1')
    expect(blob.iv).toHaveLength(16)
    expect(blob.data).not.toContain('netflix')
    const plain = await decryptString(key, blob)
    expect(plain).toBe('netflix / sohil@gmail / p@ss1')
  })

  it('fresh IV every call — same plaintext never repeats ciphertext', async () => {
    const key = await deriveVaultKey('pw', SALT, MIN_ITERATIONS)
    const a = await encryptString(key, 'same')
    const b = await encryptString(key, 'same')
    expect(a.data).not.toBe(b.data)
    expect(a.iv).not.toBe(b.iv)
  })

  it('wrong password fails closed (GCM auth)', async () => {
    const good = await deriveVaultKey('right-password', SALT, MIN_ITERATIONS)
    const bad = await deriveVaultKey('wrong-password', SALT, MIN_ITERATIONS)
    const blob = await encryptString(good, 'secret')
    await expect(decryptString(bad, blob)).rejects.toThrow()
  })

  it('different salt or iterations never derive the same key', async () => {
    const k1 = await deriveVaultKey('pw', SALT, MIN_ITERATIONS)
    const k2 = await deriveVaultKey('pw', randomB64(16), MIN_ITERATIONS)
    const k3 = await deriveVaultKey('pw', SALT, MIN_ITERATIONS * 2)
    const blob = await encryptString(k1, 'x')
    await expect(decryptString(k2, blob)).rejects.toThrow()
    await expect(decryptString(k3, blob)).rejects.toThrow()
  })

  it('rejects iteration counts outside the policy window', async () => {
    await expect(deriveVaultKey('pw', SALT, 1000)).rejects.toThrow()
    await expect(deriveVaultKey('pw', SALT, MAX_ITERATIONS + 1)).rejects.toThrow()
    await expect(deriveVaultKey('pw', SALT, DEFAULT_ITERATIONS)).resolves.toBeTruthy()
  })

  it('verifier round-trip: right key verifies, wrong key does not', async () => {
    const key = await deriveVaultKey('master-pw-2026', SALT, MIN_ITERATIONS)
    const verifier = await makeVerifier(key)
    expect(await verifyMasterKey(key, verifier.data, verifier.iv)).toBe(true)
    const wrong = await deriveVaultKey('master-pw-2025', SALT, MIN_ITERATIONS)
    expect(await verifyMasterKey(wrong, verifier.data, verifier.iv)).toBe(false)
    // tampered verifier also fails
    expect(await verifyMasterKey(key, verifier.data.slice(0, -2) + '==', verifier.iv)).toBe(false)
  })

  it('verifier decrypts to the fixed known plaintext', async () => {
    const key = await deriveVaultKey('x', SALT, MIN_ITERATIONS)
    const v = await makeVerifier(key)
    expect(await decryptString(key, v)).toBe(VERIFIER_PLAINTEXT)
  })
})

describe('randomInt (no modulo bias)', () => {
  it('stays in range and covers the space', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const v = randomInt(7)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(7)
      seen.add(v)
    }
    expect(seen.size).toBe(7)
  })

  it('rejects non-positive / non-integer bounds', () => {
    expect(() => randomInt(0)).toThrow()
    expect(() => randomInt(-1)).toThrow()
    expect(() => randomInt(1.5)).toThrow()
  })
})

describe('generatePassword', () => {
  it('honours length and class requirements', () => {
    const pw = generatePassword(DEFAULT_GEN_OPTIONS)
    expect(pw).toHaveLength(20)
    expect(/[a-z]/.test(pw)).toBe(true)
    expect(/[A-Z]/.test(pw)).toBe(true)
    expect(/[0-9]/.test(pw)).toBe(true)
    expect(/[!@#$%^&*()\-_=+[\]{};:,.?/]/.test(pw)).toBe(true)
  })

  it('excludeAmbiguous removes all look-alikes from the pool', () => {
    const pool = buildPool({ lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: true })
    for (const c of 'Il1O0o') expect(pool.includes(c)).toBe(false)
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ ...DEFAULT_GEN_OPTIONS, length: 16 })
      for (const c of 'Il1O0o') expect(pw.includes(c)).toBe(false)
    }
  })

  it('ambiguous chars are allowed when exclusion is off', () => {
    const pool = buildPool({ lower: true, upper: true, digits: true, symbols: false, excludeAmbiguous: false })
    expect(pool.includes('l')).toBe(true)
    expect(pool.includes('0')).toBe(true)
  })

  it('requireEach guarantees one char per enabled class even at min length', () => {
    const opts = { ...DEFAULT_GEN_OPTIONS, length: 8, symbols: true }
    for (let i = 0; i < 100; i++) {
      const pw = generatePassword(opts)
      expect(/[a-z]/.test(pw)).toBe(true)
      expect(/[A-Z]/.test(pw)).toBe(true)
      expect(/[0-9]/.test(pw)).toBe(true)
      expect(/[!-/:-@[-`{-~]/.test(pw)).toBe(true)
    }
  })

  it('length enforcement', () => {
    expect(() => generatePassword({ ...DEFAULT_GEN_OPTIONS, length: 7 })).toThrow()
    expect(() => generatePassword({ ...DEFAULT_GEN_OPTIONS, length: 129 })).toThrow()
    expect(generatePassword({ ...DEFAULT_GEN_OPTIONS, length: 128 })).toHaveLength(128)
  })

  it('empty pool throws a helpful error', () => {
    expect(() =>
      buildPool({ lower: false, upper: false, digits: false, symbols: false, excludeAmbiguous: false }),
    ).toThrow(/at least one/)
  })

  it('distribution sanity — every pool char can appear', () => {
    const pool = buildPool({ lower: true, upper: false, digits: true, symbols: false, excludeAmbiguous: false })
    const seen = new Set<string>()
    for (let i = 0; i < 3000; i++) seen.add(generatePassword({ ...DEFAULT_GEN_OPTIONS, length: 12, upper: false, symbols: false, excludeAmbiguous: false })[randomInt(12)])
    for (const c of pool) expect(seen.has(c)).toBe(true)
  })
})

describe('generatePassphrase', () => {
  it('word count, capitalization, number suffix', () => {
    const p = generatePassphrase({ words: 4, separator: '-', capitalize: true, appendNumber: true })
    const parts = p.split('-')
    expect(parts).toHaveLength(5)
    expect(Number(parts[4])).toBeGreaterThanOrEqual(0)
    expect(Number(parts[4])).toBeLessThanOrEqual(99)
    for (let i = 0; i < 4; i++) {
      expect(VAULT_WORDLIST.includes(parts[i].toLowerCase())).toBe(true)
      expect(parts[i][0]).toBe(parts[i][0].toUpperCase())
    }
  })

  it('plain mode joins words from the list', () => {
    const p = generatePassphrase({ words: 3, separator: '.', capitalize: false, appendNumber: false })
    expect(p.split('.')).toHaveLength(3)
    for (const w of p.split('.')) expect(VAULT_WORDLIST.includes(w)).toBe(true)
  })

  it('rejects out-of-range word counts', () => {
    expect(() => generatePassphrase({ words: 2, separator: '-', capitalize: false, appendNumber: false })).toThrow()
    expect(() => generatePassphrase({ words: 9, separator: '-', capitalize: false, appendNumber: false })).toThrow()
  })
})

describe('strength math', () => {
  it('passwordEntropyBits = length × log2(pool)', () => {
    expect(passwordEntropyBits(0, 10)).toBe(0)
    expect(passwordEntropyBits(62, 12)).toBeCloseTo(12 * Math.log2(62), 6)
  })

  it('passphraseEntropyBits: 7 bits/word + 6.64 suffix', () => {
    expect(passphraseEntropyBits(4, false)).toBeCloseTo(28, 6)
    expect(passphraseEntropyBits(4, true)).toBeCloseTo(28 + Math.log2(100), 6)
  })

  it('estimateEntropyBits detects character classes', () => {
    expect(estimateEntropyBits('')).toBe(0)
    expect(estimateEntropyBits('abcdefgh')).toBeCloseTo(8 * Math.log2(26), 6)
    expect(estimateEntropyBits('abcdefg1')).toBeCloseTo(8 * Math.log2(36), 6) // lower + digits
    expect(estimateEntropyBits('abcdefg!')).toBeCloseTo(8 * Math.log2(59), 6) // lower + symbols
  })

  it('strength bands', () => {
    expect(strengthLabel(20).label).toBe('weak')
    expect(strengthLabel(40).label).toBe('fair')
    expect(strengthLabel(70).label).toBe('good')
    expect(strengthLabel(90).label).toBe('strong')
    expect(strengthLabel(128).label).toBe('excellent')
    expect(strengthLabel(128).pct).toBe(100)
  })

  it('crack-time text escalates', () => {
    expect(crackTimeText(0)).toBe('instantly')
    expect(crackTimeText(40)).toMatch(/seconds|minutes/) // 2^39 / 1e10 ≈ 55 s
    expect(crackTimeText(60)).toMatch(/days|months|years/)
    expect(crackTimeText(100)).toMatch(/years/)
    expect(crackTimeText(128)).toMatch(/years/)
  })
})

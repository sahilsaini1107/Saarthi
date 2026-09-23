import { describe, expect, it } from 'vitest'
import { bytesToBase64, encodeWavPcm16, floatToPcm16, resampleMono } from '@/lib/wav'

describe('floatToPcm16', () => {
  it('clamps and scales', () => {
    expect(floatToPcm16(0)).toBe(0)
    expect(floatToPcm16(1)).toBe(0x7fff)
    expect(floatToPcm16(-1)).toBe(-0x8000)
    expect(floatToPcm16(2)).toBe(0x7fff) // clamped
    expect(floatToPcm16(-2)).toBe(-0x8000)
    expect(floatToPcm16(0.5)).toBe(Math.round(0.5 * 0x7fff))
  })
})

describe('resampleMono', () => {
  it('is a no-op at equal rates', () => {
    const x = new Float32Array([0, 0.5, 1])
    expect(resampleMono(x, 16_000, 16_000)).toBe(x)
  })

  it('downsamples 2:1 preserving shape (48k → 24k)', () => {
    const x = new Float32Array(48)
    for (let i = 0; i < 48; i++) x[i] = i / 48
    const out = resampleMono(x, 48_000, 24_000)
    expect(out.length).toBe(24)
    expect(out[0]).toBeCloseTo(0, 5)
    expect(out[12]).toBeCloseTo(12 / 24, 5) // value at halfway input position
  })

  it('never returns empty output', () => {
    expect(resampleMono(new Float32Array([0.1]), 48_000, 16_000).length).toBe(1)
  })
})

describe('encodeWavPcm16', () => {
  it('writes a canonical 44-byte header + little-endian PCM data', () => {
    const wav = encodeWavPcm16(new Float32Array([0, 0.5, -1]), 16_000)
    expect(wav.length).toBe(44 + 6)

    const ascii = (o: number, n: number) => String.fromCharCode(...wav.subarray(o, o + n))
    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    expect(ascii(36, 4)).toBe('data')

    const view = new DataView(wav.buffer)
    expect(view.getUint32(4, true)).toBe(36 + 6) // file size
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint32(28, true)).toBe(32_000) // byte rate
    expect(view.getUint16(34, true)).toBe(16) // bits
    expect(view.getUint32(40, true)).toBe(6) // data bytes

    expect(view.getInt16(44, true)).toBe(0)
    expect(view.getInt16(46, true)).toBe(Math.round(0.5 * 0x7fff))
    expect(view.getInt16(48, true)).toBe(-0x8000)
  })

  it('header byte-rate matches the given sample rate', () => {
    const wav = encodeWavPcm16(new Float32Array(10), 44_100)
    const view = new DataView(wav.buffer)
    expect(view.getUint32(24, true)).toBe(44_100)
    expect(view.getUint32(28, true)).toBe(88_200)
  })
})

describe('bytesToBase64', () => {
  it('round-trips small and chunked payloads', () => {
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe(btoa('hi'))
    const big = new Uint8Array(0x8000 + 7).map((_, i) => i % 251)
    expect(bytesToBase64(big)).toBe(btoa(String.fromCharCode(...big)))
  })
})

// Client-side PCM→WAV encoding for voice capture (Phase 6).
// MediaRecorder's default webm/opus is NOT accepted by the ASR service, so
// the recorder taps raw PCM and encodes a 16 kHz mono WAV in the browser —
// pure bytes math, unit-tested. No dependencies.

/** Linear-interpolation resample of mono audio to `targetRate` Hz. */
export function resampleMono(samples: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate || samples.length === 0) return samples
  const ratio = sourceRate / targetRate
  const outLength = Math.max(1, Math.floor(samples.length / ratio))
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, samples.length - 1)
    const frac = pos - i0
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac
  }
  return out
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

/** Clamp a float sample to [-1, 1] and scale to a 16-bit PCM value. */
export function floatToPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample))
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff)
}

/**
 * Encode mono float samples (-1..1) as a canonical 16-bit PCM WAV file
 * (44-byte RIFF header + data). Returns the raw bytes.
 */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, floatToPcm16(samples[i]), true)
    offset += 2
  }
  return new Uint8Array(buffer)
}

/** Chunk-safe base64 (btoa breaks on large buffers without chunking). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

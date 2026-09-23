'use client'

// Voice recorder (Phase 6): taps raw mono PCM via the Web Audio API and
// encodes a 16 kHz WAV in the browser (lib/wav.ts). MediaRecorder's
// webm/opus output is not accepted by the ASR service, and server-side
// transcoding would add a fragile moving part — client-side encoding is
// deterministic and fully testable.

import { useCallback, useEffect, useRef, useState } from 'react'
import { bytesToBase64, encodeWavPcm16, resampleMono } from '@/lib/wav'

const TARGET_RATE = 16_000
const MAX_SECONDS = 60

export type RecorderState = 'idle' | 'recording' | 'encoding'

export interface Recording {
  /** base64 16 kHz mono WAV, ready for /api/capture/voice */
  wavBase64: string
  seconds: number
}

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const nodeRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const chunksRef = useRef<Float32Array[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef(0)

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    nodeRef.current?.disconnect()
    sourceRef.current?.disconnect()
    nodeRef.current = null
    sourceRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (ctxRef.current && ctxRef.current.state !== 'closed') void ctxRef.current.close()
    ctxRef.current = null
  }, [])

  // always release the mic if the component unmounts mid-recording
  useEffect(() => cleanup, [cleanup])

  const start = useCallback(async () => {
    setError(null)
    chunksRef.current = []
    setSeconds(0)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      ctxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source
      const node = ctx.createScriptProcessor(4096, 1, 1)
      nodeRef.current = node
      node.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }
      source.connect(node)
      // Chrome only fires onaudioprocess when the node reaches the destination;
      // a zero gain keeps the monitoring silent.
      const silent = ctx.createGain()
      silent.gain.value = 0
      node.connect(silent)
      silent.connect(ctx.destination)

      startRef.current = Date.now()
      setState('recording')
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startRef.current) / 1000)
        setSeconds(s)
        if (s >= MAX_SECONDS) {
          // auto-stop resolves through the same stop() path
          void stopRef.current?.()
        }
      }, 250)
    } catch (err) {
      cleanup()
      setState('idle')
      const e = err as Error & { name?: string }
      setError(
        e.name === 'NotAllowedError'
          ? 'Microphone permission was blocked — allow it in the browser bar and try again.'
          : e.name === 'NotFoundError'
            ? 'No microphone found on this device.'
            : `Could not start recording (${e.message})`,
      )
    }
  }, [cleanup])

  const stop = useCallback(async (): Promise<Recording | null> => {
    if (state !== 'recording') return null
    setState('encoding')
    const elapsed = Math.max(1, Math.round((Date.now() - startRef.current) / 1000))
    const raw = mergeChunks(chunksRef.current)
    const ctx = ctxRef.current
    const sourceRate = ctx?.sampleRate ?? 48_000
    cleanup()
    try {
      const resampled = resampleMono(raw, sourceRate, TARGET_RATE)
      const wav = encodeWavPcm16(resampled, TARGET_RATE)
      const base64 = bytesToBase64(wav)
      if (base64.length < 512) throw new Error('Recording was too short')
      return { wavBase64: base64, seconds: elapsed }
    } catch (err) {
      setError(`Could not encode the recording (${(err as Error).message})`)
      return null
    } finally {
      setState('idle')
      setSeconds(0)
    }
  }, [state, cleanup])

  // stable handle so the auto-stop timer can call the latest stop()
  const stopRef = useRef<(() => Promise<Recording | null>) | null>(null)
  useEffect(() => {
    stopRef.current = stop
  }, [stop])

  const cancel = useCallback(() => {
    cleanup()
    setState('idle')
    setSeconds(0)
  }, [cleanup])

  return { state, seconds, error, start, stop, cancel, maxSeconds: MAX_SECONDS }
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

// A scripted AudioBackend for laptop development (enabled via ?fakeMic=1 in
// dev) and for tests that need to exercise ActivityMeter / recording flows
// without a real microphone. Emits RMS levels on a timer from either a fixed
// script of { rms, ms } segments or an arbitrary function of elapsed time.

import type { AudioBackend, MicSession, RecordingResult } from './types'

export type FakeScript = Array<{ rms: number; ms: number }> | ((elapsedMs: number) => number)

export interface FakeAudioBackendOptions {
  tickMs?: number
  mimeType?: string
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function rmsForElapsed(script: FakeScript, elapsedMs: number): number {
  if (typeof script === 'function') return script(elapsedMs)
  if (script.length === 0) return 0
  let acc = 0
  for (const segment of script) {
    if (elapsedMs < acc + segment.ms) return segment.rms
    acc += segment.ms
  }
  // Past the end of the script: hold the last segment's level.
  return script[script.length - 1].rms
}

class FakeMicSession implements MicSession {
  readonly mimeType: string
  private readonly script: FakeScript
  private readonly startedAt: number
  private readonly listeners = new Set<(rms: number, t: number) => void>()
  private readonly chunkListeners = new Set<(blob: Blob, seq: number) => void>()
  private timer: ReturnType<typeof setInterval> | null
  private chunkSeq = 0

  constructor(script: FakeScript, mimeType: string, tickMs: number) {
    this.script = script
    this.mimeType = mimeType
    this.startedAt = now()
    this.timer = setInterval(() => this.tick(), tickMs)
  }

  private tick(): void {
    const t = now()
    const rms = rmsForElapsed(this.script, t - this.startedAt)
    for (const listener of this.listeners) listener(rms, t)
    // A tiny fake chunk per tick, same shape as the real backend's
    // ondataavailable slices - lets tests exercise the partial-recording
    // pipeline (recordingSession.ts) without a real MediaRecorder.
    if (this.chunkListeners.size > 0) {
      const seq = this.chunkSeq++
      const blob = new Blob([new Uint8Array(16)], { type: this.mimeType })
      for (const listener of this.chunkListeners) listener(blob, seq)
    }
  }

  onLevel(cb: (rms: number, t: number) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  onChunk(cb: (blob: Blob, seq: number) => void): () => void {
    this.chunkListeners.add(cb)
    return () => this.chunkListeners.delete(cb)
  }

  async stop(): Promise<RecordingResult> {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    const durationMs = now() - this.startedAt
    return {
      blob: new Blob([new Uint8Array(1024)], { type: this.mimeType }),
      mimeType: this.mimeType,
      durationMs,
    }
  }
}

export class FakeAudioBackend implements AudioBackend {
  private readonly script: FakeScript
  private readonly opts: FakeAudioBackendOptions | undefined

  constructor(script: FakeScript, opts?: FakeAudioBackendOptions) {
    this.script = script
    this.opts = opts
  }

  isSupported(): boolean {
    return true
  }

  async start(): Promise<MicSession> {
    const tickMs = this.opts?.tickMs ?? 100
    const mimeType = this.opts?.mimeType ?? 'audio/webm'
    return new FakeMicSession(this.script, mimeType, tickMs)
  }
}

// 3 s of quiet room noise, then 40 s of alternating notes/rests that look
// like real piano playing, then 25 s of quiet - long enough to demo the
// ring filling, the goal being reached, and the "keep playing" hint on a
// laptop with no microphone.
export const FAKE_PIANO_SCRIPT: Array<{ rms: number; ms: number }> = [
  { rms: 0.004, ms: 3000 },
  ...Array.from({ length: 20 }, () => [
    { rms: 0.3, ms: 1200 },
    { rms: 0.01, ms: 800 },
  ]).flat(),
  { rms: 0.005, ms: 25000 },
]

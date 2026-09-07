// Common interfaces for anything that can record from the microphone -
// whether that's the real browser MediaRecorder/AnalyserNode pipeline or a
// scripted fake used for laptop development and tests. Same swappable-
// backend pattern as src/input/CubeInput.ts.

export interface RecordingResult {
  blob: Blob | null
  mimeType: string
  durationMs: number
}

export interface MicSession {
  readonly mimeType: string
  /** ~10 Hz RMS level 0..1 with a monotonic timestamp in ms. Returns an unsubscribe. */
  onLevel(cb: (rms: number, t: number) => void): () => void
  stop(): Promise<RecordingResult>
}

export interface AudioBackend {
  isSupported(): boolean
  /** Must be invoked synchronously inside a user tap handler (Safari). */
  start(opts?: { audioBitsPerSecond?: number }): Promise<MicSession>
}

export type MicError = 'unsupported' | 'denied' | 'busy' | 'unknown'

export class MicStartError extends Error {
  readonly kind: MicError

  constructor(kind: MicError, message?: string) {
    super(message ?? kind)
    this.kind = kind
    this.name = 'MicStartError'
  }
}

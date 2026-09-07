// Module-level singleton store for the in-progress piano take, same pattern
// as src/store/activeProfile.ts: plain get/subscribe functions plus a React
// hook built on useSyncExternalStore. Owns the whole start -> recording ->
// stop -> saved lifecycle so PianoHome and Record.tsx just render state.

import { useSyncExternalStore } from 'react'
import { ActivityMeter } from './activityMeter'
import { BrowserAudioBackend } from './browserBackend'
import { FakeAudioBackend, FAKE_PIANO_SCRIPT } from './fakeBackend'
import { MicStartError, type AudioBackend, type MicError, type MicSession, type RecordingResult } from './types'
import { acquireWakeLock, type WakeLockHandle } from './wakeLock'
import { getDeviceId, awardGoalIfReached, saveTake } from '../store/piano'
import { getDoc, type PianoTake } from '../store/progress'
import { getRecordingStore } from '../store/recordings'
import { isDriveConfigured, processUploadQueue } from '../store/driveUpload'
import { localDay } from '../store/sessions'
import { fireConfetti } from '../components/Confetti'

export type SessionState =
  | { status: 'idle' }
  | { status: 'starting'; pieceId: string | null }
  | {
      status: 'recording'
      pieceId: string | null
      startedAt: number
      wallSec: number
      activeSec: number
      level: number
      silentSec: number
      wakeLock: boolean
      hearing: boolean
    }
  | { status: 'saving' }
  | { status: 'done'; take: PianoTake; goalJustReached: boolean; discarded: boolean }
  | { status: 'error'; error: MicError }

const FAKE_MIC_FLAG_KEY = 'cubeclimb.fakeMic'
const MIN_KEPT_DURATION_SEC = 3

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // fall through to the manual fallback below
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** ?fakeMic=1 in dev enables the scripted backend for laptop testing without a mic; sticks for the session via localStorage. */
function isDevFakeMicRequested(): boolean {
  if (typeof window === 'undefined') return false
  let fromHash = false
  try {
    fromHash = window.location.hash.includes('fakeMic=1')
  } catch {
    fromHash = false
  }
  if (fromHash) {
    try {
      localStorage.setItem(FAKE_MIC_FLAG_KEY, '1')
    } catch {
      // ignore - just won't stick across a reload
    }
    return true
  }
  try {
    return localStorage.getItem(FAKE_MIC_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

function createDefaultBackend(): AudioBackend {
  if (import.meta.env.DEV && isDevFakeMicRequested()) {
    return new FakeAudioBackend(FAKE_PIANO_SCRIPT)
  }
  return new BrowserAudioBackend()
}

let backend: AudioBackend = createDefaultBackend()

export function setAudioBackend(b: AudioBackend): void {
  backend = b
}

export function getAudioBackend(): AudioBackend {
  return backend
}

let state: SessionState = { status: 'idle' }
const listeners = new Set<() => void>()

function setState(next: SessionState): void {
  state = next
  for (const l of listeners) l()
}

/** Plain (non-hook) read of the current session state - for code outside React, including tests. */
export function getSessionState(): SessionState {
  return state
}

export function subscribeSession(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useRecordingSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSessionState, getSessionState)
}

export function isRecordingActive(s: SessionState): boolean {
  return s.status === 'starting' || s.status === 'recording' || s.status === 'saving'
}

// --- In-progress session bookkeeping ---------------------------------------

let currentSession: MicSession | null = null
let currentMeter: ActivityMeter | null = null
let unsubscribeLevel: (() => void) | null = null
let currentWakeLock: WakeLockHandle | null = null
let currentPieceId: string | null = null
let currentStartedAt = 0
let hiddenListenersAttached = false

function onVisibilityChange(): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    void stopTake('hidden')
  }
}

function onPageHide(): void {
  void stopTake('hidden')
}

function attachHiddenListeners(): void {
  if (hiddenListenersAttached) return
  hiddenListenersAttached = true
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide)
}

function detachHiddenListeners(): void {
  if (!hiddenListenersAttached) return
  hiddenListenersAttached = false
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
  if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide)
}

function resetTrackingState(): void {
  currentSession = null
  currentMeter = null
  unsubscribeLevel = null
  if (currentWakeLock) {
    currentWakeLock.release()
    currentWakeLock = null
  }
}

/** Must be invoked directly from a tap handler (Safari requires the mic prompt inside a user gesture). */
export async function startTake(pieceId: string | null): Promise<void> {
  if (isRecordingActive(state)) return

  currentPieceId = pieceId
  setState({ status: 'starting', pieceId })

  try {
    const session = await backend.start()
    currentSession = session
    currentStartedAt = Date.now()
    const meter = new ActivityMeter()
    currentMeter = meter
    currentWakeLock = await acquireWakeLock()
    const wakeLockOn = currentWakeLock.supported

    setState({
      status: 'recording',
      pieceId,
      startedAt: currentStartedAt,
      wallSec: 0,
      activeSec: 0,
      level: 0,
      silentSec: 0,
      wakeLock: wakeLockOn,
      hearing: false,
    })

    unsubscribeLevel = session.onLevel((rms, t) => {
      const frame = meter.push(rms, t)
      if (state.status !== 'recording') return
      setState({
        status: 'recording',
        pieceId,
        startedAt: currentStartedAt,
        wallSec: (Date.now() - currentStartedAt) / 1000,
        activeSec: Math.round(frame.activeMs / 1000),
        level: frame.level,
        silentSec: Math.round(frame.silentMs / 1000),
        wakeLock: wakeLockOn,
        hearing: frame.active,
      })
    })

    attachHiddenListeners()
  } catch (err) {
    const kind = err instanceof MicStartError ? err.kind : 'unknown'
    resetTrackingState()
    setState({ status: 'error', error: kind })
  }
}

export async function stopTake(reason: 'user' | 'hidden' = 'user'): Promise<void> {
  void reason // kept for API clarity/future use (e.g. distinguishing analytics); behavior is identical either way
  if (state.status !== 'recording') return

  const pieceId = currentPieceId
  const startedAt = currentStartedAt
  const session = currentSession
  const meter = currentMeter

  detachHiddenListeners()
  if (unsubscribeLevel) {
    unsubscribeLevel()
    unsubscribeLevel = null
  }

  setState({ status: 'saving' })

  let result: RecordingResult = { blob: null, mimeType: '', durationMs: 0 }
  if (session) {
    try {
      result = await session.stop()
    } catch {
      // Keep whatever we already tracked locally and still finish the flow
      // with an empty result rather than getting stuck in 'saving'.
    }
  }

  resetTrackingState()

  const activeSec = Math.round((meter?.activeMs ?? 0) / 1000)
  const durationSec = Math.max(0, Math.round(result.durationMs / 1000))
  const day = localDay()
  const settings = getDoc().settings

  const take: PianoTake = {
    id: randomId(),
    day,
    pieceId,
    startedAt,
    durationSec,
    activeSec,
    mimeType: result.mimeType,
    sizeBytes: result.blob?.size ?? 0,
    hasAudio: Boolean(result.blob && result.blob.size > 0),
    deviceId: getDeviceId(),
    upload: isDriveConfigured(settings) ? { status: 'pending', attempts: 0, updatedAt: Date.now() } : undefined,
  }

  const discarded = durationSec < MIN_KEPT_DURATION_SEC && activeSec === 0
  let goalJustReached = false

  if (!discarded) {
    if (result.blob) {
      try {
        await getRecordingStore().put(take.id, result.blob)
      } catch {
        take.hasAudio = false
      }
    }
    saveTake(take)
    goalJustReached = awardGoalIfReached(day, settings.goalMinutes.piano)
    if (goalJustReached) fireConfetti('big')
    // Kick the Drive upload right away; the worker also retries later.
    if (take.upload) void processUploadQueue()
  }

  setState({ status: 'done', take, goalJustReached, discarded })
}

export function dismiss(): void {
  if (state.status === 'done' || state.status === 'error' || state.status === 'idle') {
    setState({ status: 'idle' })
  }
}

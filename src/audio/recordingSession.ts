// Module-level singleton store for the in-progress piano take: plain
// get/subscribe functions plus a React hook built on useSyncExternalStore.
// Owns the whole start -> recording -> stop -> saved lifecycle so PianoHome
// and Record.tsx just render state.

import { useSyncExternalStore } from 'react'
import { ActivityMeter } from './activityMeter'
import { BrowserAudioBackend } from './browserBackend'
import { FakeAudioBackend, FAKE_PIANO_SCRIPT } from './fakeBackend'
import { MicStartError, type AudioBackend, type MicError, type MicSession, type RecordingResult } from './types'
import { acquireWakeLock, type WakeLockHandle } from './wakeLock'
import { getDeviceId, awardGoalIfReached, saveTake } from '../store/piano'
import { getDoc, type PianoTake } from '../store/progress'
import { getRecordingStore, requestPersistentStorage } from '../store/recordings'
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
const INFLIGHT_KEY = 'cubeclimb.piano.inflight'
const CHECKPOINT_INTERVAL_MS = 1000

/** Written to sessionStorage roughly once a second while recording, so a reload can estimate active-minutes for a take recovered from leftover partial chunks (see recoverUnfinishedTakes). */
interface InflightCheckpoint {
  id: string
  activeMs: number
  startedAt: number
  pieceId: string | null
}

function readInflightCheckpoint(): InflightCheckpoint | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(INFLIGHT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as InflightCheckpoint
  } catch {
    return null
  }
}

function writeInflightCheckpoint(cp: InflightCheckpoint): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(INFLIGHT_KEY, JSON.stringify(cp))
  } catch {
    // Storage disabled/full - the recovered take (if any) just falls back to activeSec 0.
  }
}

function clearInflightCheckpoint(): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(INFLIGHT_KEY)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

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
let unsubscribeChunk: (() => void) | null = null
let currentWakeLock: WakeLockHandle | null = null
let currentPieceId: string | null = null
let currentStartedAt = 0
let currentTakeId: string | null = null
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
  unsubscribeChunk = null
  if (currentWakeLock) {
    currentWakeLock.release()
    currentWakeLock = null
  }
}

/** Fire-and-forget: a lost chunk just means a slightly smaller recovered take later, never worth blocking or surfacing an error over. */
async function persistPartialChunk(
  id: string,
  blob: Blob,
  seq: number,
  mimeType: string,
  startedAt: number,
  pieceId: string | null,
): Promise<void> {
  try {
    const bytes = await blob.arrayBuffer()
    await getRecordingStore().putPartial({ id, seq, bytes, mimeType, startedAt, pieceId, deviceId: getDeviceId() })
  } catch {
    // Best-effort only - see comment above.
  }
}

/** Must be invoked directly from a tap handler (Safari requires the mic prompt inside a user gesture). */
export async function startTake(pieceId: string | null): Promise<void> {
  if (isRecordingActive(state)) return

  // Best-effort and fire-and-forget: browsers that condition the grant on a
  // user gesture still see one here (startTake must be called synchronously
  // from a tap handler - see the doc comment below).
  void requestPersistentStorage()

  currentPieceId = pieceId
  const takeId = randomId()
  currentTakeId = takeId
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

    if (session.onChunk) {
      unsubscribeChunk = session.onChunk((blob, seq) => {
        void persistPartialChunk(takeId, blob, seq, session.mimeType, currentStartedAt, pieceId)
      })
    }

    let lastCheckpointAt = 0
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
      const nowMs = Date.now()
      if (nowMs - lastCheckpointAt >= CHECKPOINT_INTERVAL_MS) {
        lastCheckpointAt = nowMs
        writeInflightCheckpoint({ id: takeId, activeMs: frame.activeMs, startedAt: currentStartedAt, pieceId })
      }
    })

    attachHiddenListeners()
  } catch (err) {
    const kind = err instanceof MicStartError ? err.kind : 'unknown'
    currentTakeId = null
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
  const takeId = currentTakeId

  detachHiddenListeners()
  if (unsubscribeLevel) {
    unsubscribeLevel()
    unsubscribeLevel = null
  }
  if (unsubscribeChunk) {
    unsubscribeChunk()
    unsubscribeChunk = null
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
    id: takeId ?? randomId(),
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

  // The take is finalized one way or another now (saved, or deliberately
  // discarded) - the partial chunks and inflight checkpoint that existed
  // only to survive a crash/reload mid-recording are no longer needed.
  // Awaited (unlike the fire-and-forget writes above) so a reload right
  // after Stop can never race a leftover partial into recoverUnfinishedTakes.
  if (takeId) {
    try {
      await getRecordingStore().deletePartial(takeId)
    } catch {
      // Not fatal - a stray partial just gets swept up (harmlessly) by the next recoverUnfinishedTakes() call.
    }
  }
  clearInflightCheckpoint()
  currentTakeId = null

  setState({ status: 'done', take, goalJustReached, discarded })
}

export function dismiss(): void {
  if (state.status === 'done' || state.status === 'error' || state.status === 'idle') {
    setState({ status: 'idle' })
  }
}

// --- Recovering a take that never made it through a clean stopTake() -------
//
// If the app crashes, the tab is force-closed, or an update reloads mid
// recording (shouldn't happen with registerType 'prompt', but this is the
// safety net), stopTake()'s cleanup never runs and its partial chunks are
// left behind in IndexedDB. Call this once on startup (see main.tsx) to
// assemble any of those into a real take.

let recoveredTakeCount = 0
const recoveredTakeListeners = new Set<() => void>()

function setRecoveredTakeCount(n: number): void {
  recoveredTakeCount = n
  for (const l of recoveredTakeListeners) l()
}

function subscribeRecoveredTakeCount(cb: () => void): () => void {
  recoveredTakeListeners.add(cb)
  return () => recoveredTakeListeners.delete(cb)
}

function getRecoveredTakeCountSnapshot(): number {
  return recoveredTakeCount
}

/** Count of unfinished takes recovered by the most recent recoverUnfinishedTakes() call - for a small "we saved an unfinished recording" notice (e.g. on Piano home). */
export function useRecoveredTakeNotice(): number {
  return useSyncExternalStore(subscribeRecoveredTakeCount, getRecoveredTakeCountSnapshot, getRecoveredTakeCountSnapshot)
}

/**
 * Assembles every leftover partial recording into a real take, saves it
 * locally (queued for Drive upload if configured), and clears the partial
 * chunks either way. Safe to call every app start - a normal
 * startTake -> stopTake cycle never leaves partials behind, so there is
 * usually nothing to do. Returns how many takes were recovered.
 */
export async function recoverUnfinishedTakes(): Promise<number> {
  const store = getRecordingStore()
  let ids: string[]
  try {
    ids = await store.listPartialIds()
  } catch {
    return 0
  }
  if (ids.length === 0) return 0

  const existingIds = new Set(getDoc().piano.takes.map((t) => t.id))
  const checkpoint = readInflightCheckpoint()
  let recovered = 0

  for (const id of ids) {
    if (existingIds.has(id)) {
      await store.deletePartial(id).catch(() => {})
      continue
    }

    let assembled: Awaited<ReturnType<typeof store.assemblePartial>> = null
    try {
      assembled = await store.assemblePartial(id)
    } catch {
      assembled = null
    }
    if (!assembled) {
      await store.deletePartial(id).catch(() => {})
      continue
    }

    const { blob, mimeType, startedAt, pieceId, chunks } = assembled
    const activeMs = checkpoint && checkpoint.id === id ? checkpoint.activeMs : 0
    const settings = getDoc().settings
    const take: PianoTake = {
      id,
      day: localDay(new Date(startedAt)),
      pieceId,
      startedAt,
      durationSec: chunks, // ~1 chunk per second - see AssembledPartial's doc comment
      activeSec: Math.round(activeMs / 1000),
      mimeType,
      sizeBytes: blob.size,
      hasAudio: true,
      deviceId: getDeviceId(),
      upload: isDriveConfigured(settings) ? { status: 'pending', attempts: 0, updatedAt: Date.now() } : undefined,
    }

    try {
      await getRecordingStore().put(take.id, blob)
      saveTake(take)
      if (take.upload) void processUploadQueue()
      recovered += 1
    } catch {
      // Couldn't save the blob locally - nothing more useful to do with this partial.
    }
    await store.deletePartial(id).catch(() => {})
  }

  clearInflightCheckpoint()
  if (recovered > 0) setRecoveredTakeCount(recovered)
  return recovered
}

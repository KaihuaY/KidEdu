// Module-level external store for the visual/audible metronome shown on
// Piano home and (as a compact strip) on the Record screen. Deliberately
// module-level rather than component state so navigating from Piano home to
// Record - and the recording session itself - never resets or interrupts a
// beat already going. Every browser global (sessionStorage, AudioContext) is
// guarded so this file imports and runs cleanly in the node test environment.

import { useSyncExternalStore } from 'react'
import { getSessionState, subscribeSession } from './recordingSession'

export interface MetronomeState {
  running: boolean
  bpm: number
  /** Increments once per beat while running - components toggle a CSS class off this to pulse the dot. */
  beat: number
  /** Whether the WebAudio click plays alongside the visual pulse. Default on. */
  click: boolean
}

export const MIN_BPM = 40
export const MAX_BPM = 160
export const DEFAULT_BPM = 84

/** Clamps to the 40-160 bpm range this app supports, rounding to a whole beat. */
export function clampBpm(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_BPM
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(n)))
}

/** `bpm + delta`, clamped - used by the ±4 chips and the done screen's "try it faster" nudge. */
export function nudgeBpm(bpm: number, delta: number): number {
  return clampBpm(bpm + delta)
}

let state: MetronomeState = { running: false, bpm: DEFAULT_BPM, beat: 0, click: true }
const listeners = new Set<() => void>()

function setState(next: MetronomeState): void {
  state = next
  for (const l of listeners) l()
}

/** Plain (non-hook) read of the current metronome state - for code outside React. */
export function getMetronomeState(): MetronomeState {
  return state
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useMetronome(): MetronomeState {
  return useSyncExternalStore(subscribe, getMetronomeState, getMetronomeState)
}

// --- Beat timing -------------------------------------------------------
//
// A plain setInterval recomputed whenever bpm changes - drift versus a real
// clock is fine at these tempos and this duration (a few minutes of
// practice), and it keeps this file simple and easy to fake-timer test.

let intervalHandle: ReturnType<typeof setInterval> | null = null

function clearBeatInterval(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

function onBeat(): void {
  setState({ ...state, beat: state.beat + 1 })
  playClick()
}

function scheduleBeatInterval(bpm: number): void {
  clearBeatInterval()
  intervalHandle = setInterval(onBeat, 60_000 / bpm)
}

// --- WebAudio click ------------------------------------------------------
//
// Created lazily on the first tap that starts the metronome - iOS only
// unlocks a fresh AudioContext from inside a user gesture, and start() is
// always called directly from one (the ▶ button).

type AudioContextCtor = new () => AudioContext

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

let audioCtx: AudioContext | null = null

function ensureAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx
  const Ctor = getAudioContextCtor()
  if (!Ctor) return null
  try {
    audioCtx = new Ctor()
    return audioCtx
  } catch {
    return null
  }
}

/** A short 880Hz tick - deliberately quiet (gain 0.15) so it's a guide, not a distraction. */
function playClick(): void {
  if (!state.click) return
  const ctx = audioCtx
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.15
    osc.connect(gain)
    gain.connect(ctx.destination)
    const now = ctx.currentTime
    osc.start(now)
    osc.stop(now + 0.04)
  } catch {
    // Unsupported/blocked - the visual pulse still carries the beat.
  }
}

// --- Public controls -----------------------------------------------------

/** Starts (or restarts, at a new tempo) the beat. Must be called from a user gesture the first time, to unlock WebAudio. */
export function start(bpm: number): void {
  const clamped = clampBpm(bpm)
  const ctx = ensureAudioContext()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
  setState({ ...state, running: true, bpm: clamped, beat: 0 })
  scheduleBeatInterval(clamped)
}

export function stop(): void {
  clearBeatInterval()
  if (!state.running) return
  setState({ ...state, running: false })
}

/** Changes tempo in place - reschedules the interval immediately if already running. */
export function setBpm(bpm: number): void {
  const clamped = clampBpm(bpm)
  if (clamped === state.bpm) return
  setState({ ...state, bpm: clamped })
  if (state.running) scheduleBeatInterval(clamped)
}

export function setClick(on: boolean): void {
  setState({ ...state, click: on })
}

// --- Tempo remembered per piece -------------------------------------------

const TEMPO_KEY_PREFIX = 'cubeclimb.metronome.'

function hasSessionStorage(): boolean {
  try {
    return typeof sessionStorage !== 'undefined'
  } catch {
    return false
  }
}

function tempoKey(pieceId: string | null): string {
  return `${TEMPO_KEY_PREFIX}${pieceId ?? 'free'}`
}

/** The last tempo chosen for this piece (or free play), or DEFAULT_BPM if never set. */
export function getRememberedBpm(pieceId: string | null): number {
  if (!hasSessionStorage()) return DEFAULT_BPM
  try {
    const raw = sessionStorage.getItem(tempoKey(pieceId))
    const n = raw === null ? NaN : Number(raw)
    return Number.isFinite(n) ? clampBpm(n) : DEFAULT_BPM
  } catch {
    return DEFAULT_BPM
  }
}

export function setRememberedBpm(pieceId: string | null, bpm: number): void {
  if (!hasSessionStorage()) return
  try {
    sessionStorage.setItem(tempoKey(pieceId), String(clampBpm(bpm)))
  } catch {
    // Storage disabled/full - the tempo just won't be remembered next time.
  }
}

// --- "Try it faster" nudge: the tempo running at the moment a take started -

let lastTakeBpm: number | undefined

/** The metronome's tempo when the most recent take started recording, or undefined if it wasn't running - read by Record.tsx's done-screen "try it faster" nudge. */
export function getLastTakeBpm(): number | undefined {
  return lastTakeBpm
}

// --- Auto-stop on the recording session, from this module rather than
// recordingSession.ts, so the metronome owns its own lifecycle end to end.

let sessionWasRecording = false

function onSessionChange(): void {
  const session = getSessionState()
  if (session.status === 'recording') {
    if (!sessionWasRecording) {
      sessionWasRecording = true
      lastTakeBpm = state.running ? state.bpm : undefined
    }
  } else if (session.status === 'done') {
    sessionWasRecording = false
    stop()
  } else if (session.status === 'idle' || session.status === 'error') {
    sessionWasRecording = false
  }
}

subscribeSession(onSessionChange)

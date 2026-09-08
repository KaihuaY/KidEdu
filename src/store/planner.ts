import { useCallback, useEffect, useState } from 'react'
import type { ProfileProgress } from './progress'
import { isMissionDone } from './missions'

function daysFromMinutes(minutesRemaining: number, sessionMinutes: number): number {
  if (sessionMinutes <= 0) return Infinity
  return Math.ceil(minutesRemaining / sessionMinutes)
}

// ---------------------------------------------------------------------------
// Mission-based pacing (the current curriculum)
// ---------------------------------------------------------------------------

export interface HoldMissionsSpec {
  id: string
  missions: { id: string; estimatedMinutes: number }[]
}

/**
 * How much faster or slower than the estimates this kid tends to go, as a
 * multiplier: mean(actual minutes / estimated minutes) over every completed
 * mission that recorded real minutes. Needs at least 3 such samples to be
 * trusted (otherwise a single lucky/unlucky mission would swing every
 * estimate), and is clamped to 0.5x-2x so it can never send an estimate off
 * a cliff. Falls back to a neutral 1 (trust the raw estimates) below that.
 */
export function paceFactor(profile: ProfileProgress, holds: HoldMissionsSpec[]): number {
  const samples: number[] = []
  for (const hold of holds) {
    const holdProgress = profile.holds[hold.id]
    for (const mission of hold.missions) {
      if (mission.estimatedMinutes <= 0) continue
      const missionProgress = holdProgress?.missions?.[mission.id]
      if (!missionProgress?.completedAt || missionProgress.minutes <= 0) continue
      samples.push(missionProgress.minutes / mission.estimatedMinutes)
    }
  }
  if (samples.length < 3) return 1
  const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length
  return Math.max(0.5, Math.min(2, mean))
}

/** Total estimated minutes left to finish the given missions across the given holds. */
export function estimateMinutesRemaining(profile: ProfileProgress, holds: HoldMissionsSpec[]): number {
  let total = 0
  for (const hold of holds) {
    const holdProgress = profile.holds[hold.id]
    if (holdProgress?.masteredAt) continue
    for (const mission of hold.missions) {
      if (isMissionDone(holdProgress, mission.id)) continue
      total += mission.estimatedMinutes
    }
  }
  return Math.round(total * paceFactor(profile, holds))
}

/** Estimated number of practice sessions (at `sessionMinutes` each) left to finish. */
export function estimateDaysToSummit(profile: ProfileProgress, holds: HoldMissionsSpec[], sessionMinutes: number): number {
  return daysFromMinutes(estimateMinutesRemaining(profile, holds), sessionMinutes)
}

// ---------------------------------------------------------------------------
// Session timer
// ---------------------------------------------------------------------------

const SESSION_STORAGE_KEY = 'cubeclimb.session.timer'

interface StoredTimerState {
  accumulatedMs: number
  startedAt: number | null
}

function hasSessionStorage(): boolean {
  try {
    return typeof sessionStorage !== 'undefined'
  } catch {
    return false
  }
}

function readStoredTimer(): StoredTimerState {
  if (hasSessionStorage()) {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (raw) return JSON.parse(raw) as StoredTimerState
    } catch {
      // fall through to default
    }
  }
  return { accumulatedMs: 0, startedAt: null }
}

function writeStoredTimer(state: StoredTimerState): void {
  if (!hasSessionStorage()) return
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore - timer just won't survive a refresh
  }
}

export interface SessionTimer {
  elapsedSec: number
  running: boolean
  start: () => void
  pause: () => void
  reset: () => void
  reachedTarget: boolean
}

/**
 * A simple practice-session stopwatch. The start time (and accumulated time
 * across pauses) is kept in sessionStorage so a page refresh mid-session
 * doesn't lose progress, but a new tab/session starts fresh.
 */
export function useSessionTimer(targetMinutes: number): SessionTimer {
  const [timerState, setTimerState] = useState<StoredTimerState>(() => readStoredTimer())
  const [, setTick] = useState(0)

  const running = timerState.startedAt !== null

  // While running, force a re-render a few times a second so elapsedSec
  // (computed below from Date.now()) stays live.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [running])

  const start = useCallback(() => {
    setTimerState((prev) => {
      if (prev.startedAt !== null) return prev
      const next: StoredTimerState = { ...prev, startedAt: Date.now() }
      writeStoredTimer(next)
      return next
    })
  }, [])

  const pause = useCallback(() => {
    setTimerState((prev) => {
      if (prev.startedAt === null) return prev
      const next: StoredTimerState = {
        accumulatedMs: prev.accumulatedMs + (Date.now() - prev.startedAt),
        startedAt: null,
      }
      writeStoredTimer(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    const next: StoredTimerState = { accumulatedMs: 0, startedAt: null }
    writeStoredTimer(next)
    setTimerState(next)
  }, [])

  const elapsedMs =
    timerState.accumulatedMs + (timerState.startedAt !== null ? Date.now() - timerState.startedAt : 0)
  const elapsedSec = Math.floor(elapsedMs / 1000)

  return {
    elapsedSec,
    running,
    start,
    pause,
    reset,
    reachedTarget: elapsedSec >= targetMinutes * 60,
  }
}

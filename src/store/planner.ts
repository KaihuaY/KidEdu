import { useCallback, useEffect, useState } from 'react'
import type { ProfileProgress } from './progress'

// ---------------------------------------------------------------------------
// Pacing estimates
// ---------------------------------------------------------------------------

export type StageId = 'watch' | 'try' | 'spot' | 'climb'

/** Default minutes-per-stage, used until we have real per-kid data. */
export const STAGE_MINUTES: Record<StageId, number> = {
  watch: 2,
  try: 5,
  spot: 3,
  climb: 4,
}

const STAGE_IDS = Object.keys(STAGE_MINUTES) as StageId[]

function isStageId(id: string): id is StageId {
  return (STAGE_IDS as string[]).includes(id)
}

/**
 * Per-stage-type minute estimates for one profile: for each stage type, use
 * that profile's own average actual minutes once at least 2 completed
 * stages of that type exist, otherwise fall back to STAGE_MINUTES.
 */
export function personalPace(profile: ProfileProgress): Record<StageId, number> {
  const totals: Record<StageId, { sum: number; count: number }> = {
    watch: { sum: 0, count: 0 },
    try: { sum: 0, count: 0 },
    spot: { sum: 0, count: 0 },
    climb: { sum: 0, count: 0 },
  }

  for (const hold of Object.values(profile.holds)) {
    for (const [stageId, stage] of Object.entries(hold.stages)) {
      if (!isStageId(stageId)) continue
      if (stage.completedAt && stage.minutes > 0) {
        totals[stageId].sum += stage.minutes
        totals[stageId].count += 1
      }
    }
  }

  const result = {} as Record<StageId, number>
  for (const id of STAGE_IDS) {
    const t = totals[id]
    result[id] = t.count >= 2 ? t.sum / t.count : STAGE_MINUTES[id]
  }
  return result
}

export interface HoldStagesSpec {
  id: string
  stages: string[]
}

/** Total estimated minutes left to finish the given stages across the given holds. */
export function estimateMinutesRemaining(
  profile: ProfileProgress,
  holds: HoldStagesSpec[],
): number {
  const pace = personalPace(profile)
  let total = 0
  for (const hold of holds) {
    const holdProgress = profile.holds[hold.id]
    for (const stageId of hold.stages) {
      const stageProgress = holdProgress?.stages[stageId]
      if (stageProgress?.completedAt) continue
      total += isStageId(stageId) ? pace[stageId] : 0
    }
  }
  return total
}

/** Estimated number of practice sessions (at `sessionMinutes` each) left to finish. */
export function estimateDaysToSummit(
  profile: ProfileProgress,
  holds: HoldStagesSpec[],
  sessionMinutes: number,
): number {
  if (sessionMinutes <= 0) return Infinity
  const minutesRemaining = estimateMinutesRemaining(profile, holds)
  return Math.ceil(minutesRemaining / sessionMinutes)
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

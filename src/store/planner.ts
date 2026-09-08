import { useCallback, useEffect, useState } from 'react'
import type { ProfileProgress } from './progress'
import { isMissionDone } from './missions'

// ---------------------------------------------------------------------------
// Legacy Watch/Try/Spot/Climb pacing.
//
// @deprecated this whole section is superseded by the mission-based pacing
// below. It's kept only so old cached builds and the not-yet-migrated
// Wall.tsx / Lesson.tsx / content/lessons.ts keep compiling and behaving
// exactly as they did before the mission curriculum landed. Remove it once
// those call sites move onto HoldMissionsSpec (see this builder's report for
// the exact call sites to update).
// ---------------------------------------------------------------------------

/** @deprecated remove at integration */
export type StageId = 'learn' | 'watch' | 'try' | 'spot' | 'climb'

/** @deprecated remove at integration - default minutes-per-stage, used until we have real per-kid data. */
export const STAGE_MINUTES: Record<StageId, number> = {
  learn: 4,
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
 * @deprecated remove at integration
 * Per-stage-type minute estimates for one profile: for each stage type, use
 * that profile's own average actual minutes once at least 2 completed
 * stages of that type exist, otherwise fall back to STAGE_MINUTES.
 */
export function personalPace(profile: ProfileProgress): Record<StageId, number> {
  const totals: Record<StageId, { sum: number; count: number }> = {
    learn: { sum: 0, count: 0 },
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

/** @deprecated remove at integration - a hold described by its legacy Watch/Try/Spot/Climb stage ids. */
export interface HoldStagesSpec {
  id: string
  stages: string[]
}

/** @deprecated remove at integration - the pre-mission minutes-remaining estimate. Use estimateMinutesRemaining(profile, HoldMissionsSpec[]) instead. */
export function estimateMinutesRemainingLegacy(profile: ProfileProgress, holds: HoldStagesSpec[]): number {
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

function estimateMinutesRemainingMissions(profile: ProfileProgress, holds: HoldMissionsSpec[]): number {
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

/** Total estimated minutes left to finish the given missions across the given holds. */
export function estimateMinutesRemaining(profile: ProfileProgress, holds: HoldMissionsSpec[]): number
/** @deprecated remove at integration - pass HoldMissionsSpec[] instead; kept so Wall.tsx keeps compiling until it's migrated. */
export function estimateMinutesRemaining(profile: ProfileProgress, holds: HoldStagesSpec[]): number
export function estimateMinutesRemaining(
  profile: ProfileProgress,
  holds: HoldMissionsSpec[] | HoldStagesSpec[],
): number {
  if (holds.length === 0) return 0
  if ('missions' in holds[0]) return estimateMinutesRemainingMissions(profile, holds as HoldMissionsSpec[])
  return estimateMinutesRemainingLegacy(profile, holds as HoldStagesSpec[])
}

/** Estimated number of practice sessions (at `sessionMinutes` each) left to finish. */
export function estimateDaysToSummit(profile: ProfileProgress, holds: HoldMissionsSpec[], sessionMinutes: number): number
/** @deprecated remove at integration - pass HoldMissionsSpec[] instead; kept so Wall.tsx keeps compiling until it's migrated. */
export function estimateDaysToSummit(profile: ProfileProgress, holds: HoldStagesSpec[], sessionMinutes: number): number
export function estimateDaysToSummit(
  profile: ProfileProgress,
  holds: HoldMissionsSpec[] | HoldStagesSpec[],
  sessionMinutes: number,
): number {
  const minutesRemaining =
    holds.length === 0
      ? 0
      : 'missions' in holds[0]
        ? estimateMinutesRemainingMissions(profile, holds as HoldMissionsSpec[])
        : estimateMinutesRemainingLegacy(profile, holds as HoldStagesSpec[])
  return daysFromMinutes(minutesRemaining, sessionMinutes)
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

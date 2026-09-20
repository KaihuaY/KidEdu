// The AI coach: measures a finished take (src/audio/takeAnalysis.ts), asks
// Claude - through the parent's Apps Script, which holds the API key - to turn
// the measurements into two written notes (a short one for the kid, a fuller
// one for the grown-up), and falls back to built-in phrases whenever that is
// not possible. Text only: nothing here is ever read aloud.
//
// PUBLIC CONTRACT (screens import exactly these; keep the signatures):
//   useCoachStage(takeId)      -> where a take's feedback is in the pipeline
//   analyzeAndCoach(takeId, blob)  -> called once by recordingSession after a take is saved
//   requestFeedback(takeId, { force })  -> (re)write feedback for an already-measured take
//   requestJourney(pieceId, { force })  -> (re)write a piece's "how this song has grown" summary
//
// This file is a contract stub; Builder A replaces the bodies.

import { useSyncExternalStore } from 'react'

export type CoachStage = 'idle' | 'analyzing' | 'writing' | 'done' | 'failed'

const stages = new Map<string, CoachStage>()
const listeners = new Set<() => void>()

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** For the implementation: publish a take's pipeline stage to any mounted CoachCard. */
export function setCoachStage(takeId: string, stage: CoachStage): void {
  stages.set(takeId, stage)
  for (const l of listeners) l()
}

export function getCoachStage(takeId: string): CoachStage {
  return stages.get(takeId) ?? 'idle'
}

/** React hook: 'analyzing' while measuring, 'writing' while waiting for the coach text, then 'done' / 'failed'. */
export function useCoachStage(takeId: string): CoachStage {
  return useSyncExternalStore(
    subscribe,
    () => getCoachStage(takeId),
    () => getCoachStage(takeId),
  )
}

/** Measures the take and writes `take.ai` (metrics first, then the feedback text). Never throws. */
export async function analyzeAndCoach(takeId: string, blob: Blob): Promise<void> {
  void takeId
  void blob
}

/** Writes (or with `force`, rewrites) the feedback for a take that already has `ai.metrics`. Never throws. */
export async function requestFeedback(takeId: string, opts?: { force?: boolean }): Promise<void> {
  void takeId
  void opts
}

/** Writes (or with `force`, rewrites) the song-journey summary for one piece. Never throws. */
export async function requestJourney(pieceId: string, opts?: { force?: boolean }): Promise<void> {
  void pieceId
  void opts
}

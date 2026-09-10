// Pure piano reward/progress helpers, kept free of React and the progress
// store's `update()` so they're trivial to unit test and so
// src/store/piano.ts and every piano screen can share the exact same rules.

import type { ParentStars, PianoCountMode, PianoSection, PianoTake } from './progress'
import type { Tier } from './rewards'
import { dayOffset } from './sessions'

/** 1 star earns nothing extra, 2 stars a silver token, 3 stars gold. */
export function tokenForParentStars(stars: ParentStars): Tier | null {
  if (stars === 3) return 'gold'
  if (stars === 2) return 'silver'
  return null
}

/** The token tier awarded for reaching the daily piano goal. */
export const PIANO_GOAL_TIER: Tier = 'bronze'

/** All *practice* takes recorded on a given local day - a grown-up's voice note (`isNote`) is never one of them. */
export function takesForDay(takes: PianoTake[], day: string): PianoTake[] {
  return takes.filter((t) => t.day === day && !t.isNote)
}

/** Total "real playing" (mic-active) seconds for a given local day - shown to the parent even when the goal counts the whole recording. */
export function heardSecondsForDay(takes: PianoTake[], day: string): number {
  return takesForDay(takes, day).reduce((sum, t) => sum + t.activeSec, 0)
}

/** @deprecated Use `heardSecondsForDay` - kept as an alias while other code migrates off this name. */
export const activeSecondsForDay = heardSecondsForDay

/**
 * Seconds counted toward the daily piano goal, per `settings.pianoCountMode`:
 * `'recording'` (default) sums each take's whole wall-clock `durationSec`,
 * `'heard'` sums only mic-active `activeSec` (the old, stricter rule). A
 * grown-up's voice note is never counted either way (see `takesForDay`).
 */
export function practiceSecondsForDay(takes: PianoTake[], day: string, mode: PianoCountMode = 'recording'): number {
  const dayTakes = takesForDay(takes, day)
  return mode === 'heard'
    ? dayTakes.reduce((sum, t) => sum + t.activeSec, 0)
    : dayTakes.reduce((sum, t) => sum + t.durationSec, 0)
}

/** Whether `activeSec` of playing meets the daily goal. */
export function goalReached(activeSec: number, goalMinutes: number): boolean {
  return activeSec >= goalMinutes * 60
}

/** How full the day's ring should be, clamped to 0..1. */
export function goalProgress(activeSec: number, goalMinutes: number): number {
  const goalSec = goalMinutes * 60
  if (goalSec <= 0) return 1
  return Math.max(0, Math.min(1, activeSec / goalSec))
}

/**
 * Local days within the last `windowDays` (inclusive of `today`) that have
 * at least one take but no parent rating yet, newest first - the queue
 * `ParentReview` works through.
 */
export function daysNeedingParentRating(piano: PianoSection, today: string, windowDays = 14): string[] {
  const cutoff = dayOffset(today, -(windowDays - 1))
  const daysWithTakes = new Set<string>()
  for (const take of piano.takes) {
    if (take.isNote) continue
    if (take.day < cutoff || take.day > today) continue
    daysWithTakes.add(take.day)
  }
  return Array.from(daysWithTakes)
    .filter((day) => !piano.days[day]?.parentStars)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
}

/** "Steady beat" as 1-5 filled dots (●) out of 5, rest hollow (○) - `undefined` (too few onsets) renders nothing. */
export function steadyBeatDots(steadiness: number | undefined): string | null {
  if (steadiness === undefined) return null
  const filled = Math.max(1, Math.min(5, Math.round(steadiness * 5)))
  return '●'.repeat(filled) + '○'.repeat(5 - filled)
}

/** The set of local days on which the daily piano goal was reached. */
export function pianoDaysDone(piano: PianoSection): Set<string> {
  return new Set(Object.keys(piano.days).filter((day) => piano.days[day]?.goalReachedAt))
}

// Personal records for the piano: longest take, most playing in a day, most
// plays of one song in a day, longest streak. Pure functions over the takes
// (so past days count from day one), plus one store action that caches the
// result in `piano.records` and reports which records a fresh take just beat.

import { getDoc, update, useProgress, type PianoCountMode, type PianoTake, type RecordEntry, type Records, type Streak } from './progress'
import { practiceSecondsForDay } from './pianoRewards'

export type RecordKey = keyof Records

export const RECORD_KEYS: RecordKey[] = ['longestTakeSec', 'mostSecondsInDay', 'mostPlaysOfSong', 'longestStreakDays']

/** How many "plays" a take counts as: one, or her "+1 Played it" taps when she used them. */
export function playsInTake(take: PianoTake): number {
  return Math.max(1, take.repetitions ?? 0)
}

/** Computes every record from scratch. Notes (`isNote`) never count. */
export function computeRecords(takes: PianoTake[], streak: Streak, mode: PianoCountMode = 'recording', now: number = Date.now()): Records {
  const real = takes.filter((t) => !t.isNote)
  const out: Records = {}

  let longest: PianoTake | undefined
  for (const t of real) if (!longest || t.durationSec > longest.durationSec) longest = t
  if (longest && longest.durationSec > 0) {
    out.longestTakeSec = { value: Math.round(longest.durationSec), day: longest.day, takeId: longest.id, setAt: longest.startedAt || now }
  }

  const days = [...new Set(real.map((t) => t.day))].sort()
  let bestDay: RecordEntry | undefined
  for (const day of days) {
    const sec = Math.round(practiceSecondsForDay(real, day, mode))
    if (sec > 0 && (!bestDay || sec > bestDay.value)) bestDay = { value: sec, day, setAt: now }
  }
  if (bestDay) out.mostSecondsInDay = bestDay

  const plays = new Map<string, { count: number; day: string; pieceId: string }>()
  for (const t of real) {
    if (!t.pieceId) continue
    const key = `${t.day}|${t.pieceId}`
    const cur = plays.get(key) ?? { count: 0, day: t.day, pieceId: t.pieceId }
    cur.count += playsInTake(t)
    plays.set(key, cur)
  }
  let bestPlays: RecordEntry | undefined
  for (const p of [...plays.values()].sort((a, b) => a.day.localeCompare(b.day))) {
    if (p.count >= 2 && (!bestPlays || p.count > bestPlays.value)) bestPlays = { value: p.count, day: p.day, pieceId: p.pieceId, setAt: now }
  }
  if (bestPlays) out.mostPlaysOfSong = bestPlays

  if (streak.best > 0) out.longestStreakDays = { value: streak.best, day: streak.lastDay, setAt: now }
  return out
}

/** Records in `next` that are strictly better than in `prev` (a missing `prev` entry counts as beaten only when `prev` itself exists). */
export function beatenRecords(prev: Records | undefined, next: Records): RecordKey[] {
  if (!prev) return []
  return RECORD_KEYS.filter((k) => next[k] && (!prev[k] || next[k]!.value > prev[k]!.value))
}

/**
 * Recomputes the records after a take was saved and caches them. Returns the
 * keys that were just beaten so the done screen can celebrate. The very first
 * computation (no cached records yet) writes silently: nothing is "new" about
 * history she already had.
 */
export function updateRecords(): RecordKey[] {
  const doc = getDoc()
  const next = computeRecords(doc.piano.takes, doc.piano.streak, doc.settings.pianoCountMode ?? 'recording')
  const prev = doc.piano.records
  const beaten = beatenRecords(prev, next)
  const changed = !prev || RECORD_KEYS.some((k) => (prev[k]?.value ?? -1) !== (next[k]?.value ?? -1))
  if (!changed) return []
  // Keep the original setAt for records that did not move, so "since 12 Sep" stays truthful.
  const merged: Records = {}
  for (const k of RECORD_KEYS) {
    const n = next[k]
    if (!n) continue
    const p = prev?.[k]
    merged[k] = p && p.value === n.value ? p : n
  }
  update('piano', (piano) => ({ ...piano, records: merged }))
  return beaten
}

export function useRecords(): Records | undefined {
  return useProgress().piano.records
}

/** Kid-facing labels for each record. */
export const RECORD_LABELS: Record<RecordKey, { emoji: string; title: string }> = {
  longestTakeSec: { emoji: '⏱️', title: 'Longest take' },
  mostSecondsInDay: { emoji: '📅', title: 'Most playing in a day' },
  mostPlaysOfSong: { emoji: '🔁', title: 'Most plays of one song in a day' },
  longestStreakDays: { emoji: '🔥', title: 'Longest streak' },
}

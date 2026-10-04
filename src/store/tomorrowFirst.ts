// "Tomorrow, start with…" - a song she picks on the done screen to lead off
// the next day's practice. Pure store actions plus a once-per-local-day
// per-device claim so the app can apply the choice exactly once.

import { groupPieces, pieceStatus } from './songStats'
import { update, type PianoPiece, type PianoTake, type ProgressDoc } from './progress'
import { dayOffset } from './sessions'
import { kidKey } from './kid'

/** Sets tomorrow's first song; a no-op when it's already the same piece for the same day. */
export function setTomorrowFirst(pieceId: string, forDay: string): void {
  update('piano', (piano) => {
    if (piano.tomorrowFirst?.pieceId === pieceId && piano.tomorrowFirst?.forDay === forDay) return piano
    return { ...piano, tomorrowFirst: { pieceId, forDay, setAt: Date.now() } }
  })
}

/** The chosen piece for `day`, or undefined when nothing was chosen, the choice is stale, the piece is gone, or it's archived. */
export function tomorrowFirstFor(doc: ProgressDoc, day: string): PianoPiece | undefined {
  const choice = doc.piano.tomorrowFirst
  if (!choice || choice.forDay !== day) return undefined
  const piece = doc.settings.pianoPieces.find((p) => p.id === choice.pieceId)
  if (!piece || pieceStatus(piece) === 'archived') return undefined
  return piece
}

export interface TomorrowChoices {
  /** The few songs shown up front (at most `limit`). */
  top: PianoPiece[]
  /** Every other non-archived song, behind "More songs". */
  more: PianoPiece[]
}

/**
 * Which songs to offer for "Tomorrow, start with...": the most-played pieces
 * of the last 14 days (ties by week order), topped up from this week's pieces,
 * the current choice always included. Archived pieces are never offered. Pure.
 */
export function tomorrowChoices(
  pieces: PianoPiece[],
  takes: PianoTake[],
  today: string,
  chosenId: string | undefined,
  limit = 8,
): TomorrowChoices {
  const groups = groupPieces(pieces, takes)
  const ordered = [...groups.week, ...groups.more]
  const rank = new Map(ordered.map((p, i) => [p.id, i]))
  const since = dayOffset(today, -13)
  const counts = new Map<string, number>()
  for (const t of takes) {
    if (t.isNote || !t.pieceId || t.day < since || t.day > today) continue
    counts.set(t.pieceId, (counts.get(t.pieceId) ?? 0) + 1)
  }
  const played = ordered
    .filter((p) => (counts.get(p.id) ?? 0) > 0)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
  const top = played.slice(0, limit)
  for (const p of groups.week) {
    if (top.length >= limit) break
    if (!top.includes(p)) top.push(p)
  }
  const chosen = chosenId ? ordered.find((p) => p.id === chosenId) : undefined
  if (chosen && !top.includes(chosen) && limit > 0) {
    if (top.length >= limit) top[limit - 1] = chosen
    else top.push(chosen)
  }
  return { top, more: ordered.filter((p) => !top.includes(p)) }
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function firstSongAppliedKey(): string {
  return kidKey('cubeclimb.piano.firstSongApplied')
}

/** True once per local day per device: the first call on `day` returns true and remembers it. */
export function claimTomorrowFirstApply(day: string): boolean {
  if (!hasLocalStorage()) return true
  try {
    const already = localStorage.getItem(firstSongAppliedKey())
    if (already === day) return false
    localStorage.setItem(firstSongAppliedKey(), day)
    return true
  } catch {
    return true
  }
}

// "Tomorrow, start with…" - a song she picks on the done screen to lead off
// the next day's practice. Pure store actions plus a once-per-local-day
// per-device claim so the app can apply the choice exactly once.

import { pieceStatus } from './songStats'
import { update, type PianoPiece, type ProgressDoc } from './progress'
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

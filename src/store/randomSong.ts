// "Surprise song": the app picks a song at random from a parent-controlled
// list. A take recorded for the picked song (>= 20 s) counts; 10 in one day
// earns one gold box (once per day); the count resets every day because it is
// derived from today's takes. One re-spin per pick.

import { getDoc, update, type PianoPiece, type PianoTake, type ProgressDoc } from './progress'
import { pieceStatus } from './songStats'
import { grantTokens } from './piano'
import { awardNewBadges } from './badges'
import { kidKey } from './kid'

export const RANDOM_GOAL = 10
export const RANDOM_MIN_SECONDS = 20

/** Songs the grown-up put in the surprise list; archived ones are never picked. Order: as in settings. */
export function randomPool(pieces: PianoPiece[]): PianoPiece[] {
  return pieces.filter((p) => p.inRandom === true && pieceStatus(p) !== 'archived')
}

export function countsAsRandom(take: PianoTake): boolean {
  return take.random === true && !take.isNote && take.durationSec >= RANDOM_MIN_SECONDS
}

export function randomSongsDone(takes: PianoTake[], day: string): number {
  return takes.filter((t) => t.day === day && countsAsRandom(t)).length
}

export interface RandomStatus {
  poolSize: number
  done: number
  goal: number
  earned: boolean
}

export function randomStatus(doc: ProgressDoc, today: string): RandomStatus {
  return {
    poolSize: randomPool(doc.settings.pianoPieces ?? []).length,
    done: randomSongsDone(doc.piano.takes, today),
    goal: RANDOM_GOAL,
    earned: Boolean(doc.piano.days[today]?.randomGoldAt),
  }
}

function choose<T>(list: T[], rng: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
}

/**
 * Picks from the pool: prefers songs not yet counted as a surprise today (so she cycles the list before
 * repeating); never returns `previousId` when another choice exists. null for an empty pool. `rng` returns [0,1).
 */
export function pickRandom(
  pool: PianoPiece[],
  takes: PianoTake[],
  day: string,
  previousId: string | null,
  rng: () => number = Math.random,
): PianoPiece | null {
  if (pool.length === 0) return null
  const counted = new Set(takes.filter((t) => t.day === day && countsAsRandom(t)).map((t) => t.pieceId))
  const fresh = pool.filter((p) => !counted.has(p.id) && p.id !== previousId)
  if (fresh.length > 0) return choose(fresh, rng)
  const others = pool.filter((p) => p.id !== previousId)
  if (others.length > 0) {
    // Everything unseen is (at most) the previous song: cycle complete, so pick among the rest.
    const unseenOthers = others.filter((p) => !counted.has(p.id))
    return choose(unseenOthers.length > 0 ? unseenOthers : others, rng)
  }
  return pool[0]
}

/** The names that roll past on the reel, ending on `chosen` (last element). Length `length` (>= 8); neighbours never repeat when the pool has > 1 song. */
export function reelSequence(
  pool: PianoPiece[],
  chosen: PianoPiece,
  rng: () => number = Math.random,
  length = 24,
): PianoPiece[] {
  const n = Math.max(8, length)
  const seq: PianoPiece[] = new Array<PianoPiece>(n)
  seq[n - 1] = chosen
  for (let i = n - 2; i >= 0; i--) {
    const next = seq[i + 1]
    const options = pool.filter((p) => p.id !== next.id)
    seq[i] = options.length > 0 ? choose(options, rng) : next
  }
  return seq
}

// --- Device-only pick state ---------------------------------------------------

export interface RandomPick {
  day: string
  pieceId: string
  respinUsed: boolean
}

function pickKey(): string {
  return kidKey('cubeclimb.piano.randomPick')
}

function writePick(pick: RandomPick): void {
  try {
    localStorage.setItem(pickKey(), JSON.stringify(pick))
  } catch {
    // Storage unavailable - the pick just won't survive a reload.
  }
}

function readStoredPick(): RandomPick | null {
  try {
    const raw = localStorage.getItem(pickKey())
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<RandomPick> | null
    if (!v || typeof v.day !== 'string' || typeof v.pieceId !== 'string') return null
    return { day: v.day, pieceId: v.pieceId, respinUsed: v.respinUsed === true }
  } catch {
    return null
  }
}

export function readPick(today: string): RandomPick | null {
  const pick = readStoredPick()
  if (!pick || pick.day !== today) return null
  const pool = randomPool(getDoc().settings.pianoPieces ?? [])
  if (!pool.some((p) => p.id === pick.pieceId)) return null
  return pick
}

export function spin(today: string, rng: () => number = Math.random): RandomPick | null {
  const doc = getDoc()
  const pool = randomPool(doc.settings.pianoPieces ?? [])
  const prev = readStoredPick()
  const chosen = pickRandom(pool, doc.piano.takes, today, prev?.pieceId ?? null, rng)
  if (!chosen) return null
  const pick: RandomPick = { day: today, pieceId: chosen.id, respinUsed: false }
  writePick(pick)
  return pick
}

export function respin(today: string, rng: () => number = Math.random): RandomPick | null {
  const current = readPick(today)
  if (!current || current.respinUsed) return current
  const doc = getDoc()
  const pool = randomPool(doc.settings.pianoPieces ?? [])
  const chosen = pickRandom(pool, doc.piano.takes, today, current.pieceId, rng)
  if (!chosen) return current
  const pick: RandomPick = { day: today, pieceId: chosen.id, respinUsed: true }
  writePick(pick)
  return pick
}

export function clearPick(): void {
  try {
    localStorage.removeItem(pickKey())
  } catch {
    // Nothing to clear.
  }
}

/** When today's counted surprise songs reach RANDOM_GOAL and no gold was granted yet: stamps days[day].randomGoldAt, grants one gold token, runs awardNewBadges(). Checked BEFORE update() so a no-op never bumps updatedAt. Returns true only when it granted. */
export function awardRandomGoldIfReached(day: string): boolean {
  const doc = getDoc()
  if (doc.piano.days[day]?.randomGoldAt) return false
  if (randomSongsDone(doc.piano.takes, day) < RANDOM_GOAL) return false
  update('piano', (piano) => ({
    ...piano,
    days: { ...piano.days, [day]: { ...piano.days[day], randomGoldAt: Date.now() } },
  }))
  grantTokens({ gold: 1, silver: 0, bronze: 0 })
  awardNewBadges()
  return true
}

// ---------------------------------------------------------------------------
// One-shot request from the done screen's "Next surprise song" button: Piano
// home opens straight into a fresh spin. sessionStorage, so it never outlives
// the tab.
// ---------------------------------------------------------------------------

const FRESH_SPIN_FLAG = 'cubeclimb.piano.openSpin'

export function requestFreshSpin(): void {
  try {
    sessionStorage.setItem(FRESH_SPIN_FLAG, '1')
  } catch {
    // ignore - she can still tap "Surprise me" on Piano home
  }
}

/** True once after requestFreshSpin(); clears the request. */
export function takeFreshSpinRequest(): boolean {
  try {
    if (sessionStorage.getItem(FRESH_SPIN_FLAG) !== '1') return false
    sessionStorage.removeItem(FRESH_SPIN_FLAG)
    return true
  } catch {
    return false
  }
}

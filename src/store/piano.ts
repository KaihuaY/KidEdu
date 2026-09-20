// Actions on the `piano` section of the ProgressDoc, plus the local
// per-device id used to tell "recorded on this device" (with a playable
// local blob) apart from "recorded on another device" (metadata only).
// Mirrors the shape of src/store/sessions.ts: thin wrappers around
// `update()` plus one React hook.

import {
  getDoc,
  useProgress,
  update,
  type ParentStars,
  type PianoPiece,
  type PianoSection,
  type PianoTake,
  type PieceJourney,
  type SelfRating,
  type TakeCoach,
} from './progress'
import { bumpStreak, dayOffset, localDay } from './sessions'
import { xpForTier, type Tier } from './rewards'
import { goalReached, PIANO_GOAL_TIER, practiceSecondsForDay, tokenForParentStars } from './pianoRewards'
import { getRecordingStore } from './recordings'
import { awardBeads } from './collection'
import { randomBeadIds } from '../content/beads'

const DEVICE_ID_KEY = 'cubeclimb.deviceId'

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // fall through to the manual fallback below
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

let cachedDeviceId: string | null = null

/** A random id identifying this device/browser install, created once and persisted. */
export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId
  if (hasLocalStorage()) {
    try {
      const existing = localStorage.getItem(DEVICE_ID_KEY)
      if (existing) {
        cachedDeviceId = existing
        return existing
      }
      const created = randomId()
      localStorage.setItem(DEVICE_ID_KEY, created)
      cachedDeviceId = created
      return created
    } catch {
      // Storage disabled/full: fall through to an in-memory id below, which
      // just won't survive a reload.
    }
  }
  cachedDeviceId = randomId()
  return cachedDeviceId
}

/** How many days of take *metadata* to keep (the doc, not the audio - see recordingKeepDays for that). */
const TAKE_RETENTION_DAYS = 180

export function saveTake(take: PianoTake): void {
  update('piano', (piano) => {
    const cutoff = dayOffset(take.day, -(TAKE_RETENTION_DAYS - 1))
    // Drop metadata for takes older than the retention window, but never the
    // take being saved right now even if the clock is somehow off.
    const kept = piano.takes.filter((t) => t.day >= cutoff || t.day === take.day)
    return { ...piano, takes: [...kept, take] }
  })
}

export function setSelfRating(takeId: string, rating: SelfRating): void {
  update('piano', (piano) => ({
    ...piano,
    takes: piano.takes.map((t) => (t.id === takeId ? { ...t, selfRating: rating } : t)),
  }))
}

/** Writes a lazily-computed waveform back onto a saved take (see TakePlayer's one-time compute for old takes). */
export function setTakeWaveform(takeId: string, waveform: number[]): void {
  update('piano', (piano) => ({
    ...piano,
    takes: piano.takes.map((t) => (t.id === takeId ? { ...t, waveform } : t)),
  }))
}

/** Records whether she said she met her piece's goal for this take (see the Record.tsx done screen). */
export function setTakeGoalHit(takeId: string, goalHit: boolean): void {
  update('piano', (piano) => ({
    ...piano,
    takes: piano.takes.map((t) => (t.id === takeId ? { ...t, goalHit } : t)),
  }))
}

/**
 * Increments the "Played it! +1" count on a saved take and returns the new
 * total. Mirrors setSelfRating/setTakeGoalHit's shape - the live count kept
 * while a take is still recording (see src/audio/recordingSession.ts, which
 * owns that in-progress counter until the take is saved) is a separate,
 * module-local thing; this is the store-level action for a take that
 * already exists in `piano.takes`.
 */
export function bumpRepetition(takeId: string): number {
  const current = getDoc().piano.takes.find((t) => t.id === takeId)
  const next = (current?.repetitions ?? 0) + 1
  update('piano', (piano) => ({
    ...piano,
    takes: piano.takes.map((t) => (t.id === takeId ? { ...t, repetitions: next } : t)),
  }))
  return next
}

/** Total "Played it!" repetitions logged for one piece on one local day, across every non-note take that day. */
export function repetitionsForPiece(takes: PianoTake[], pieceId: string, day: string): number {
  return takes
    .filter((t) => t.day === day && t.pieceId === pieceId && !t.isNote)
    .reduce((sum, t) => sum + (t.repetitions ?? 0), 0)
}

/** Every piece with a "play it N times a day" target, and how she's doing against it today. */
export function songTargetsForDay(
  pieces: PianoPiece[],
  takes: PianoTake[],
  day: string,
): { piece: PianoPiece; done: number; target: number }[] {
  return pieces
    .filter((p) => (p.timesPerDay ?? 0) >= 1)
    .map((piece) => ({
      piece,
      done: repetitionsForPiece(takes, piece.id, day),
      target: piece.timesPerDay as number,
    }))
}

/** True once every piece with a target has reached it today - false when there are no targets at all. */
export function allSongTargetsMet(pieces: PianoPiece[], takes: PianoTake[], day: string): boolean {
  const targets = songTargetsForDay(pieces, takes, day)
  return targets.length > 0 && targets.every((t) => t.done >= t.target)
}

/**
 * Awards 2 beads for reaching one piece's daily repeat target, exactly once
 * per piece per local day. Returns the bead ids just awarded, or null
 * (writing nothing) when the piece has no target, the target isn't met yet,
 * or today's beads for this piece were already awarded - same "pre-check
 * before update()" rule as awardGoalIfReached: a no-op must never bump
 * piano.updatedAt.
 */
export function awardSongTargetBeadsIfReached(pieceId: string, day: string): string[] | null {
  const current = getDoc()
  const target = current.settings.pianoPieces.find((p) => p.id === pieceId)?.timesPerDay ?? 0
  if (target < 1) return null
  if (current.piano.days[day]?.songBeadsAwarded?.includes(pieceId)) return null
  if (repetitionsForPiece(current.piano.takes, pieceId, day) < target) return null

  const beadIds = randomBeadIds(2)
  update('piano', (piano) => ({
    ...piano,
    days: {
      ...piano.days,
      [day]: {
        ...piano.days[day],
        songBeadsAwarded: [...(piano.days[day]?.songBeadsAwarded ?? []), pieceId],
      },
    },
  }))
  awardBeads(beadIds)
  return beadIds
}

/** Marks the given takes' audio as pruned from local storage (called after RecordingStore.pruneOlderThan). */
export function markAudioPruned(takeIds: string[], at: number = Date.now()): void {
  if (takeIds.length === 0) return
  const idSet = new Set(takeIds)
  update('piano', (piano) => ({
    ...piano,
    takes: piano.takes.map((t) => (idSet.has(t.id) ? { ...t, hasAudio: false, audioPrunedAt: at } : t)),
  }))
}

/**
 * Awards the daily piano goal exactly once per local day: a bronze token
 * plus its XP to the kid profile, `days[day].goalReachedAt` stamped, and the
 * piano streak bumped. Returns true only when it actually awarded just now
 * (so the caller knows whether to celebrate).
 */
export function awardGoalIfReached(day: string, goalMinutes: number): boolean {
  // Checked before update() so a no-op never bumps piano.updatedAt, which
  // would needlessly out-rank another device's edits during a sync merge.
  const current = getDoc().piano
  if (current.days[day]?.goalReachedAt) return false
  const mode = getDoc().settings.pianoCountMode ?? 'recording'
  if (!goalReached(practiceSecondsForDay(current.takes, day, mode), goalMinutes)) return false

  update('piano', (piano) => ({
    ...piano,
    days: { ...piano.days, [day]: { ...piano.days[day], goalReachedAt: Date.now() } },
    streak: bumpStreak(piano.streak, day),
  }))
  update('profiles', (profiles) => ({
    ...profiles,
    kid: {
      ...profiles.kid,
      xp: profiles.kid.xp + xpForTier(PIANO_GOAL_TIER),
      tokens: { ...profiles.kid.tokens, [PIANO_GOAL_TIER]: profiles.kid.tokens[PIANO_GOAL_TIER] + 1 },
    },
  }))
  return true
}

/**
 * Records the parent's 1-3 star rating for a day, once per day. 2 stars
 * awards a silver token, 3 gold, 1 nothing extra - Nora's self-rating never
 * affects tokens, only this. Returns the tier awarded (or null for 1 star /
 * no token), and returns null *without changing anything* if that day was
 * already rated.
 */
export function setParentStars(day: string, stars: ParentStars): Tier | null {
  // Same pre-check as awardGoalIfReached: no doc write unless something changes.
  if (getDoc().piano.days[day]?.parentStars) return null
  update('piano', (piano) => ({
    ...piano,
    days: { ...piano.days, [day]: { ...piano.days[day], parentStars: stars, parentRatedAt: Date.now() } },
  }))

  const tier = tokenForParentStars(stars)
  if (tier) {
    update('profiles', (profiles) => ({
      ...profiles,
      kid: {
        ...profiles.kid,
        tokens: { ...profiles.kid.tokens, [tier]: profiles.kid.tokens[tier] + 1 },
      },
    }))
  }
  return tier
}

export function usePiano(): PianoSection {
  return useProgress().piano
}

/** Removes local audio older than `keepDays` and marks the matching takes pruned. Safe to call repeatedly. */
export async function pruneRecordings(keepDays: number): Promise<void> {
  const cutoff = Date.now() - keepDays * 86_400_000
  const removedIds = await getRecordingStore().pruneOlderThan(cutoff)
  markAudioPruned(removedIds)
  slimOldTakes(localDay())
}

// ---------------------------------------------------------------------------
// AI coach (round 7): measurements + written feedback per take, and a
// written "how this song has grown" summary per piece. See src/store/coach.ts
// for the pipeline that calls these.
// ---------------------------------------------------------------------------

/** A shallow copy of `t` with its `onsets` field removed. */
function dropOnsets(t: PianoTake): PianoTake {
  const next = { ...t }
  delete next.onsets
  return next
}

/**
 * Merges `ai` onto a take's `ai` field (so a call that only carries the
 * measured metrics, followed later by one that adds the written feedback,
 * combines rather than clobbers). Once the merged `ai` has `metrics`, this
 * also drops the take's raw `onsets` - the offline metrics supersede them,
 * and `onsets` is the bulk of what would otherwise sync in the doc.
 */
export function setTakeAi(takeId: string, ai: TakeCoach): void {
  update('piano', (piano) => ({
    ...piano,
    takes: piano.takes.map((t) => {
      if (t.id !== takeId) return t
      const merged: TakeCoach = { ...t.ai, ...ai }
      const base = merged.metrics ? dropOnsets(t) : t
      return { ...base, ai: merged }
    }),
  }))
}

/** Writes (or overwrites, on a `force` re-run) the written "song journey" summary for one piece. */
export function setJourney(pieceId: string, journey: PieceJourney): void {
  update('piano', (piano) => ({
    ...piano,
    journeys: { ...piano.journeys, [pieceId]: journey },
  }))
}

/** How many days of a take's `waveform` to keep before TakePlayer just recomputes it lazily from the (still-local) audio. */
const WAVEFORM_KEEP_DAYS = 14

/**
 * Drops the `waveform` array from takes older than WAVEFORM_KEEP_DAYS days,
 * relative to local day `today`. Checked before `update()` so a no-op (no
 * take actually had a stale waveform to drop) never bumps `piano.updatedAt` -
 * same rule as awardGoalIfReached.
 */
export function slimOldTakes(today: string): void {
  const cutoff = dayOffset(today, -WAVEFORM_KEEP_DAYS)
  const current = getDoc().piano
  const hasStaleWaveform = current.takes.some((t) => t.day < cutoff && t.waveform !== undefined)
  if (!hasStaleWaveform) return

  update('piano', (piano) => ({
    ...piano,
    takes: piano.takes.map((t) => {
      if (t.day >= cutoff || t.waveform === undefined) return t
      const next = { ...t }
      delete next.waveform
      return next
    }),
  }))
}

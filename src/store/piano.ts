// Actions on the `piano` section of the ProgressDoc, plus the local
// per-device id used to tell "recorded on this device" (with a playable
// local blob) apart from "recorded on another device" (metadata only).
// Mirrors the shape of src/store/sessions.ts: thin wrappers around
// `update()` plus one React hook.

import { useProgress, update, type ParentStars, type PianoSection, type PianoTake, type SelfRating } from './progress'
import { bumpStreak } from './sessions'
import { xpForTier, type Tier } from './rewards'
import { activeSecondsForDay, goalReached, PIANO_GOAL_TIER, tokenForParentStars } from './pianoRewards'
import { getRecordingStore } from './recordings'

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

export function saveTake(take: PianoTake): void {
  update('piano', (piano) => ({ ...piano, takes: [...piano.takes, take] }))
}

export function setSelfRating(takeId: string, rating: SelfRating): void {
  update('piano', (piano) => ({
    ...piano,
    takes: piano.takes.map((t) => (t.id === takeId ? { ...t, selfRating: rating } : t)),
  }))
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
  let awarded = false
  update('piano', (piano) => {
    if (piano.days[day]?.goalReachedAt) return piano
    const activeSec = activeSecondsForDay(piano.takes, day)
    if (!goalReached(activeSec, goalMinutes)) return piano
    awarded = true
    return {
      ...piano,
      days: { ...piano.days, [day]: { ...piano.days[day], goalReachedAt: Date.now() } },
      streak: bumpStreak(piano.streak, day),
    }
  })
  if (awarded) {
    update('profiles', (profiles) => ({
      ...profiles,
      kid: {
        ...profiles.kid,
        xp: profiles.kid.xp + xpForTier(PIANO_GOAL_TIER),
        tokens: { ...profiles.kid.tokens, [PIANO_GOAL_TIER]: profiles.kid.tokens[PIANO_GOAL_TIER] + 1 },
      },
    }))
  }
  return awarded
}

/**
 * Records the parent's 1-3 star rating for a day, once per day. 2 stars
 * awards a silver token, 3 gold, 1 nothing extra - Nora's self-rating never
 * affects tokens, only this. Returns the tier awarded (or null for 1 star /
 * no token), and returns null *without changing anything* if that day was
 * already rated.
 */
export function setParentStars(day: string, stars: ParentStars): Tier | null {
  let alreadyRated = false
  update('piano', (piano) => {
    if (piano.days[day]?.parentStars) {
      alreadyRated = true
      return piano
    }
    return {
      ...piano,
      days: { ...piano.days, [day]: { ...piano.days[day], parentStars: stars, parentRatedAt: Date.now() } },
    }
  })
  if (alreadyRated) return null

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
}

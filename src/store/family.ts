// The "family board": a friendly cross-device summary of both kids'
// progress. Each device only ever writes its own kid's ProgressDoc (see
// progress.ts / gistSync.ts) - what it knows about the *other* kid is
// whatever gistSync last read out of that kid's file in the shared gist,
// handed over here via setRemoteKid(). This module never merges or mutates
// another kid's document, it only mirrors it for display.

import { useSyncExternalStore } from 'react'
import { DEFAULT_KID, getKid, kidDisplayName, type KidId } from './kid'
import { useProgress, type ProgressDoc } from './progress'
import { lastNDays, localDay } from './sessions'
import { practiceSecondsForDay } from './pianoRewards'
import { ALL_MISSION_IDS } from '../content/lessons'

export interface KidSummary {
  cubeStreak: number
  pianoStreak: number
  missionsDone: number
  missionsTotal: number
  xp: number
  badges: number
  pianoMinutesThisWeek: number
  songsMetThisWeek: number
  cardsOwned: number
  beads: number
  braceletsFinished: number
  /** Local YYYY-MM-DD of the most recent cube/piano activity, or null if none yet. */
  lastActiveDay: string | null
}

export interface FamilyMember {
  id: KidId
  name: string
  summary: KidSummary
  updatedAt: number
  /** True for the kid this device belongs to. */
  self: boolean
}

const MISSIONS_TOTAL = ALL_MISSION_IDS.length

/** A day field that might not exist yet in a doc synced from an older build. */
type LooseSongDay = { songBeadsAwarded?: unknown }

function maxDay(days: (string | null | undefined)[]): string | null {
  let max: string | null = null
  for (const day of days) {
    if (day && (max === null || day > max)) max = day
  }
  return max
}

/**
 * Pure summary of a ProgressDoc for the family board. Never touches
 * storage/network - safe to call on a doc that just arrived from sync.
 */
export function summarize(doc: ProgressDoc, today: string = localDay()): KidSummary {
  const profile = doc.profiles.kid
  let missionsDone = 0
  for (const hold of Object.values(profile.holds)) {
    for (const mission of Object.values(hold.missions ?? {})) {
      if (mission.completedAt) missionsDone += 1
    }
  }

  const mode = doc.settings.pianoCountMode ?? 'recording'
  const days = lastNDays(7, today)
  let pianoSecondsThisWeek = 0
  let songsMetThisWeek = 0
  for (const day of days) {
    pianoSecondsThisWeek += practiceSecondsForDay(doc.piano.takes, day, mode)
    const pianoDay = doc.piano.days[day] as LooseSongDay | undefined
    const awarded = pianoDay?.songBeadsAwarded
    if (Array.isArray(awarded) && awarded.length > 0) songsMetThisWeek += 1
  }

  let beads = 0
  for (const n of Object.values(doc.collection.beads)) beads += n
  const braceletsFinished = doc.collection.bracelets.filter((b) => b.finishedAt).length

  const lastTakeDay = maxDay(doc.piano.takes.map((t) => t.day))
  const lastActiveDay = maxDay([profile.streak.lastDay, doc.piano.streak.lastDay, lastTakeDay])

  return {
    cubeStreak: profile.streak.current,
    pianoStreak: doc.piano.streak.current,
    missionsDone,
    missionsTotal: MISSIONS_TOTAL,
    xp: profile.xp,
    badges: doc.rewards.badges?.length ?? 0,
    pianoMinutesThisWeek: Math.round(pianoSecondsThisWeek / 60),
    songsMetThisWeek,
    cardsOwned: doc.collection.items.length,
    beads,
    braceletsFinished,
    lastActiveDay,
  }
}

// ---------------------------------------------------------------------------
// Remote-kid store: what sync last saw for every kid other than this
// device's own. useSyncExternalStore pattern, same shape as gistSync's
// status observable.
// ---------------------------------------------------------------------------

export interface RemoteEntry {
  doc: ProgressDoc
  updatedAt: number
}

let remoteKids: ReadonlyMap<KidId, RemoteEntry> = new Map()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function getRemoteSnapshot(): ReadonlyMap<KidId, RemoteEntry> {
  return remoteKids
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/**
 * Records the latest doc gistSync read for some OTHER kid than this device's
 * own (never called for this device's own kid - that one always comes live
 * from useProgress()). `updatedAt` is the gist file's own last-modified
 * time, used only to tell "we've heard from her at least once" apart from
 * "never synced".
 */
export function setRemoteKid(id: KidId, doc: ProgressDoc, updatedAt: number): void {
  const next = new Map(remoteKids)
  next.set(id, { doc, updatedAt })
  remoteKids = next
  notify()
}

/** The last-synced doc for some OTHER kid, without a hook - used by tests and by useFamily() itself. */
export function getRemoteKid(id: KidId): RemoteEntry | undefined {
  return remoteKids.get(id)
}

/** Test/dev helper: forgets every remote kid this device has heard from. */
export function clearRemoteKids(): void {
  remoteKids = new Map()
  notify()
}

function useRemoteKids(): ReadonlyMap<KidId, RemoteEntry> {
  return useSyncExternalStore(subscribe, getRemoteSnapshot, getRemoteSnapshot)
}

/**
 * The family board's data: this device's own kid (computed live from
 * useProgress()) plus every other kid this device has heard about from
 * sync, sorted with Nora first. A kid nobody has synced from yet simply
 * doesn't appear in the list - callers show a "waiting for her first
 * practice" placeholder for any KID_NAMES entry missing from here.
 */
export function useFamily(): FamilyMember[] {
  const ownDoc = useProgress()
  const remote = useRemoteKids()
  const ownId = getKid()

  const members: FamilyMember[] = [
    {
      id: ownId,
      name: kidDisplayName(ownId),
      summary: summarize(ownDoc),
      // Derived from the doc itself (not Date.now()) so this stays a pure
      // function of props/state, not a fresh value on every render.
      updatedAt: Math.max(ownDoc.profiles.updatedAt, ownDoc.piano.updatedAt),
      self: true,
    },
  ]
  for (const [id, entry] of remote) {
    if (id === ownId) continue
    members.push({
      id,
      name: kidDisplayName(id),
      summary: summarize(entry.doc),
      updatedAt: entry.updatedAt,
      self: false,
    })
  }

  return members.sort((a, b) => (a.id === DEFAULT_KID ? -1 : b.id === DEFAULT_KID ? 1 : 0))
}

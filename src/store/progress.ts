import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Prize {
  id: string
  name: string
  emoji: string
  weight: number
}

export interface Settings {
  kidName: string
  parentName: string
  pin: string
  sessionMinutes: number
  prizePools: {
    gold: Prize[]
    silver: Prize[]
    bronze: Prize[]
  }
  /** Probability (0-1) that opening a box of this tier also awards a ticket. */
  ticketChance: {
    gold: number
    silver: number
    bronze: number
  }
  updatedAt: number
}

export interface StageProgress {
  bestTries: number | null
  stars: 0 | 1 | 2 | 3
  attempts: number
  minutes: number
  completedAt?: number
}

export interface HoldProgress {
  stages: Record<string, StageProgress>
  masteredAt?: number
}

export interface Session {
  day: string // YYYY-MM-DD
  minutes: number
  stagesDone: number
}

export interface Streak {
  current: number
  best: number
  lastDay: string // YYYY-MM-DD
}

export interface ProfileProgress {
  holds: Record<string, HoldProgress>
  xp: number
  tokens: { gold: number; silver: number; bronze: number }
  sessions: Session[]
  streak: Streak
}

export interface Profiles {
  kid: ProfileProgress
  parent: ProfileProgress
  updatedAt: number
}

export interface Sticker {
  id: string
  kind: 'emoji' | 'image'
  value: string
  rarity: 'common' | 'rare'
  wonAt: number
}

export interface CustomSticker {
  id: string
  name: string
  dataUrl: string
}

export interface Ticket {
  id: string
  prizeId: string
  name: string
  emoji: string
  tier: 'gold' | 'silver' | 'bronze'
  wonAt: number
  redeemedAt?: number
}

export interface BoxHistoryEntry {
  tier: 'gold' | 'silver' | 'bronze'
  openedAt: number
  result: string
}

export interface Rewards {
  stickers: Sticker[]
  customStickers: CustomSticker[]
  tickets: Ticket[]
  boxHistory: BoxHistoryEntry[]
  updatedAt: number
}

export interface SolveEntry {
  at: number
  seconds: number | null
  profile: 'kid' | 'parent'
}

export interface SolveLog {
  solves: SolveEntry[]
  updatedAt: number
}

export interface ProgressDoc {
  schemaVersion: 1
  settings: Settings
  profiles: Profiles
  rewards: Rewards
  solveLog: SolveLog
}

export type SectionKey = 'settings' | 'profiles' | 'rewards' | 'solveLog'

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function prize(id: string, name: string, emoji: string, weight = 1): Prize {
  return { id, name, emoji, weight }
}

function emptyProfile(): ProfileProgress {
  return {
    holds: {},
    xp: 0,
    tokens: { gold: 0, silver: 0, bronze: 0 },
    sessions: [],
    streak: { current: 0, best: 0, lastDay: '' },
  }
}

export function defaultDoc(): ProgressDoc {
  const now = Date.now()
  return {
    schemaVersion: 1,
    settings: {
      kidName: 'Nora',
      parentName: 'Coach',
      pin: '1234',
      sessionMinutes: 10,
      prizePools: {
        gold: [
          prize('gold-cash-5', '$5', '💵'),
          prize('gold-dinner', 'Choose dinner', '🍕'),
          prize('gold-movie-night', 'Movie night', '🎬'),
        ],
        silver: [
          prize('silver-cash-1', '$1', '💵'),
          prize('silver-snack', 'Snack', '🍪'),
          prize('silver-story', 'Extra story', '📖'),
        ],
        bronze: [
          prize('bronze-high-five', 'High five', '🙌'),
          prize('bronze-sticker', 'Sticker', '⭐'),
          prize('bronze-dance-party', 'Dance party', '💃'),
        ],
      },
      ticketChance: { gold: 1, silver: 0.6, bronze: 0.3 },
      updatedAt: now,
    },
    profiles: {
      kid: emptyProfile(),
      parent: emptyProfile(),
      updatedAt: now,
    },
    rewards: {
      stickers: [],
      customStickers: [],
      tickets: [],
      boxHistory: [],
      updatedAt: now,
    },
    solveLog: {
      solves: [],
      updatedAt: now,
    },
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'cubeclimb.progress'

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

/**
 * Fills in a profile's nested fields (tokens/streak in particular) from a
 * default profile, so a doc saved before one of those fields existed - or a
 * profile object that only partially round-tripped through a merge/import -
 * doesn't leave `undefined` where every screen assumes a value is present.
 */
function normalizeProfile(fallback: ProfileProgress, parsed: Partial<ProfileProgress> | undefined): ProfileProgress {
  return {
    ...fallback,
    ...parsed,
    tokens: { ...fallback.tokens, ...parsed?.tokens },
    streak: { ...fallback.streak, ...parsed?.streak },
  }
}

/**
 * Backfills any field added to the schema after a doc was first persisted,
 * without bumping schemaVersion (schemaVersion covers *shape-breaking*
 * changes; new optional-in-spirit fields with sane defaults are handled
 * here instead so old saves keep working).
 */
function normalizeDoc(parsed: Partial<ProgressDoc>): ProgressDoc {
  const fallback = defaultDoc()
  return {
    ...fallback,
    ...parsed,
    settings: {
      ...fallback.settings,
      ...parsed.settings,
      prizePools: { ...fallback.settings.prizePools, ...parsed.settings?.prizePools },
      ticketChance: { ...fallback.settings.ticketChance, ...parsed.settings?.ticketChance },
    },
    profiles: {
      ...fallback.profiles,
      ...parsed.profiles,
      kid: normalizeProfile(fallback.profiles.kid, parsed.profiles?.kid),
      parent: normalizeProfile(fallback.profiles.parent, parsed.profiles?.parent),
    },
    rewards: { ...fallback.rewards, ...parsed.rewards },
    solveLog: { ...fallback.solveLog, ...parsed.solveLog },
  }
}

/**
 * Like defaultDoc(), but every section is stamped `updatedAt: 0` instead of
 * "now". Used whenever this device has no real saved progress to speak of
 * (nothing in storage, or what was there didn't parse). A blank doc has no
 * actual edit for mergeDocs to protect, so it must never outrank genuine
 * progress pulled down from a synced gist - which is exactly what would
 * happen if these all-defaults sections got a fresh Date.now() merely for
 * having been constructed just now (see mergeDocs / gistSync.ts).
 */
function neverEditedDoc(): ProgressDoc {
  const fresh = defaultDoc()
  return {
    ...fresh,
    settings: { ...fresh.settings, updatedAt: 0 },
    profiles: { ...fresh.profiles, updatedAt: 0 },
    rewards: { ...fresh.rewards, updatedAt: 0 },
    solveLog: { ...fresh.solveLog, updatedAt: 0 },
  }
}

function loadInitialDoc(): ProgressDoc {
  if (!hasLocalStorage()) return neverEditedDoc()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return neverEditedDoc()
    const parsed = JSON.parse(raw) as Partial<ProgressDoc>
    if (!parsed || parsed.schemaVersion !== 1) return neverEditedDoc()
    return normalizeDoc(parsed)
  } catch {
    return neverEditedDoc()
  }
}

let doc: ProgressDoc = loadInitialDoc()
const listeners = new Set<() => void>()

function persist(): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
  } catch {
    // Storage can be full or disabled (private browsing); progress just
    // won't survive a reload in that case, which is an acceptable fallback.
  }
}

function notify(): void {
  for (const listener of listeners) listener()
}

export function getDoc(): ProgressDoc {
  return doc
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** React hook: re-renders whenever any section of the doc changes. */
export function useProgress(): ProgressDoc {
  return useSyncExternalStore(subscribe, getDoc, getDoc)
}

/**
 * Updates one top-level section of the doc. `fn` receives the section's
 * current value and returns the next value; `updatedAt` is stamped
 * automatically (overwriting anything `fn` sets on it).
 */
export function update<K extends SectionKey>(
  section: K,
  fn: (current: ProgressDoc[K]) => ProgressDoc[K],
): void {
  const next = { ...fn(doc[section]), updatedAt: Date.now() } as ProgressDoc[K]
  doc = { ...doc, [section]: next }
  persist()
  notify()
}

/**
 * Merges two docs section-by-section: whichever side has the newer
 * `updatedAt` for a given section wins outright (sections are not merged
 * field-by-field - each section is a single unit). This keeps sync simple:
 * two devices editing *different* sections both survive; editing the *same*
 * section concurrently means the loser's edits to that section are dropped,
 * but nothing from other sections is ever lost.
 */
export function mergeDocs(local: ProgressDoc, remote: ProgressDoc): ProgressDoc {
  return {
    schemaVersion: 1,
    settings: remote.settings.updatedAt > local.settings.updatedAt ? remote.settings : local.settings,
    profiles: remote.profiles.updatedAt > local.profiles.updatedAt ? remote.profiles : local.profiles,
    rewards: remote.rewards.updatedAt > local.rewards.updatedAt ? remote.rewards : local.rewards,
    solveLog: remote.solveLog.updatedAt > local.solveLog.updatedAt ? remote.solveLog : local.solveLog,
  }
}

export function exportJson(): string {
  return JSON.stringify(doc, null, 2)
}

/** Replaces the whole doc from a previously-exported JSON string. */
export function importJson(text: string): void {
  const parsed = JSON.parse(text) as Partial<ProgressDoc>
  if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1) {
    throw new Error('Unrecognized CubeClimb progress file')
  }
  doc = normalizeDoc(parsed)
  persist()
  notify()
}

export function resetAll(): void {
  doc = defaultDoc()
  persist()
  notify()
}

import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Prize {
  id: string
  name: string
  emoji: string
  weight: number
  /** When 'cash', this prize pays out a random amount instead of a fixed reward. */
  kind?: 'cash'
  /** Cash prize range, in whole cents. Only meaningful when kind === 'cash'. */
  minCents?: number
  maxCents?: number
}

export type ActivityId = 'cube' | 'piano'

export interface PianoPiece {
  id: string
  name: string
  emoji: string
}

export interface Settings {
  kidName: string
  parentName: string
  pin: string
  /** Kept as a mirror of goalMinutes.cube, for old cached builds that only know this field. */
  sessionMinutes: number
  goalMinutes: Record<ActivityId, number>
  pianoPieces: PianoPiece[]
  /** How many days of local audio to keep before pruning. */
  recordingKeepDays: number
  /** Parent-entered once, synced via the private gist. Undefined = uploads off. */
  driveUpload?: { scriptUrl: string; secret: string; folderName: string }
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
  /** Set when this ticket was won from a cash prize; the actual rolled amount, in cents. */
  amountCents?: number
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

export type SelfRating = 1 | 2 | 3 // 😕 🙂 🤩
export type ParentStars = 1 | 2 | 3

export interface PianoTake {
  id: string
  day: string // local YYYY-MM-DD
  pieceId: string | null
  startedAt: number
  durationSec: number
  activeSec: number
  selfRating?: SelfRating
  mimeType: string
  sizeBytes: number
  hasAudio: boolean
  audioPrunedAt?: number
  deviceId: string
  upload?: {
    status: 'pending' | 'uploading' | 'done' | 'failed'
    attempts: number
    driveFileId?: string
    driveUrl?: string
    lastError?: string
    updatedAt: number
  }
}

export interface PianoDay {
  goalReachedAt?: number
  parentStars?: ParentStars
  parentRatedAt?: number
}

export interface PianoSection {
  takes: PianoTake[]
  days: Record<string, PianoDay>
  streak: Streak
  updatedAt: number
}

export interface ProgressDoc {
  schemaVersion: 1
  settings: Settings
  profiles: Profiles
  rewards: Rewards
  solveLog: SolveLog
  piano: PianoSection
}

export type SectionKey = 'settings' | 'profiles' | 'rewards' | 'solveLog' | 'piano'

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function prize(id: string, name: string, emoji: string, weight = 1): Prize {
  return { id, name, emoji, weight }
}

/** The gold-tier cash surprise: a random amount between $0.25 and $1.00. */
function goldCashPrize(weight = 1): Prize {
  return { id: 'gold-cash', name: 'Cash surprise', emoji: '💵', weight, kind: 'cash', minCents: 25, maxCents: 100 }
}

/** The silver-tier cash surprise: a random amount between $0.05 and $1.00. */
function silverCashPrize(weight = 1): Prize {
  return { id: 'silver-cash', name: 'Cash surprise', emoji: '💵', weight, kind: 'cash', minCents: 5, maxCents: 100 }
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

/** An empty piano section stamped with the given `updatedAt` (0 for "never edited on this device"). */
export function emptyPiano(updatedAt: number): PianoSection {
  return {
    takes: [],
    days: {},
    streak: { current: 0, best: 0, lastDay: '' },
    updatedAt,
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
      goalMinutes: { cube: 10, piano: 15 },
      pianoPieces: [],
      recordingKeepDays: 14,
      prizePools: {
        gold: [
          goldCashPrize(),
          prize('gold-dinner', 'Choose dinner', '🍕'),
          prize('gold-movie-night', 'Movie night', '🎬'),
        ],
        silver: [
          silverCashPrize(),
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
    piano: emptyPiano(now),
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

/** True for a prize that predates cash-surprise ranges: the old fixed-dollar prizes. */
function isLegacyFixedCashPrize(p: Prize): boolean {
  return p.id === 'gold-cash-5' || p.id === 'silver-cash-1' || /^\$\d+$/.test(p.name)
}

/**
 * Migrates a saved prize pool so any old fixed-dollar prize ($5, $1, or any
 * prize carrying one of their legacy ids/names) becomes the tier's cash
 * surprise, preserving the pool's own weight for that slot. Prizes that are
 * already a cash prize (or never were a dollar prize) pass through as-is.
 */
function migratePrizePool(pool: Prize[], tier: 'gold' | 'silver' | 'bronze'): Prize[] {
  return pool.map((p) => {
    if (p.kind === 'cash' || !isLegacyFixedCashPrize(p)) return p
    return tier === 'gold' ? goldCashPrize(p.weight) : silverCashPrize(p.weight)
  })
}

/**
 * Fills in a piano section's nested fields from a blank piano section, so a
 * doc saved before `piano` existed - or one that only partially round-tripped
 * through a merge/import - doesn't leave `undefined` where every screen
 * assumes a value is present. A piano section that's missing outright
 * defaults to `emptyPiano(0)`, never `Date.now()` - see neverEditedDoc().
 */
function normalizePiano(parsed: Partial<PianoSection> | undefined): PianoSection {
  const fallback = emptyPiano(0)
  return {
    ...fallback,
    ...parsed,
    takes: parsed?.takes ?? fallback.takes,
    days: { ...fallback.days, ...parsed?.days },
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
  const mergedPrizePools = { ...fallback.settings.prizePools, ...parsed.settings?.prizePools }
  // A legacy doc only ever had `sessionMinutes`; goalMinutes.cube inherits it
  // (piano keeps the default) so an old cached build's edits aren't lost.
  const goalMinutes = parsed.settings?.goalMinutes
    ? { ...fallback.settings.goalMinutes, ...parsed.settings.goalMinutes }
    : { cube: parsed.settings?.sessionMinutes ?? fallback.settings.goalMinutes.cube, piano: fallback.settings.goalMinutes.piano }
  return {
    ...fallback,
    ...parsed,
    settings: {
      ...fallback.settings,
      ...parsed.settings,
      goalMinutes,
      // Mirror goalMinutes.cube so old cached builds that only read
      // sessionMinutes keep working until they update.
      sessionMinutes: goalMinutes.cube,
      pianoPieces: parsed.settings?.pianoPieces ?? fallback.settings.pianoPieces,
      recordingKeepDays: parsed.settings?.recordingKeepDays ?? fallback.settings.recordingKeepDays,
      prizePools: {
        gold: migratePrizePool(mergedPrizePools.gold, 'gold'),
        silver: migratePrizePool(mergedPrizePools.silver, 'silver'),
        bronze: migratePrizePool(mergedPrizePools.bronze, 'bronze'),
      },
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
    piano: normalizePiano(parsed.piano),
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
    piano: emptyPiano(0),
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
 * Picks whichever of two sections has the newer `updatedAt`, local wins
 * ties. `remote` may be `undefined` - a doc uploaded by an old build that
 * predates this section (e.g. `piano` before it existed) - in which case
 * `local` always wins outright.
 */
function newer<T extends { updatedAt: number }>(local: T, remote: T | undefined): T {
  if (!remote) return local
  return remote.updatedAt > local.updatedAt ? remote : local
}

/**
 * Merges two docs section-by-section: whichever side has the newer
 * `updatedAt` for a given section wins outright (sections are not merged
 * field-by-field - each section is a single unit). This keeps sync simple:
 * two devices editing *different* sections both survive; editing the *same*
 * section concurrently means the loser's edits to that section are dropped,
 * but nothing from other sections is ever lost. Every section goes through
 * `newer()` so a remote doc uploaded by an old build that doesn't know about
 * a given section (e.g. `piano`) never crashes the merge.
 */
export function mergeDocs(local: ProgressDoc, remote: ProgressDoc): ProgressDoc {
  return {
    schemaVersion: 1,
    settings: newer(local.settings, remote.settings),
    profiles: newer(local.profiles, remote.profiles),
    rewards: newer(local.rewards, remote.rewards),
    solveLog: newer(local.solveLog, remote.solveLog),
    piano: newer(local.piano ?? emptyPiano(0), remote.piano),
  }
}

export function exportJson(): string {
  return JSON.stringify(doc, null, 2)
}

/** Replaces the whole doc from a previously-exported JSON string. */
export function importJson(text: string): void {
  const parsed = JSON.parse(text) as Partial<ProgressDoc>
  if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1) {
    throw new Error('Unrecognized practice progress file')
  }
  doc = normalizeDoc(parsed)
  persist()
  notify()
}

/**
 * Wipes this device. Sections are stamped updatedAt: 0 so a reset can never
 * out-rank real progress on another device during a sync merge; the other
 * device simply re-uploads its data. Reset every device to reset everything.
 */
export function resetAll(): void {
  doc = neverEditedDoc()
  persist()
  notify()
}

/** Sets the daily goal for one activity. Mirrors sessionMinutes when activity is 'cube'. */
export function setGoalMinutes(activity: ActivityId, minutes: number): void {
  update('settings', (s) => {
    const goalMinutes = { ...s.goalMinutes, [activity]: minutes }
    return {
      ...s,
      goalMinutes,
      sessionMinutes: activity === 'cube' ? minutes : s.sessionMinutes,
    }
  })
}

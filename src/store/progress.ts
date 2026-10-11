import { useSyncExternalStore } from 'react'
import { APP_BUILD } from '../buildInfo'
import { kidDisplayName, kidKey } from './kid'

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
  /** This week's tiny goal for the piece, written by the grown-up ("Bars 1-8 three times without stopping"). */
  goal?: string
  /** Local YYYY-MM-DD the goal was set. */
  goalSetOn?: string
  /** Grown-up target: play this piece this many times a day (counted by the "+1" tap while recording). 0/undefined = off. */
  timesPerDay?: number
  /** 'week' (default, so older pieces stay visible) = big chips, 'keep' = under "More songs", 'archived' = hidden from the kid, history kept. */
  status?: 'week' | 'keep' | 'archived'
  /** In the grown-up's surprise list (see store/randomSong.ts). */
  inRandom?: boolean
  /** Manual order within a status group (lower first). */
  order?: number
}

export interface TokenCounts {
  gold: number
  silver: number
  bronze: number
}

/** One daily minute mark and the box tokens it hands out (round 9: configurable per kid). */
export interface PianoMark {
  minutes: number
  tokens: TokenCounts
}

/** What counts toward the daily piano goal: the whole recording (default) or only seconds where playing was heard. */
export type PianoCountMode = 'recording' | 'heard'

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
  /** Show raw notation letters (R, U, F...) in the cube missions. Default off - Nora reads the kid-friendly names first. */
  showMoveLetters?: boolean
  /** Per-branch on/off toggle for the Trick Gym / Pattern Lab side quests (round 13). Unset/missing branch = on. */
  cubeBranches?: { gym?: boolean; patterns?: boolean }
  /** Default 'recording': the goal ring counts the whole recording, not just "heard" seconds. */
  pianoCountMode?: PianoCountMode
  /** Parent-entered once, synced via the private gist. Undefined = uploads off. */
  driveUpload?: { scriptUrl: string; secret: string; folderName: string }
  /** AI coach feedback. Undefined = on (it silently uses built-in phrases until the Apps Script has an API key). */
  aiCoach?: { enabled: boolean }
  /**
   * Tiered daily piano rewards beyond the ring goal (which stays tier 1, bronze):
   * `goldMin` minutes in a day = a guaranteed gold token, `bonusMin` = one more
   * token, gold or silver by coin toss. Undefined = defaults 20 / 30.
   */
  pianoTiers?: { goldMin: number; bonusMin: number }
  /**
   * The three daily minute marks and their prizes (round 9). Mark 1's minutes always
   * equals `goalMinutes.piano` (the ring). Undefined = defaults: 10 = 🟡, 20 = 🟡🟤,
   * 30 = 🟡⚪🟤 (minutes taken from `pianoTiers` when that older setting exists).
   */
  pianoMarks?: PianoMark[]
  /** Confirmed days per week needed for the Teacher's star; default 3 (see store/teacherNotes.ts). */
  teacherStarDays?: number
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

/** How much help a mission attempt needed, from least to most - sets its token tier. */
export type HelpKind = 'none' | 'scan' | 'walkthrough'

export interface MissionProgress {
  completedAt?: number
  tier?: 'gold' | 'silver' | 'bronze'
  tries: number
  help: HelpKind
  minutes: number
  /** Local YYYY-MM-DD of the most recent completion, replays included (drives the daily warm-up). */
  lastDoneDay?: string
  /** Spaced-review stage 0..4: the next warm-up of this mission is due after 1, 3, 7, 14, 30 days. */
  reviewStage?: number
  /** Local YYYY-MM-DD when this mission is next due as a warm-up. */
  nextReviewDay?: string
}

/** Today's cube plan, fixed once per local day so it doesn't shift under her mid-session. */
export interface CubeDay {
  day: string
  warmup?: { holdId: string; missionId: string; doneAt?: number }
  mission?: { holdId: string; missionId: string; doneAt?: number }
  /** Today's side-quest picks (round 13) - trail mission first, then one gym + one pattern node, once Phase 3 ships content. */
  choices?: { holdId: string; missionId: string }[]
  /** Stamped once, the first time she finishes the trail mission or any of today's `choices` - any one of them earns the star. */
  starEarned?: { holdId: string; missionId: string; doneAt: number }
}

export interface HoldProgress {
  /** @deprecated Watch/Try/Spot/Climb stage progress - kept for old saves; new progress lives in `missions`. */
  stages: Record<string, StageProgress>
  missions?: Record<string, MissionProgress>
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
  cubeDay?: CubeDay
  /** How many times each named trick (by alg id) was completed move-by-move; drives the fading scaffolds. */
  trickReps?: Record<string, number>
  /** Side branches (Trick Gym / Pattern Lab) whose every node is mastered, keyed by branch id, and when. */
  branches?: Record<string, { completedAt: number }>
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
  /** Collection item the box held (content/collection.ts id), for boxes opened after the photo collection shipped. */
  itemId?: string
  /** Beads the box (or a duplicate item) turned into. */
  beadIds?: string[]
}

export interface EarnedBadge {
  id: string
  earnedAt: number
}

export interface Rewards {
  stickers: Sticker[]
  customStickers: CustomSticker[]
  tickets: Ticket[]
  boxHistory: BoxHistoryEntry[]
  badges?: EarnedBadge[]
  updatedAt: number
}

/** A message from the grown-up, shown on Nora's Home until she taps "Got it". */
export interface Note {
  id: string
  /** Local YYYY-MM-DD it was written. */
  day: string
  about: 'piano' | 'cube' | 'general'
  text?: string
  /** A short voice note recorded as a piano take flagged `isNote`. */
  audioTakeId?: string
  createdAt: number
  seenAt?: number
}

export interface NotesSection {
  items: Note[]
  updatedAt: number
}

// --- Photo collection + beads (the reward system from round 6) ------------

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

/** One collection card she owns (id from src/content/collection.ts). */
export interface OwnedItem {
  id: string
  /** How many times it dropped; duplicates beyond the first turned into beads. */
  count: number
  firstAt: number
}

export interface Bracelet {
  id: string
  name: string
  /** Fixed number of slots along the strand; null = empty slot. Bead ids from src/content/beads.ts. */
  beads: (string | null)[]
  startedAt: number
  finishedAt?: number
}

export interface CollectionSection {
  items: OwnedItem[]
  /** beadId -> how many are loose in the tray (beads on a bracelet are not counted here). */
  beads: Record<string, number>
  bracelets: Bracelet[]
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

/**
 * What the app measured about a take's sound (see src/audio/takeAnalysis.ts).
 * Measurements through a tablet microphone, not a judgement of right or
 * wrong notes. Optional fields are absent when there was not enough evidence.
 */
export interface TakeMetrics {
  v: 1
  /** Seconds with the piano actually sounding. */
  playedSec: number
  tempoBpm?: number
  /** +0.10 = the last third was 10 % faster than the first third. */
  tempoDrift?: number
  /** 0-1, same scale as PianoTake.steadiness but from the offline detector. */
  steadiness?: number
  /** Silent gaps inside the music that were long for this take's pace. */
  hesitations: number
  longestPauseSec: number
  /** Loud-to-soft spread in dB: did she play loud AND soft? */
  dynamicRangeDb: number
  /** Note onsets per played second. */
  noteRate?: number
  /** Against the piece's reference take: how far through the piece this take got (0-1). */
  coverage?: number
  /** Against the piece's reference take: similarity along the aligned path (0-1). */
  matchToBest?: number
  /** Positions 0-1 through the piece where she lingered or repeated. */
  stumbles?: number[]
  /**
   * Speed relative to the piece's reference take over the aligned stretch
   * (1.10 = 10 % faster). This is the trustworthy speed measure: `tempoBpm`
   * flips between half/double time on real music and `steadiness` reads low
   * for any piece that mixes note lengths, so neither is used for feedback.
   */
  paceVsBest?: number
}

/** The coach's written feedback for one take. `parent` is only ever rendered behind the grown-up PIN. */
export interface TakeCoach {
  metrics: TakeMetrics
  kid?: { praise: string; tryNext: string }
  parent?: { note: string }
  /** 'claude' = written by the AI from the metrics; 'rules' = built-in phrases (offline / no key / fallback). */
  source?: 'claude' | 'rules'
  model?: string
  at: number
}

/** A written "how this song has grown" summary for one piece. */
export interface PieceJourney {
  kid: string
  parent: string
  at: number
  /** How many analysed takes of the piece existed when this was written. */
  takeCount: number
  source?: 'claude' | 'rules'
}

export interface PianoTake {
  id: string
  day: string // local YYYY-MM-DD
  pieceId: string | null
  /** A grown-up's voice note, not practice: never counts toward goals or the takes list. */
  isNote?: boolean
  /** Recorded for a song the app picked (the surprise picker). */
  random?: true
  startedAt: number
  durationSec: number
  activeSec: number
  selfRating?: SelfRating
  /** 160 peak-amplitude buckets 0-100, computed from the audio on save; drawn under the player. */
  waveform?: number[]
  /** Note-onset times in ms from the start of the take (capped), for the steady-beat readout. */
  onsets?: number[]
  /** 0-1 steadiness of the beat from `onsets`; undefined when too few onsets. */
  steadiness?: number
  /** Did she say she met the piece's goal for this take? */
  goalHit?: boolean
  /** How many times she tapped "Played it! +1" during this take (song repeat targets). */
  repetitions?: number
  /** Measurements + coach feedback (round 7). Once present, `onsets` is dropped from the take to keep the synced doc small. */
  ai?: TakeCoach
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
  /** The day's gold box for 10 surprise songs was granted. */
  randomGoldAt?: number
  parentStars?: ParentStars
  parentRatedAt?: number
  /** Piece ids that already got their "song repeat target" beads today (see awardSongTargetBeadsIfReached). */
  songBeadsAwarded?: string[]
  /** Tier 2: the guaranteed gold token for reaching `settings.pianoTiers.goldMin` minutes (see awardTiersIfReached). */
  goldReachedAt?: number
  /** Tier 3: the bonus token for reaching `settings.pianoTiers.bonusMin` minutes, and which tier the coin toss gave. */
  bonusReachedAt?: number
  bonusTier?: 'gold' | 'silver'
  /** Journal nudges already shown today ('third-take', 'mark-1', 'feeling'), so each appears once a day. */
  nudges?: string[]
  /** How she felt after filling the ring today, 1 (😫) to 10 (🤩), asked once a day (see store/feeling.ts). */
  feeling?: number
  feelingAt?: number
  /** This day was skipped but a weekly streak freeze covered it, so the piano chain continued (see store/streakFreeze.ts). */
  streakFreeze?: true
  /** A grown-up marked this day as a sick day: it pauses the piano and cube streaks instead of breaking them (see store/sickDays.ts). */
  sickDay?: true
  /** A grown-up confirmed (PIN) that she worked on the teacher's note this day. */
  teacherConfirmed?: { noteId: string; at: number }
}

/** One entry in the kid's own practice journal (typed by her; a grown-up can delete behind the PIN). */
export interface JournalEntry {
  id: string
  day: string
  at: number
  /** 1 = 😫, 2 = 😐, 3 = 🙂, 4 = 🤩 */
  mood?: 1 | 2 | 3 | 4
  text: string
  /** The prompt chip she started from, if any. */
  prompt?: string
  takeIds?: string[]
}

/** A photo of the teacher's weekly note in her notebook. Full-size photo goes to Drive; the thumbnail stays here. */
export interface TeacherNote {
  id: string
  /** The lesson day this note is about (defaults to the day the photo was taken). */
  day: string
  takenAt: number
  /** Small JPEG data URL (<= 240 px, ~15 KB) so every device shows it offline. */
  thumbDataUrl: string
  caption?: string
  /** What the teacher asked this week, one short line each (1-3). */
  items?: string[]
  /** Teacher's star: the week's confirmed-days target was met (see store/teacherNotes.ts). */
  starAwardedAt?: number
  upload: {
    status: 'pending' | 'uploading' | 'done' | 'failed'
    attempts: number
    driveFileId?: string
    driveUrl?: string
    lastError?: string
    updatedAt: number
  }
}

export interface TeacherNotesSection {
  items: TeacherNote[]
  updatedAt: number
}

/** One personal record: the value, when it was set, and where (take / day / piece) so the kid can find it. */
export interface RecordEntry {
  value: number
  day: string
  setAt: number
  takeId?: string
  pieceId?: string
}

/**
 * Personal records, derived from the takes (src/store/records.ts is the source
 * of truth) and cached here so a new record can be spotted cheaply and
 * celebrated once. Absent until the first take after the feature shipped.
 */
export interface Records {
  /** Longest single take, in seconds. */
  longestTakeSec?: RecordEntry
  /** Most playing time in one day, in seconds. */
  mostSecondsInDay?: RecordEntry
  /** Most plays of one song in one day (takes + "+1" repetitions). */
  mostPlaysOfSong?: RecordEntry
  /** Longest piano streak, in days. */
  longestStreakDays?: RecordEntry
}

export interface PianoSection {
  takes: PianoTake[]
  days: Record<string, PianoDay>
  streak: Streak
  /** pieceId -> written song-journey summary. */
  journeys?: Record<string, PieceJourney>
  records?: Records
  /** The kid's own practice journal, newest last. */
  journal?: JournalEntry[]
  /** "Tomorrow, start with…" chosen on the done screen; applies only on `forDay` (see store/tomorrowFirst.ts). */
  tomorrowFirst?: { pieceId: string; forDay: string; setAt: number }
  updatedAt: number
}

export interface ProgressDoc {
  schemaVersion: 1
  settings: Settings
  profiles: Profiles
  rewards: Rewards
  solveLog: SolveLog
  piano: PianoSection
  notes: NotesSection
  collection: CollectionSection
  teacherNotes: TeacherNotesSection
}

export type SectionKey = 'settings' | 'profiles' | 'rewards' | 'solveLog' | 'piano' | 'notes' | 'collection' | 'teacherNotes'

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

export function emptyNotes(updatedAt: number): NotesSection {
  return { items: [], updatedAt }
}

export function emptyTeacherNotes(updatedAt: number): TeacherNotesSection {
  return { items: [], updatedAt }
}

function normalizeTeacherNotes(parsed: Partial<TeacherNotesSection> | undefined): TeacherNotesSection {
  if (!parsed) return emptyTeacherNotes(0)
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
  }
}

export function emptyCollection(updatedAt: number): CollectionSection {
  return { items: [], beads: {}, bracelets: [], updatedAt }
}

function normalizeCollection(parsed: Partial<CollectionSection> | undefined): CollectionSection {
  if (!parsed) return emptyCollection(0)
  const beads: Record<string, number> = {}
  if (parsed.beads && typeof parsed.beads === 'object') {
    for (const [id, n] of Object.entries(parsed.beads)) {
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) beads[id] = Math.floor(n)
    }
  }
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    beads,
    bracelets: Array.isArray(parsed.bracelets) ? parsed.bracelets : [],
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
  }
}

function normalizeNotes(parsed: Partial<NotesSection> | undefined): NotesSection {
  if (!parsed) return emptyNotes(0)
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
  }
}

export function defaultDoc(): ProgressDoc {
  const now = Date.now()
  return {
    schemaVersion: 1,
    settings: {
      kidName: kidDisplayName(),
      parentName: 'Coach',
      pin: '1234',
      sessionMinutes: 10,
      goalMinutes: { cube: 10, piano: 15 },
      pianoPieces: [],
      recordingKeepDays: 14,
      showMoveLetters: false,
      pianoCountMode: 'recording',
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
      badges: [],
      updatedAt: now,
    },
    solveLog: {
      solves: [],
      updatedAt: now,
    },
    piano: emptyPiano(now),
    notes: emptyNotes(now),
    collection: emptyCollection(now),
    teacherNotes: emptyTeacherNotes(now),
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Per-kid document key: `cubeclimb.progress` for Nora (unchanged from
 * before the app knew about kids), `cubeclimb.progress.<kid>` otherwise.
 * Resolved at call time, not module load, so tests can switch kids.
 */
function storageKey(): string {
  return kidKey('cubeclimb.progress')
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

/**
 * The Rubik's cube curriculum used to have a single combined "cross" hold
 * (grow the daisy AND tuck it into a white cross) and no "cornerFind" hold
 * (finding a white corner's home was folded into "corners"). It was later
 * split into 'daisy' + 'cross' and 'cornerFind' + 'corners' respectively, so
 * old saves need their progress carried over onto the new hold ids or a
 * climber who already finished those walls would see them locked again.
 */
function migrateSplitHolds(holds: Record<string, HoldProgress>): Record<string, HoldProgress> {
  const next = { ...holds }
  if (next.cross && !next.daisy) {
    next.daisy = next.cross
  }
  if (next.corners?.masteredAt && !next.cornerFind) {
    next.cornerFind = { stages: {}, missions: {}, masteredAt: next.corners.masteredAt }
  }
  return next
}

/** Backfills `missions: {}` on a hold saved before the mission curriculum existed. */
function normalizeHold(hold: HoldProgress): HoldProgress {
  return { ...hold, missions: hold.missions ?? {} }
}

function normalizeHolds(holds: Record<string, HoldProgress>): Record<string, HoldProgress> {
  const out: Record<string, HoldProgress> = {}
  for (const [id, hold] of Object.entries(holds)) out[id] = normalizeHold(hold)
  return out
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
    holds: normalizeHolds(migrateSplitHolds({ ...fallback.holds, ...parsed?.holds })),
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
/**
 * Fills every section a doc is missing with defaults (and runs the legacy
 * migrations). Exported so a doc that arrives from sync for ANOTHER kid can be
 * made whole before anything renders it - an older build's file may lack a
 * section this build reads (see gistSync.ts harvestOtherKids).
 */
export function normalizeDoc(parsed: Partial<ProgressDoc>): ProgressDoc {
  const fallback = defaultDoc()
  const mergedPrizePools = { ...fallback.settings.prizePools, ...parsed.settings?.prizePools }
  // A legacy doc only ever had `sessionMinutes`; goalMinutes.cube inherits it
  // (piano keeps the default) so an old cached build's edits aren't lost.
  const goalMinutes = parsed.settings?.goalMinutes
    ? { ...fallback.settings.goalMinutes, ...parsed.settings.goalMinutes }
    : { cube: parsed.settings?.sessionMinutes ?? fallback.settings.goalMinutes.cube, piano: fallback.settings.goalMinutes.piano }
  return {
    ...fallback,
    // Spreading `parsed` here (before the known-section overrides below)
    // means any top-level key this build doesn't recognize - a section a
    // *newer* build added that this cached build has never heard of -
    // passes straight through untouched, instead of being silently dropped.
    // See mergeDocs()'s mergeUnknownSections() for the sync-side half of
    // this guarantee.
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
    rewards: {
      ...fallback.rewards,
      ...parsed.rewards,
      badges: Array.isArray(parsed.rewards?.badges) ? parsed.rewards.badges : [],
    },
    solveLog: { ...fallback.solveLog, ...parsed.solveLog },
    piano: normalizePiano(parsed.piano),
    notes: normalizeNotes(parsed.notes),
    collection: normalizeCollection(parsed.collection),
    teacherNotes: normalizeTeacherNotes(parsed.teacherNotes),
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
    notes: emptyNotes(0),
    collection: emptyCollection(0),
    teacherNotes: emptyTeacherNotes(0),
  }
}

// ---------------------------------------------------------------------------
// Automatic migration backups
//
// A safety net for a doc mutated by normalizeDoc() (a legacy shape got
// migrated) or first loaded under a new app build: before that transformed
// state becomes the only copy on disk, the raw pre-migration JSON is stashed
// here so a parent can roll back from Settings -> Backup if a migration ever
// turns out to have gone wrong. Never written on an ordinary, unchanged load
// (see loadInitialDoc's shape/build comparison) - restarting the same build
// against an already-normalized doc many times over does not pile up copies.
// ---------------------------------------------------------------------------

function backupsKey(): string {
  return kidKey('cubeclimb.progress.backups')
}
const BUILD_ID_KEY = 'cubeclimb.buildId'
const MAX_BACKUPS = 3

interface StoredBackup {
  savedAt: number
  buildId: string
  json: string
}

function readBackups(): StoredBackup[] {
  if (!hasLocalStorage()) return []
  try {
    const raw = localStorage.getItem(backupsKey())
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StoredBackup[]) : []
  } catch {
    return []
  }
}

function writeBackups(backups: StoredBackup[]): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(backupsKey(), JSON.stringify(backups.slice(-MAX_BACKUPS)))
  } catch {
    // Storage full/disabled - the backup just won't be available; not fatal.
  }
}

function pushBackup(json: string, buildId: string): void {
  writeBackups([...readBackups(), { savedAt: Date.now(), buildId, json }])
}

/** One line a grown-up can read to tell backups apart: "30 takes · XP 55 · 10 cards". */
function summarizeBackup(json: string): string {
  try {
    const d = JSON.parse(json) as Partial<ProgressDoc>
    const takes = d.piano?.takes?.length ?? 0
    const xp = d.profiles?.kid?.xp ?? 0
    const cards = d.collection?.items?.length ?? 0
    return `${takes} take${takes === 1 ? '' : 's'} · XP ${xp} · ${cards} card${cards === 1 ? '' : 's'}`
  } catch {
    return 'unreadable'
  }
}

/** Automatic-backup list for Settings -> Backup, newest first. */
export function listBackups(): { savedAt: number; buildId: string; bytes: number; summary: string }[] {
  return readBackups()
    .map((b) => ({ savedAt: b.savedAt, buildId: b.buildId, bytes: b.json.length , summary: summarizeBackup(b.json) }))
    .reverse()
}

/**
 * Restores backup `index` (as returned by listBackups() - 0 is newest)
 * through the normal importJson() path. Stashes the *current* doc as one
 * more backup first, so restoring is itself reversible from the same list.
 */
export function restoreBackup(index: number): void {
  const newestFirst = readBackups().slice().reverse()
  const entry = newestFirst[index]
  if (!entry) throw new Error('No backup at that position')
  pushBackup(exportJson(), APP_BUILD)
  importJson(entry.json)
}

function loadInitialDoc(): ProgressDoc {
  if (!hasLocalStorage()) return neverEditedDoc()
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return neverEditedDoc()
    const parsed = JSON.parse(raw) as Partial<ProgressDoc>
    if (!parsed || parsed.schemaVersion !== 1) return neverEditedDoc()
    const normalized = normalizeDoc(parsed)

    const shapeChanged = JSON.stringify(normalized) !== raw
    const buildChanged = localStorage.getItem(BUILD_ID_KEY) !== APP_BUILD
    if (shapeChanged || buildChanged) pushBackup(raw, APP_BUILD)
    try {
      localStorage.setItem(BUILD_ID_KEY, APP_BUILD)
    } catch {
      // Non-fatal - just means the build-change check re-fires next launch too.
    }

    return normalized
  } catch {
    return neverEditedDoc()
  }
}

let doc: ProgressDoc = loadInitialDoc()
const listeners = new Set<() => void>()

/**
 * Re-reads the document from this kid's storage key. Only used by tests and
 * by the "this device belongs to" switch (which reloads the page anyway).
 */
export function reloadFromStorage(): void {
  doc = loadInitialDoc()
  notify()
}

function persist(): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(storageKey(), JSON.stringify(doc))
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

const KNOWN_SECTION_KEYS = new Set(['schemaVersion', 'settings', 'profiles', 'rewards', 'solveLog', 'piano', 'notes', 'collection', 'teacherNotes'])

function sectionUpdatedAt(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt
  return typeof updatedAt === 'number' ? updatedAt : undefined
}

/**
 * Carries over any top-level key neither this build's `mergeDocs` nor
 * `normalizeDoc` recognizes - a section a *newer* build added to
 * `ProgressDoc` that this cached build has never heard of - so merging two
 * docs on an old build can never silently delete it. Present on only one
 * side: that side's copy wins outright. Present on both: newer wins by
 * comparing each copy's own `updatedAt` when both have one (matching every
 * known section's rule below), otherwise the remote copy wins, consistent
 * with `newer()`'s remote-can-introduce-new-data stance.
 */
function mergeUnknownSections(local: ProgressDoc, remote: ProgressDoc): Record<string, unknown> {
  const localRecord = local as unknown as Record<string, unknown>
  const remoteRecord = remote as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(localRecord), ...Object.keys(remoteRecord)])) {
    if (KNOWN_SECTION_KEYS.has(key)) continue
    const hasLocal = Object.prototype.hasOwnProperty.call(localRecord, key)
    const hasRemote = Object.prototype.hasOwnProperty.call(remoteRecord, key)
    if (hasLocal && !hasRemote) {
      out[key] = localRecord[key]
    } else if (hasRemote && !hasLocal) {
      out[key] = remoteRecord[key]
    } else {
      const localUpdatedAt = sectionUpdatedAt(localRecord[key])
      const remoteUpdatedAt = sectionUpdatedAt(remoteRecord[key])
      out[key] =
        localUpdatedAt !== undefined && remoteUpdatedAt !== undefined
          ? remoteUpdatedAt > localUpdatedAt
            ? remoteRecord[key]
            : localRecord[key]
          : remoteRecord[key]
    }
  }
  return out
}

// --- Content-aware merge ----------------------------------------------------
// Added 2026-10-11 after a real loss: a fresh, never-used copy of the app
// (the setup link opened in Safari) synced first and stamped EMPTY piano and
// profile sections with "now"; two minutes later the kid's real iPad synced,
// its sections were "older", and last-writer-wins replaced weeks of recordings
// and XP with the empty ones. Two rules now stop that for good:
//   1. a pristine (never-used) section never outranks one with content, no
//      matter the timestamps;
//   2. recordings, days and journal entries are UNIONED by id/key, so no
//      device can ever delete another device's takes (there is no delete-take
//      feature; metadata older than the retention window is pruned by
//      saveTake on the next take).

function pristineSettings(s: Settings): boolean {
  return s.pianoPieces.length === 0 && !s.driveUpload
}
function pristineProfiles(p: Profiles): boolean {
  const k = p.kid
  return (
    k.xp === 0 &&
    k.sessions.length === 0 &&
    Object.keys(k.holds ?? {}).length === 0 &&
    k.tokens.gold + k.tokens.silver + k.tokens.bronze === 0 &&
    k.streak.current === 0 &&
    k.streak.best === 0
  )
}
function pristineRewards(r: Rewards): boolean {
  return r.boxHistory.length === 0 && (r.badges?.length ?? 0) === 0 && r.tickets.length === 0 && (r.stickers?.length ?? 0) === 0
}
function pristineSolveLog(s: SolveLog): boolean {
  return s.solves.length === 0
}
function pristinePiano(p: PianoSection): boolean {
  return p.takes.length === 0 && Object.keys(p.days).length === 0 && (p.journal?.length ?? 0) === 0 && p.streak.best === 0
}
function pristineNotes(n: NotesSection): boolean {
  return n.items.length === 0
}
function pristineCollection(c: CollectionSection): boolean {
  return c.items.length === 0 && Object.keys(c.beads ?? {}).length === 0 && c.bracelets.length === 0
}
function pristineTeacherNotes(t: TeacherNotesSection): boolean {
  return t.items.length === 0
}

/** newer(), except a pristine section never outranks one with content. */
function newerWithContent<T extends { updatedAt: number }>(local: T, remote: T | undefined, pristine: (x: T) => boolean): T {
  if (!remote) return local
  const localPristine = pristine(local)
  const remotePristine = pristine(remote)
  if (localPristine !== remotePristine) return localPristine ? remote : local
  return newer(local, remote)
}

function unionById<T extends { id: string }>(base: T[], other: T[]): T[] {
  const seen = new Set(base.map((x) => x.id))
  const extra = other.filter((x) => !seen.has(x.id))
  return extra.length ? [...base, ...extra] : base
}

/**
 * Piano is append-mostly, so it merges by content: the richer/newer side is
 * the base, then the other side's takes, days and journal entries that the
 * base lacks are added back. Takes end up ordered by startedAt.
 */
function mergePiano(local: PianoSection, remote: PianoSection | undefined): PianoSection {
  if (!remote) return local
  const base = newerWithContent(local, remote, pristinePiano)
  const other = base === local ? remote : local
  const takes = unionById(base.takes, other.takes ?? [])
  const sortedTakes = takes === base.takes ? takes : [...takes].sort((a, b) => a.startedAt - b.startedAt)
  const missingDays = Object.keys(other.days ?? {}).filter((d) => !(d in base.days))
  const days = missingDays.length ? { ...base.days, ...Object.fromEntries(missingDays.map((d) => [d, other.days[d]])) } : base.days
  const journal = unionById(base.journal ?? [], other.journal ?? [])
  const sortedJournal = journal === (base.journal ?? []) ? base.journal : [...journal].sort((a, b) => a.at - b.at)
  if (sortedTakes === base.takes && days === base.days && sortedJournal === base.journal) return base
  return { ...base, takes: sortedTakes, days, ...(sortedJournal ? { journal: sortedJournal } : {}) }
}

/**
 * Merges two docs section-by-section. Each section is a single unit decided
 * by `newerWithContent()` (newer `updatedAt` wins, but a never-used section
 * never beats one with content), except `piano`, which is unioned - see
 * mergePiano(). Two devices editing *different* sections both survive;
 * editing the *same* non-piano section concurrently means the loser's edits
 * to that section are dropped, but nothing from other sections is ever lost.
 * A remote doc from an old build that lacks a section never crashes the
 * merge. Any top-level key outside the known sections is preserved too - see
 * mergeUnknownSections().
 */
/**
 * What this device last knew the gist to hold for its own file: each section's
 * `updatedAt` plus a copy of the small profiles section. Lets mergeDocs tell
 * "changed here since the last sync" from "changed there", instead of trusting
 * timestamps alone - the 2026-10-10 XP loss happened because a stale device
 * added one token and its whole (older) profile became the "newest" section.
 */
export interface MergeBase {
  sections: Partial<Record<SectionKey, number>>
  profiles?: Profiles
}

/** Three-way pick for a whole section: only the side that changed since the base wins; both changed → `both()`. */
function threeWay<T extends { updatedAt: number }>(local: T, remote: T | undefined, baseStamp: number | undefined, both: () => T): T {
  if (!remote) return local
  if (baseStamp === undefined) return both()
  const localChanged = local.updatedAt !== baseStamp
  const remoteChanged = remote.updatedAt !== baseStamp
  if (localChanged && !remoteChanged) return local
  if (remoteChanged && !localChanged) return remote
  if (!localChanged && !remoteChanged) return local
  return both()
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Profiles, when both sides changed since the base: decided field by field.
 * A field equal to the base on one side takes the other side's value; a field
 * changed on both sides takes the newer section's. So a grown-up adding one
 * token on a laptop never drags the kid's XP, streak or missions back to what
 * the laptop last saw.
 */
function mergeProfilesFieldwise(local: Profiles, remote: Profiles, base: Profiles): Profiles {
  const newest = newer(local, remote)
  const other = newest === local ? remote : local
  const kidKeys = new Set([...Object.keys(local.kid), ...Object.keys(remote.kid), ...Object.keys(base.kid)])
  const kid: Record<string, unknown> = {}
  const lk = local.kid as unknown as Record<string, unknown>
  const rk = remote.kid as unknown as Record<string, unknown>
  const bk = base.kid as unknown as Record<string, unknown>
  for (const key of kidKeys) {
    const localChanged = !same(lk[key], bk[key])
    const remoteChanged = !same(rk[key], bk[key])
    if (localChanged && !remoteChanged) kid[key] = lk[key]
    else if (remoteChanged && !localChanged) kid[key] = rk[key]
    else kid[key] = (newest.kid as unknown as Record<string, unknown>)[key]
    if (kid[key] === undefined) delete kid[key]
  }
  const parent = same(local.parent, base.parent) ? remote.parent : same(remote.parent, base.parent) ? local.parent : newest.parent
  return { ...other, ...newest, kid: kid as unknown as Profiles['kid'], parent, updatedAt: Math.max(local.updatedAt, remote.updatedAt) }
}

export function mergeDocs(local: ProgressDoc, remote: ProgressDoc, base?: MergeBase): ProgressDoc {
  const stamp = (key: SectionKey) => base?.sections[key]
  const profilesBoth = () =>
    base?.profiles && !pristineProfiles(local.profiles) && !pristineProfiles(remote.profiles)
      ? mergeProfilesFieldwise(local.profiles, remote.profiles, base.profiles)
      : newerWithContent(local.profiles, remote.profiles, pristineProfiles)
  return {
    ...mergeUnknownSections(local, remote),
    schemaVersion: 1,
    settings: threeWay(local.settings, remote.settings, stamp('settings'), () => newerWithContent(local.settings, remote.settings, pristineSettings)),
    profiles: threeWay(local.profiles, remote.profiles, stamp('profiles'), profilesBoth),
    rewards: threeWay(local.rewards, remote.rewards, stamp('rewards'), () => newerWithContent(local.rewards, remote.rewards, pristineRewards)),
    solveLog: threeWay(local.solveLog, remote.solveLog, stamp('solveLog'), () => newerWithContent(local.solveLog, remote.solveLog, pristineSolveLog)),
    // piano is always unioned: even "only remote changed" must not drop a take recorded here
    piano: mergePiano(local.piano ?? emptyPiano(0), remote.piano),
    notes: threeWay(local.notes ?? emptyNotes(0), remote.notes, stamp('notes'), () => newerWithContent(local.notes ?? emptyNotes(0), remote.notes, pristineNotes)),
    collection: threeWay(local.collection ?? emptyCollection(0), remote.collection, stamp('collection'), () => newerWithContent(local.collection ?? emptyCollection(0), remote.collection, pristineCollection)),
    teacherNotes: threeWay(local.teacherNotes ?? emptyTeacherNotes(0), remote.teacherNotes, stamp('teacherNotes'), () => newerWithContent(local.teacherNotes ?? emptyTeacherNotes(0), remote.teacherNotes, pristineTeacherNotes)),
  }
}

/** The MergeBase describing `doc` - what a device should remember after it has synced `doc`. */
export function mergeBaseOf(doc: ProgressDoc): MergeBase {
  return {
    sections: {
      settings: doc.settings.updatedAt,
      profiles: doc.profiles.updatedAt,
      rewards: doc.rewards.updatedAt,
      solveLog: doc.solveLog.updatedAt,
      piano: doc.piano.updatedAt,
      notes: doc.notes.updatedAt,
      collection: doc.collection.updatedAt,
      teacherNotes: doc.teacherNotes.updatedAt,
    },
    profiles: JSON.parse(JSON.stringify(doc.profiles)) as Profiles,
  }
}

/**
 * Saves an automatic backup of the current doc before something risky is
 * applied to it (sync is about to replace sections, a rebuild is about to
 * run). Same list as the migration backups: Settings -> Backup -> Restore.
 */
export function backupBeforeRisk(label: string): void {
  pushBackup(exportJson(), `${APP_BUILD} (${label})`)
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
    // Mark 1 of the piano reward marks IS the ring goal: keep them in step.
    const pianoMarks =
      activity === 'piano' && s.pianoMarks
        ? s.pianoMarks.map((m, i) => (i === 0 ? { ...m, minutes } : m))
        : s.pianoMarks
    return {
      ...s,
      goalMinutes,
      ...(pianoMarks ? { pianoMarks } : {}),
      sessionMinutes: activity === 'cube' ? minutes : s.sessionMinutes,
    }
  })
}

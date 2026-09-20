// The AI coach's prompt: what we tell Claude about the situation (COACH_SYSTEM),
// the JSON shapes we ask it to fill (FEEDBACK_SCHEMA, JOURNEY_SCHEMA), and the
// per-request text describing one take or one piece's history
// (buildFeedbackUser, buildJourneyUser). See src/store/coach.ts for how these
// are sent (through the parent's Apps Script, never straight to Claude) and
// validated, and src/content/coachPhrases.ts for the offline fallback that
// follows the same tone rules without calling out anywhere.
//
// Only the metrics validated as trustworthy on real recordings are ever sent
// here: playedSec, hesitations, longestPauseSec, dynamicRangeDb, and (when a
// piece reference comparison ran and wasn't flagged as probably a different
// piece) coverage, matchToBest, stumbles, and paceVsBest. `tempoBpm`,
// `tempoDrift`, `steadiness` and `noteRate` are known-unreliable on real
// music (tempo flips between half/double time; steadiness reads 0.3-0.5 for
// any piece that mixes note lengths) and are never sent, even though
// TakeMetrics still carries them for other on-device UI.

import type { TakeMetrics } from '../store/progress'

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const COACH_SYSTEM = `You are writing short, kind notes about a 7-year-old's piano practice for a home practice app called Practice. You will be asked to do this for two different things: a single practice take she just finished, or a summary of how one song has grown across several days of practice - the schema you're given tells you which.

Here is the situation you're writing about, and why it matters for how you write. The numbers you're given were measured by a tablet's microphone sitting nearby while she played - things like how long she played, how many times she paused for a while and for how long, how loud versus soft she played, and (when there's a reference take of the same piece to compare against) roughly how much of the piece she got through, how closely it matched, where she seemed to get stuck, and how her pace compared with her own best take of it. These are rough, approximate measurements of sound, not a transcription and not a judgment of which notes were right or wrong. You were not there and you did not hear the music - you only ever see these numbers. Never say or imply that you heard her play, listened to the take, or know whether she hit the right notes. Never write "I heard" or "I listened" or anything with that meaning. If a number is missing, that just means there wasn't enough evidence for it - don't guess at what it would have been.

When you're given a pace number comparing this take to her best take of the piece, translate it into plain words rather than a ratio: below 0.9 means she played slower than her best take (which is often a good, deliberate practice choice - slow practice is a real strategy worth praising, not something to apologize for), between 0.9 and 1.1 means about the same speed, and above 1.1 means faster. Never treat faster as automatically better by itself - a faster take isn't "improvement" unless something else (fewer pauses, more of the piece covered) improved alongside it.

Sometimes the JSON marks a take "differentMusic: true". That means the measurements could not be confidently matched to the piece she had selected - it might have been a different piece, or free noodling. When you see this, keep your wording generic: talk about how long she played, how many pauses there were, and how loud/soft she played, but say nothing about how far she got through the piece, how well it matched, or where she got stuck - and never say she "didn't get far" or anything that implies she did the wrong piece. Sometimes instead the JSON says this take just became the piece's new reference take (the one future takes will be measured against) - in that case there is no coverage or pace to report; just treat it as her having a strong, complete recording of the piece to build on next time, not a comparison against anything.

Praise her effort, her strategies, and specific improvements you can point to in the numbers - never her talent or how "good" or "talented" she is. This is what child-development people call process praise, and it's what keeps a kid willing to keep trying hard things: praise the trying, the sticking-with-it, and the concrete evidence of getting better, not some fixed quality she either has or doesn't. Never use negative labels for her playing or effort (nothing like "wrong", "bad", "mistake", "lazy", or "terrible" - even softened). Never compare her to a sibling or to any other child, by name or otherwise - she is only ever compared with her own earlier takes.

For a single take's feedback, you're filling in a kid note and a parent note.

The kid note has two parts. "praise" is at most two short sentences, written at a level a 7-year-old reading on her own can follow: warm, simple words, and specific - tie it to at least one real number from what you were given, translated into something she'd understand rather than the raw figure (say "only one long pause this time - last time there were three" rather than "hesitations: 1", say "you played more of the song than last time" rather than "coverage 62%"). "tryNext" is exactly one concrete, doable idea for next time, phrased as a friendly invitation rather than an instruction - things like practicing one tricky spot slowly, counting out loud while she plays, or trying the quiet parts even quieter. Keep it to one idea, one sentence. You may use at most one emoji across the whole kid note, and only if it fits naturally - most notes don't need one at all.

The parent note is 3 to 5 sentences for a grown-up who doesn't read music and doesn't play piano. Explain what the numbers actually say, in plain language, including the numbers themselves where that helps (seconds played, how many pauses, how far through the piece she got if that was measured). Say what changed compared with her earlier takes of the same piece, if you were given any - pausing less, playing longer, covering more of the piece. Suggest one concrete thing they could try in the next practice session (a slow-practice idea, a way to encourage her, a small goal). Be honest about the limits of what a phone microphone can tell you - if the picture is unclear, say so plainly rather than inventing confidence you don't have.

If the numbers are thin - a very short take with barely anything measured - don't stretch them into claims they can't support. Say something true and kind about her showing up and starting, and gently suggest playing a little longer next time so there's more to go on.

For a song's "journey" summary (written every few takes, not every take), you're looking at how one piece has changed across several days of practice, given as day-by-day numbers. The kid part is 2 to 3 sentences celebrating how the song has grown over those days, plus one small next step, in the same warm 7-year-old-friendly language as above. The parent part is 4 to 6 sentences walking through the trend in plain language, citing the actual numbers (how the pauses, playing time, or coverage of the piece changed from the earlier days to the more recent ones), and just as honest about uncertainty as the single-take note.

Always answer only with the JSON the schema asks for - no extra commentary, no markdown, nothing outside those fields.`

// ---------------------------------------------------------------------------
// JSON Schemas (Anthropic structured output: no minLength/maxLength/minimum -
// unsupported; every object needs additionalProperties:false and required)
// ---------------------------------------------------------------------------

export const FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    kid: {
      type: 'object',
      properties: {
        praise: { type: 'string' },
        tryNext: { type: 'string' },
      },
      required: ['praise', 'tryNext'],
      additionalProperties: false,
    },
    parent: {
      type: 'object',
      properties: {
        note: { type: 'string' },
      },
      required: ['note'],
      additionalProperties: false,
    },
  },
  required: ['kid', 'parent'],
  additionalProperties: false,
} as const

export const JOURNEY_SCHEMA = {
  type: 'object',
  properties: {
    kid: { type: 'string' },
    parent: { type: 'string' },
  },
  required: ['kid', 'parent'],
  additionalProperties: false,
} as const

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

/** A day/vintage of measured metrics for the same piece - callers pass what they have. */
export interface HistoryTake {
  day: string
  metrics: TakeMetrics
}

/** The best value seen so far for this piece, for whichever of these the caller was able to compute. */
export interface PersonalBests {
  longestPlayedSec?: number
  fewestHesitations?: number
  bestCoveragePct?: number
}

export type SelfRatingLabel = 'hard' | 'okay' | 'great'

export interface FeedbackInput {
  kidFirstName: string
  age: number
  /** null -> free play (no named piece). */
  pieceName: string | null
  /** The parent's current goal text for this piece, if any. */
  goalText?: string
  metrics: TakeMetrics
  /** Up to 5 previous analysed takes of the same piece, oldest first. */
  history: HistoryTake[]
  personalBests?: PersonalBests
  selfRating?: SelfRatingLabel
  /** "Played it! +1" taps logged during this take. */
  repetitions?: number
  /** 1 for her first analysed take of this piece, 2 for the second, etc. */
  takeNumber: number
  /** True when this take couldn't be confidently matched to the selected piece (probably a different piece, or free noodling) - wording should stay generic. */
  differentMusic?: boolean
  /** True when this take just became the piece's new reference take (the one future takes are measured against) - nothing to compare it to yet. */
  isNewReference?: boolean
}

/** Buckets a pace ratio into the plain-language comparison the system prompt asks Claude to use. */
function paceLabel(pace: number): string {
  if (pace < 0.9) return 'slower than her best take'
  if (pace > 1.1) return 'faster than her best take'
  return 'about the same speed as her best take'
}

/** Buckets a 0-1 position through the piece into a rough spot, rather than a precise fraction. */
function roughPosition(position: number): 'start' | 'middle' | 'end' {
  if (position < 1 / 3) return 'start'
  if (position < 2 / 3) return 'middle'
  return 'end'
}

/**
 * Renders only the metrics validated as trustworthy, as plain labelled
 * numbers. `omitReference` drops coverage/matchToBest/stumbles/paceVsBest
 * entirely - used when the take is flagged `differentMusic` or
 * `isNewReference`, where those numbers would be misleading or meaningless.
 */
function plainMetrics(m: TakeMetrics, opts: { omitReference?: boolean } = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    secondsPlayed: m.playedSec,
    pauseCount: m.hesitations,
    longestPauseSeconds: m.longestPauseSec,
    loudToSoftRangeDb: m.dynamicRangeDb,
  }
  if (opts.omitReference) return out
  if (m.coverage !== undefined) out.pieceCoveragePercent = Math.round(m.coverage * 100)
  if (m.matchToBest !== undefined) out.matchToReference0to1 = m.matchToBest
  if (m.paceVsBest !== undefined) {
    out.paceVsBestRatio = m.paceVsBest
    out.paceCompared = paceLabel(m.paceVsBest)
  }
  if (m.stumbles !== undefined && m.stumbles.length > 0) {
    out.stumbleCount = m.stumbles.length
    out.stumbleRoughPositions = m.stumbles.map(roughPosition)
  }
  return out
}

/** Compact JSON-ish text describing one take, for the "kid + parent feedback" request. */
export function buildFeedbackUser(input: FeedbackInput): string {
  const omitReference = Boolean(input.differentMusic || input.isNewReference)
  const obj: Record<string, unknown> = {
    kidFirstName: input.kidFirstName,
    age: input.age,
    piece: input.pieceName ?? 'free play',
    takeNumberForThisPiece: input.takeNumber,
    thisTake: plainMetrics(input.metrics, { omitReference }),
  }
  if (input.differentMusic) obj.differentMusic = true
  if (input.isNewReference) obj.referenceStatus = 'this take is now her reference take'
  if (input.goalText) obj.parentGoalForThisPiece = input.goalText
  if (input.selfRating) obj.kidSelfRating = input.selfRating
  if (input.repetitions) obj.playedItTapsThisTake = input.repetitions
  if (input.history.length > 0) {
    obj.previousTakesOfThisPiece = input.history.slice(-5).map((h) => ({ day: h.day, ...plainMetrics(h.metrics) }))
  }
  if (input.personalBests) obj.personalBestsForThisPiece = input.personalBests
  return JSON.stringify(obj)
}

/** One local day's best/median numbers for a piece, across however many takes she played that day. Only trustworthy metrics. */
export interface JourneyDayStat {
  day: string
  takes: number
  playedSecMedian: number
  playedSecBest: number
  hesitationsMedian: number
  hesitationsBest: number
  coveragePctMedian?: number
  coveragePctBest?: number
  paceVsBestMedian?: number
}

export interface JourneyInput {
  kidFirstName: string
  age: number
  pieceName: string
  goalText?: string
  /** Oldest day first. */
  series: JourneyDayStat[]
  /** How many analysed takes of the piece exist in total (may be more than the series covers). */
  takeCount: number
}

/** Compact JSON-ish text describing a piece's day-by-day trend, for the "song journey" request. */
export function buildJourneyUser(input: JourneyInput): string {
  const obj: Record<string, unknown> = {
    kidFirstName: input.kidFirstName,
    age: input.age,
    piece: input.pieceName,
    totalAnalysedTakes: input.takeCount,
    days: input.series,
  }
  if (input.goalText) obj.parentGoalForThisPiece = input.goalText
  return JSON.stringify(obj)
}

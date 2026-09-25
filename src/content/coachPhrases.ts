// The AI coach's offline fallback: built-in phrases used whenever Claude
// isn't reachable (no script URL, offline, the script has no API key, an
// error, a refusal, or invalid JSON back - see src/store/coach.ts). Follows
// the exact same tone rules as src/content/coachPrompt.ts's system prompt
// (process praise, never talent, no negative labels, no sibling/other-kid
// comparisons, kid.praise <= 2 sentences with at least one number turned
// into kid language, kid.tryNext exactly one invitation, parent.note 3-5
// sentences, journey kid 2-3 / parent 4-6) but picks from several
// pre-written variants instead of calling out anywhere. The variant for a
// given take is chosen by a stable hash of its id, so the same take always
// renders the same text.
//
// Only the metrics validated as trustworthy on real recordings are ever
// used: playedSec, hesitations, longestPauseSec, dynamicRangeDb, and (when
// available and not flagged `differentMusic`/`isNewReference`) coverage,
// matchToBest, stumbles, paceVsBest. tempoBpm/tempoDrift/steadiness/noteRate
// are never read here - see coachPrompt.ts's header comment for why.

import type { HistoryTake, JourneyDayStat, SelfRatingLabel } from './coachPrompt'
import { tooSimilar } from './coachVariety'
import type { TakeMetrics } from '../store/progress'

export interface RuleFeedbackContext {
  /** Seeds the deterministic variant pick - pass the take's own id. */
  takeId: string
  kidFirstName: string
  pieceName: string | null
  selfRating?: SelfRatingLabel
  repetitions?: number
  /** True when this take couldn't be confidently matched to the selected piece. */
  differentMusic?: boolean
  /** True when this take just became the piece's new reference take. */
  isNewReference?: boolean
  /** Her last few kid notes (of any piece) - variant picks that would read as a repeat of one of these are skipped. */
  recentNotes?: { praise: string; tryNext: string }[]
}

export interface RuleJourneyContext {
  /** Seeds the deterministic variant pick - pass the piece's own id. */
  pieceId: string
  kidFirstName: string
  pieceName: string
}

export interface RuleFeedbackResult {
  kid: { praise: string; tryNext: string }
  parent: { note: string }
}

export interface RuleJourneyResult {
  kid: string
  parent: string
}

// --- deterministic pick -----------------------------------------------------

function stableHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pick<T>(variants: readonly T[], seed: number): T {
  return variants[seed % variants.length]
}

/**
 * Like `pick`, but walks forward from the seeded index (wrapping) to find a
 * variant that doesn't read as a repeat of anything in `recent` - so the same
 * situation doesn't keep rendering the same line back to back. Falls back to
 * the plain seeded pick once every variant has been tried and still reads too
 * similar (a short variants list against a long recent history).
 */
function pickFresh(variants: readonly string[], seed: number, recent: readonly string[]): string {
  if (recent.length === 0) return pick(variants, seed)
  for (let offset = 0; offset < variants.length; offset++) {
    const candidate = variants[(seed + offset) % variants.length]
    if (!tooSimilar(candidate, recent)) return candidate
  }
  return pick(variants, seed)
}

/** Plain-language bucket for a pace ratio - same rule as coachPrompt.ts's system prompt asks Claude to follow. */
function paceWords(pace: number): string {
  if (pace < 0.9) return 'slower than her best take'
  if (pace > 1.1) return 'faster than her best take'
  return 'about the same as her best take'
}

// --- single-take feedback ---------------------------------------------------

const THIN_PLAYED_SEC = 15

function isThin(metrics: TakeMetrics): boolean {
  return metrics.playedSec < THIN_PLAYED_SEC
}

type Situation =
  | 'thin'
  | 'newReference'
  | 'differentMusic'
  | 'cleanRun'
  | 'fewerPauses'
  | 'fewerSticky'
  | 'moreCoverage'
  | 'slowPractice'
  | 'longer'
  | 'dynamics'
  | 'generic'

function pickSituation(metrics: TakeMetrics, prev: HistoryTake | undefined, ctx: RuleFeedbackContext): Situation {
  if (isThin(metrics)) return 'thin'
  if (ctx.isNewReference) return 'newReference'
  if (ctx.differentMusic) return 'differentMusic'
  // The strongest true fact wins. A pause count only earns praise when it is genuinely good news:
  // none at all, or a real drop (not 5 -> 4).
  // A slow, careful take is a strategy worth naming before anything else.
  if (metrics.paceVsBest !== undefined && metrics.paceVsBest < 0.9 && !(prev && prev.metrics.hesitations > 0 && metrics.hesitations === 0)) return 'slowPractice'
  if (ctx.pieceName && metrics.hesitations === 0 && (metrics.coverage === undefined || metrics.coverage >= 0.8) && metrics.playedSec >= 20) {
    return prev && prev.metrics.hesitations > 0 ? 'fewerPauses' : 'cleanRun'
  }
  if (prev && metrics.hesitations < prev.metrics.hesitations && (metrics.hesitations <= 1 || prev.metrics.hesitations - metrics.hesitations >= 2)) {
    return 'fewerPauses'
  }
  const stickyNow = metrics.stumbles?.length
  const stickyPrev = prev?.metrics.stumbles?.length
  if (stickyNow !== undefined && stickyPrev !== undefined && stickyPrev - stickyNow >= 2 && (!prev || metrics.hesitations <= prev.metrics.hesitations)) return 'fewerSticky'
  if (metrics.coverage !== undefined && prev?.metrics.coverage !== undefined && metrics.coverage > prev.metrics.coverage + 0.1) {
    return 'moreCoverage'
  }
  if (metrics.paceVsBest !== undefined && metrics.paceVsBest < 0.9) return 'slowPractice'
  if (prev && metrics.playedSec > prev.metrics.playedSec + 5) return 'longer'
  if (metrics.dynamicRangeDb >= 15) return 'dynamics'
  return 'generic'
}

function praiseFor(
  situation: Situation,
  metrics: TakeMetrics,
  prev: HistoryTake | undefined,
  name: string,
  seed: number,
  recentPraises: readonly string[],
): string {
  switch (situation) {
    case 'thin': {
      const variants = [
        `You sat down and got started today, ${name} - that is the hardest part!`,
        `Showing up to practice counts, ${name}, even on a short one like this.`,
        `Every time you sit down at the piano it adds up, ${name} - nice job starting today.`,
      ]
      return pickFresh(variants, seed, recentPraises)
    }
    case 'newReference': {
      const variants = [
        `You played all the way through so well today, ${name} - this is your best recording of it yet!`,
        `That was a strong, complete play-through, ${name}. This one is your new best take of this song.`,
        `You just set a new personal best on this song, ${name} - nice and complete from start to finish.`,
      ]
      return pickFresh(variants, seed, recentPraises)
    }
    case 'differentMusic': {
      const variants = [
        `You played for ${metrics.playedSec} seconds today, ${name} - nice work at the piano.`,
        `You spent good time at the keys today, ${name}.`,
      ]
      return `${pickFresh(variants, seed, recentPraises)} Keep exploring - it all helps.`
    }
    case 'fewerPauses': {
      const before = prev!.metrics.hesitations
      const now = metrics.hesitations
      const lead =
        now === 0
          ? `You played all the way through with no long pauses this time, ${name}!`
          : `Only ${now} long ${now === 1 ? 'pause' : 'pauses'} this time - last time there were ${before}.`
      const variants = [`${lead} That takes real focus.`, `${lead} You kept right on going.`]
      return pickFresh(variants, seed, recentPraises)
    }
    case 'cleanRun': {
      const variants = [
        `You kept the music going the whole way with no long pauses, ${name}. That is what regular practice does!`,
        `No long pauses at all this time, ${name} - you just kept on playing. Your practice is paying off.`,
        `You played it through without stopping, ${name}. All those tries are adding up.`,
      ]
      return pickFresh(variants, seed, recentPraises)
    }
    case 'fewerSticky': {
      const variants = [
        `The sticky spots are getting smoother, ${name} - there were fewer of them this time. Your careful practice is working.`,
        `Fewer tricky spots slowed you down today, ${name}. That comes from going over them again and again.`,
      ]
      return pickFresh(variants, seed, recentPraises)
    }
    case 'moreCoverage': {
      const variants = [
        `You played more of the song than last time, ${name} - you're getting further each time!`,
        `You made it further through the piece today than before, ${name}.`,
      ]
      return `${pickFresh(variants, seed, recentPraises)} That is real progress.`
    }
    case 'slowPractice': {
      const variants = [
        `You took it slow and careful today, ${name} - that is exactly how tricky spots get easier.`,
        `You played it slower on purpose today, ${name}. Slow practice is one of the best ways to learn a piece.`,
      ]
      return pickFresh(variants, seed, recentPraises)
    }
    case 'longer': {
      const variants = [
        `You played for longer today than last time, ${name} - you kept going! That is real practice muscle.`,
        `You stuck with it longer this time than before. Nice work sticking with it.`,
      ]
      return pickFresh(variants, seed, recentPraises)
    }
    case 'dynamics': {
      const variants = [
        `You played some parts loud and some parts soft today, ${name} - nice contrast! That makes the music way more interesting.`,
        `You made the quiet parts really quiet and the loud parts loud. That is a great strategy.`,
      ]
      return pickFresh(variants, seed, recentPraises)
    }
    default: {
      const variants = [
        `You practiced for ${metrics.playedSec} seconds today, ${name} - nice work sticking with it. Keep at it and it will keep getting smoother.`,
        `You put in real effort today, ${name}. Every practice like this one adds up.`,
      ]
      return pickFresh(variants, seed, recentPraises)
    }
  }
}

function tryNextFor(metrics: TakeMetrics, ctx: RuleFeedbackContext, seed: number, recentTryNexts: readonly string[]): string {
  if (isThin(metrics)) {
    const variants = [
      `Next time, want to try playing for a little longer before you stop?`,
      `How about picking one more minute to play through next time?`,
    ]
    return pickFresh(variants, seed, recentTryNexts)
  }
  if (metrics.hesitations > 0) {
    const variants = [
      `Want to try playing the tricky spot slowly a few times before speeding it back up?`,
      `Maybe pick the part where you paused and practice just that bit slowly?`,
    ]
    return pickFresh(variants, seed, recentTryNexts)
  }
  if (!ctx.differentMusic && !ctx.isNewReference && metrics.coverage !== undefined && metrics.coverage < 0.5) {
    const variants = [
      `Want to try playing all the way to the end next time, even if it gets a little wobbly?`,
      `How about trying to make it further through the song next time before stopping?`,
    ]
    return pickFresh(variants, seed, recentTryNexts)
  }
  if (metrics.dynamicRangeDb < 8) {
    const variants = [
      `Next time, want to try making the quiet parts even quieter?`,
      `How about picking one spot to play extra soft next time?`,
    ]
    return pickFresh(variants, seed, recentTryNexts)
  }
  if ((metrics.stumbles?.length ?? 0) >= 2) {
    const variants = [
      `Want to pick one sticky spot and play just that bit slowly three times?`,
      `How about finding the trickiest spot and giving it a slow, careful turn next time?`,
    ]
    return pickFresh(variants, seed, recentTryNexts)
  }
  const variants = [
    `Want to play it for someone at home next time, like a tiny concert?`,
    `How about choosing one part to play extra softly and one part nice and strong?`,
    `Want to try it once more at a calm walking speed and listen to how even it sounds?`,
  ]
  return pickFresh(variants, seed, recentTryNexts)
}

/** Where most of the sticky spots were, in plain words. */
function stickyWhere(stumbles: number[]): string {
  const mean = stumbles.reduce((a, b) => a + b, 0) / stumbles.length
  if (mean < 0.34) return 'mostly near the start'
  if (mean < 0.67) return 'mostly around the middle'
  return 'mostly towards the end'
}

/** One practice idea for the grown-up that actually fits what was measured. */
function parentStrategy(metrics: TakeMetrics, ctx: RuleFeedbackContext): string {
  const compared = !ctx.differentMusic && !ctx.isNewReference
  if (metrics.hesitations > 0) {
    return `One thing worth trying next session: find the spot just before a long pause and practise only that bit slowly a few times.`
  }
  if (compared && (metrics.stumbles?.length ?? 0) >= 2) {
    return `One thing worth trying next session: pick one of the sticky spots and play just those few notes slowly three times before a full run.`
  }
  if (compared && metrics.coverage !== undefined && metrics.coverage < 0.8) {
    return `One thing worth trying next session: start from the last part of the piece, so the ending gets as much practice as the beginning.`
  }
  if (compared && metrics.paceVsBest !== undefined && metrics.paceVsBest > 1.1) {
    return `She is getting quicker; one calm run at a walking speed next session will help keep it even rather than rushed.`
  }
  if (metrics.dynamicRangeDb < 10) {
    return `A nice next step: ask her where the music should be quiet and where it should be strong, and try exaggerating both.`
  }
  return `This one is in good shape - a fun next step is a little "concert take" played for someone at home.`
}

function parentNoteFor(metrics: TakeMetrics, history: HistoryTake[], ctx: RuleFeedbackContext): string {
  const name = ctx.kidFirstName
  const piece = ctx.pieceName ?? 'free play'
  const where = ctx.pieceName ? `on ${piece}` : 'during free play'
  const prev = history.at(-1)
  const sentences: string[] = []

  if (isThin(metrics)) {
    sentences.push(
      `${name} played for about ${metrics.playedSec} seconds today ${where} - not quite enough for the app to measure much beyond that yet.`,
    )
    sentences.push(
      `These numbers come from the tablet's microphone, so a short take like this just does not give it much to go on.`,
    )
    sentences.push(`A slightly longer take next time (even 30-40 seconds) would give a much clearer picture.`)
    return sentences.join(' ')
  }

  const pausePhrase =
    metrics.hesitations === 0
      ? 'with no long pauses'
      : `with ${metrics.hesitations} long ${metrics.hesitations === 1 ? 'pause' : 'pauses'} (the longest about ${metrics.longestPauseSec} s)`
  sentences.push(`${name} played for ${metrics.playedSec} seconds ${where} today, ${pausePhrase}.`)

  if (prev) {
    if (metrics.hesitations < prev.metrics.hesitations) {
      sentences.push(`That is fewer pauses than her last take of this piece, which had ${prev.metrics.hesitations}.`)
    } else if (metrics.hesitations > prev.metrics.hesitations) {
      sentences.push(
        `That is a few more pauses than last time (${prev.metrics.hesitations}) - not unusual day to day, especially on a harder section.`,
      )
    } else if (metrics.hesitations > 0) {
      sentences.push(`That is the same number of pauses as her last take of this piece.`)
    } else {
      sentences.push(`Her last take of this piece had no long pauses either, so that is holding steady.`)
    }
  }

  if (ctx.isNewReference) {
    sentences.push(`This is now her reference take for this piece - her strongest complete recording so far, which future takes will be measured against.`)
  } else if (ctx.differentMusic) {
    sentences.push(
      `The app could not confidently match this take to the piece she had selected, so it is only reporting playing time and pauses this time.`,
    )
  } else if (metrics.coverage !== undefined) {
    const paceClause = metrics.paceVsBest !== undefined ? `, at a pace ${paceWords(metrics.paceVsBest)}` : ''
    const through = metrics.coverage >= 0.97 ? 'She played the piece all the way through' : `She got through about ${Math.round(metrics.coverage * 100)} % of the piece`
    const sticky =
      metrics.stumbles && metrics.stumbles.length > 0
        ? ` The app noticed ${metrics.stumbles.length} sticky ${metrics.stumbles.length === 1 ? 'spot' : 'spots'} where she lingered or repeated, ${stickyWhere(metrics.stumbles)}.`
        : ''
    sentences.push(`${through}${paceClause}.${sticky}`)
  }

  sentences.push(parentStrategy(metrics, ctx))
  sentences.push(`Keep in mind these are rough estimates from a tablet microphone, not a note-by-note read of her playing.`)

  return sentences.join(' ')
}

/**
 * Deterministic built-in feedback for one take, following the same tone
 * rules as the Claude prompt. `history` is the piece's previous analysed
 * takes (oldest first) - the most recent one (`history.at(-1)`) is used for
 * "fewer pauses than last time" style comparisons.
 */
export function ruleFeedback(metrics: TakeMetrics, history: HistoryTake[], ctx: RuleFeedbackContext): RuleFeedbackResult {
  const seed = stableHash(ctx.takeId)
  const prev = history.at(-1)
  const situation = pickSituation(metrics, prev, ctx)
  const recentPraises = ctx.recentNotes?.map((n) => n.praise) ?? []
  const recentTryNexts = ctx.recentNotes?.map((n) => n.tryNext) ?? []
  return {
    kid: {
      praise: praiseFor(situation, metrics, prev, ctx.kidFirstName, seed, recentPraises),
      tryNext: tryNextFor(metrics, ctx, seed + 1, recentTryNexts),
    },
    parent: { note: parentNoteFor(metrics, history, ctx) },
  }
}

// --- piece journey -----------------------------------------------------------

/**
 * Deterministic built-in "how this song has grown" summary from a piece's
 * day-by-day series (oldest first, as built by src/store/coach.ts's
 * requestJourney).
 */
export function ruleJourney(series: JourneyDayStat[], ctx: RuleJourneyContext): RuleJourneyResult {
  const seed = stableHash(`${ctx.pieceId}:${series.length}`)
  const name = ctx.kidFirstName
  const piece = ctx.pieceName
  const first = series[0]
  const last = series[series.length - 1]

  const openers = [
    `${name}, ${piece} has been getting stronger every time you practice it.`,
    `Look how far ${piece} has come, ${name} - you have been sticking with it!`,
    `${piece} sounds better each time you sit down with it, ${name}.`,
  ]
  let kidTrend = `You keep coming back to it, and that is how songs get easy.`
  if (first && last) {
    if (last.hesitationsMedian < first.hesitationsMedian) {
      kidTrend = `You are pausing less than when you started.`
    } else if (
      last.coveragePctMedian !== undefined &&
      first.coveragePctMedian !== undefined &&
      last.coveragePctMedian > first.coveragePctMedian
    ) {
      kidTrend = `You are getting further through the song than when you started.`
    }
  }
  const nextSteps = [
    `Next time, try playing it all the way through one more time than usual.`,
    `Next time, maybe try the tricky part slowly before playing the whole thing.`,
    `Next time, see if you can play it just a little longer.`,
  ]
  const kid = `${pick(openers, seed)} ${kidTrend} ${pick(nextSteps, seed + 1)}`

  const parentSentences: string[] = []
  parentSentences.push(`Over ${series.length} day${series.length === 1 ? '' : 's'} of practicing ${piece}, here is the trend the numbers show.`)
  if (first && last) {
    parentSentences.push(`Pauses per take went from about ${first.hesitationsMedian} on ${first.day} to about ${last.hesitationsMedian} most recently.`)
    if (first.coveragePctMedian !== undefined && last.coveragePctMedian !== undefined) {
      parentSentences.push(`She is now getting through about ${last.coveragePctMedian}% of the piece, versus ${first.coveragePctMedian}% early on.`)
    }
    if (last.paceVsBestMedian !== undefined) {
      parentSentences.push(`Her recent pace has been ${paceWords(last.paceVsBestMedian)}.`)
    }
  }
  parentSentences.push(`One idea for the next few sessions: keep the sessions short but frequent, and revisit whichever spot she pauses at most.`)
  parentSentences.push(`As always, these are rough estimates from a tablet microphone rather than a precise read of note accuracy.`)

  return { kid, parent: parentSentences.slice(0, 6).join(' ') }
}

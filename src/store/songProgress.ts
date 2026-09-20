// Pure helpers that turn a piece's analysed takes (`take.ai.metrics`, written
// by the coach engine - see src/store/coach.ts) into what the kid-facing
// SongJourney screen and the parent's journeys card need: a per-day series
// for the mini charts, personal bests, kid-friendly milestone ribbons, a
// simple trend read, and which take to hold up as "my best one so far".
// Kept free of React and the progress store's `update()`, like
// pianoRewards.ts, so every rule here is trivial to unit test.
//
// `tempoBpm` / `tempoDrift` / `steadiness` are unreliable on real music (see
// TakeMetrics.paceVsBest's doc comment in progress.ts) and are deliberately
// never read here - `paceVsBest` (renamed `pace` below) is the only speed
// signal this file trusts.

import type { PianoTake, TakeCoach } from './progress'

/** A take of the given piece that has been measured by the coach engine. */
export type AnalysedTake = PianoTake & { ai: TakeCoach }

/**
 * Non-note takes of `pieceId` that carry coach metrics, oldest first. A take
 * whose `matchToBest` says it doesn't really match this piece (probably a
 * different piece played while this one stayed selected) is dropped - it's
 * still shown on the journey screen's plain take list, just not folded into
 * the piece's own history.
 */
export function analysedTakes(takes: PianoTake[], pieceId: string): AnalysedTake[] {
  return takes
    .filter((t): t is AnalysedTake => {
      if (t.isNote || t.pieceId !== pieceId || t.ai?.metrics === undefined) return false
      const match = t.ai.metrics.matchToBest
      return match === undefined || match >= 0.5
    })
    .sort((a, b) => a.startedAt - b.startedAt)
}

export interface SeriesPoint {
  day: string
  /** How many analysed takes of the piece were recorded this day. */
  takes: number
  /** Fewest hesitations among the day's takes. */
  hesitations: number
  /** Fewest sticky spots (`stumbles.length`) among the day's takes; undefined when none measured it. */
  stumbles?: number
  /** Best (highest) coverage among the day's takes; undefined when none measured it. */
  coverage?: number
  /** Median speed-vs-best-take (`paceVsBest`) among the day's takes; undefined when none measured it. */
  pace?: number
  /** Longest playedSec among the day's takes. */
  playedSec: number
}

function median(sortedAsc: number[]): number {
  const mid = Math.floor(sortedAsc.length / 2)
  return sortedAsc.length % 2 === 1 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2
}

function definedNumbers(values: (number | undefined)[]): number[] {
  return values.filter((v): v is number => v !== undefined)
}

function stumbleCount(t: AnalysedTake): number | undefined {
  return t.ai.metrics.stumbles ? t.ai.metrics.stumbles.length : undefined
}

/** One point per local day the piece was played, oldest first. */
export function pieceSeries(takes: PianoTake[], pieceId: string): SeriesPoint[] {
  const list = analysedTakes(takes, pieceId)
  const byDay = new Map<string, AnalysedTake[]>()
  for (const t of list) {
    const bucket = byDay.get(t.day)
    if (bucket) bucket.push(t)
    else byDay.set(t.day, [t])
  }
  return Array.from(byDay.keys())
    .sort()
    .map((day) => {
      const dayTakes = byDay.get(day) as AnalysedTake[]
      const stumbleVals = definedNumbers(dayTakes.map(stumbleCount))
      const coverageVals = definedNumbers(dayTakes.map((t) => t.ai.metrics.coverage))
      const paceVals = definedNumbers(dayTakes.map((t) => t.ai.metrics.paceVsBest)).sort((a, b) => a - b)
      return {
        day,
        takes: dayTakes.length,
        hesitations: Math.min(...dayTakes.map((t) => t.ai.metrics.hesitations)),
        stumbles: stumbleVals.length > 0 ? Math.min(...stumbleVals) : undefined,
        coverage: coverageVals.length > 0 ? Math.max(...coverageVals) : undefined,
        pace: paceVals.length > 0 ? median(paceVals) : undefined,
        playedSec: Math.max(...dayTakes.map((t) => t.ai.metrics.playedSec)),
      }
    })
}

export interface PersonalBests {
  fewestPauses?: string
  fewestStickySpots?: string
  furthest?: string
  longest?: string
}

/** The take id holding each personal best, undefined for any with no data at all. */
export function personalBests(takes: PianoTake[], pieceId: string): PersonalBests {
  const list = analysedTakes(takes, pieceId)

  let fewestPausesId: string | undefined
  let fewestPausesVal = Infinity
  let fewestStickyId: string | undefined
  let fewestStickyVal = Infinity
  let furthestId: string | undefined
  let furthestVal = -Infinity
  let longestId: string | undefined
  let longestVal = -Infinity

  for (const t of list) {
    const m = t.ai.metrics
    if (m.hesitations < fewestPausesVal) {
      fewestPausesVal = m.hesitations
      fewestPausesId = t.id
    }
    const stumbles = stumbleCount(t)
    if (stumbles !== undefined && stumbles < fewestStickyVal) {
      fewestStickyVal = stumbles
      fewestStickyId = t.id
    }
    if (m.coverage !== undefined && m.coverage > furthestVal) {
      furthestVal = m.coverage
      furthestId = t.id
    }
    if (m.playedSec > longestVal) {
      longestVal = m.playedSec
      longestId = t.id
    }
  }

  return { fewestPauses: fewestPausesId, fewestStickySpots: fewestStickyId, furthest: furthestId, longest: longestId }
}

export interface Milestone {
  id: string
  day: string
  text: string
}

const TAKE_COUNT_MILESTONES = [5, 10, 20]

/** Kid-friendly ribbons earned across the piece's history, newest first, capped at 6. */
export function milestones(takes: PianoTake[], pieceId: string): Milestone[] {
  const list = analysedTakes(takes, pieceId)
  const earned: Milestone[] = []

  let sawAHesitation = false
  let noPauseMilestoneAdded = false
  let fullPlayMilestoneAdded = false
  let bestStumbles: number | undefined

  list.forEach((take, index) => {
    const takeNumber = index + 1
    const m = take.ai.metrics

    if (!noPauseMilestoneAdded && m.hesitations === 0 && sawAHesitation) {
      earned.push({ id: `no-pause-${take.id}`, day: take.day, text: 'First time with no long pauses 🎉' })
      noPauseMilestoneAdded = true
    }
    if (m.hesitations > 0) sawAHesitation = true

    if (!fullPlayMilestoneAdded && m.coverage !== undefined && m.coverage >= 0.95) {
      earned.push({ id: `full-play-${take.id}`, day: take.day, text: 'Played it all the way through 🏁' })
      fullPlayMilestoneAdded = true
    }

    const stumbles = stumbleCount(take)
    if (stumbles !== undefined && (m.coverage ?? 0) >= 0.8) {
      if (bestStumbles !== undefined && stumbles < bestStumbles) {
        earned.push({ id: `sticky-${take.id}`, day: take.day, text: 'Fewest sticky spots yet ✨' })
      }
      if (bestStumbles === undefined || stumbles < bestStumbles) bestStumbles = stumbles
    }

    if (TAKE_COUNT_MILESTONES.includes(takeNumber)) {
      earned.push({ id: `takes-${takeNumber}-${take.id}`, day: take.day, text: `${takeNumber} takes of this song 💪` })
    }
  })

  return earned.slice(-6).reverse()
}

export type SeriesKey = 'hesitations' | 'stumbles' | 'coverage' | 'pace'

/** 'up' / 'down' / 'flat' comparing the mean of the first third of days to the last third (needs >= 3 days of data). */
export function trend(series: SeriesPoint[], key: SeriesKey): 'up' | 'down' | 'flat' {
  if (series.length < 3) return 'flat'
  const third = Math.max(1, Math.floor(series.length / 3))
  const firstVals = definedNumbers(series.slice(0, third).map((p) => p[key]))
  const lastVals = definedNumbers(series.slice(series.length - third).map((p) => p[key]))
  if (firstVals.length === 0 || lastVals.length === 0) return 'flat'
  const firstMean = firstVals.reduce((a, b) => a + b, 0) / firstVals.length
  const lastMean = lastVals.reduce((a, b) => a + b, 0) / lastVals.length
  const diff = lastMean - firstMean
  if (Math.abs(diff) < 1e-9) return 'flat'
  return diff > 0 ? 'up' : 'down'
}

/** The take that best represents the piece so far, by a simple weighted composite of its metrics. */
export function bestTakeId(takes: PianoTake[], pieceId: string): string | undefined {
  const list = analysedTakes(takes, pieceId)
  let bestId: string | undefined
  let bestScore = -Infinity
  for (const t of list) {
    const m = t.ai.metrics
    const score =
      (m.coverage ?? 1) * 0.6 +
      (m.hesitations === 0 ? 0.25 : 0.25 / (1 + m.hesitations)) +
      0.15 / (1 + (m.stumbles?.length ?? 0))
    if (score > bestScore) {
      bestScore = score
      bestId = t.id
    }
  }
  return bestId
}

// Turns a take's recorded note-onset timestamps into a single 0-1 "how
// steady was the beat" score, shown as 1-5 dots (see the done screen,
// TakeCard, and ParentReview). Pure and synchronous so it's trivial to unit
// test against synthetic onset lists.

const WINDOW_MS = 60_000
const MIN_ONSETS = 8
const MIN_INTERVAL_MS = 120 // drops double-triggers on one note attack
const MAX_INTERVAL_MS = 2_000 // drops a rest between phrases from counting as "unsteady"
const MIN_INTERVALS = 6

/** The contiguous run of `onsets` (already sorted) with the most entries inside any 60s window. */
function densestWindow(onsets: number[]): number[] {
  let bestStart = 0
  let bestEnd = 0 // exclusive
  let windowStart = 0
  for (let end = 0; end < onsets.length; end++) {
    while (onsets[end] - onsets[windowStart] > WINDOW_MS) windowStart++
    if (end - windowStart + 1 > bestEnd - bestStart) {
      bestStart = windowStart
      bestEnd = end + 1
    }
  }
  return onsets.slice(bestStart, bestEnd)
}

/**
 * 0 (erratic) to 1 (metronomic) steadiness from a take's onset timestamps
 * (ms since the take started). Needs at least 8 onsets and, after picking
 * the densest 60s window and dropping double-triggers (<120ms apart) and
 * rests (>2000ms apart), at least 6 remaining inter-onset intervals -
 * otherwise there simply isn't enough evidence and this returns `undefined`
 * (hidden in the UI rather than shown as a misleadingly precise number).
 */
export function steadinessScore(onsetsMs: number[]): number | undefined {
  if (onsetsMs.length < MIN_ONSETS) return undefined

  const sorted = [...onsetsMs].sort((a, b) => a - b)
  const windowed = densestWindow(sorted)

  const intervals: number[] = []
  for (let i = 1; i < windowed.length; i++) {
    const gap = windowed[i] - windowed[i - 1]
    if (gap >= MIN_INTERVAL_MS && gap <= MAX_INTERVAL_MS) intervals.push(gap)
  }

  if (intervals.length < MIN_INTERVALS) return undefined

  const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length
  if (mean <= 0) return undefined
  const variance = intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length
  const sd = Math.sqrt(variance)
  const cv = sd / mean

  return Math.max(0, Math.min(1, 1 - cv))
}

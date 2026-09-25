// Pure stepping rules for the parent-facing marks editor (Settings > Daily
// goals). Kept free of React/the progress store so the stepping math - keep
// minutes ascending, clamp tokens 0-3 - is trivial to unit test; the
// component (src/components/MarksEditor.tsx) stays a thin wrapper that reads
// `pianoMarks(settings)`, calls these, and writes the result back.

import type { PianoMark, TokenCounts } from './progress'

const MINUTES_STEP = 5
/** Mark 1 (the ring goal) can never go below this - matches the cube/piano goal minimums elsewhere. */
const MIN_ROW1_MINUTES = 5
const MAX_TOKENS_PER_TIER = 3

function cloneMarks(marks: PianoMark[]): PianoMark[] {
  return marks.map((m) => ({ minutes: m.minutes, tokens: { ...m.tokens } }))
}

/**
 * Whether a minutes step is allowed. `+` is always allowed (later rows get
 * pushed up if needed - see stepMarkMinutes). `-` is disabled when it would
 * make this row's minutes equal or drop below the previous row's (row 0's
 * "previous row" is the fixed floor of 5 minutes).
 */
export function canStepMinutes(marks: PianoMark[], row: number, delta: number): boolean {
  if (delta > 0) return true
  const next = marks[row].minutes - MINUTES_STEP
  const floor = row === 0 ? MIN_ROW1_MINUTES : marks[row - 1].minutes
  return row === 0 ? next >= floor : next > floor
}

/**
 * Steps row `row`'s minutes by one `MINUTES_STEP` (delta > 0 = +5, delta < 0
 * = -5). Stepping up pushes any following row that would no longer be
 * strictly ascending up by the same step. Stepping down when
 * `canStepMinutes` would say no is a no-op (returns `marks` unchanged).
 */
export function stepMarkMinutes(marks: PianoMark[], row: number, delta: number): PianoMark[] {
  if (delta < 0 && !canStepMinutes(marks, row, delta)) return marks
  const next = cloneMarks(marks)
  next[row].minutes += delta > 0 ? MINUTES_STEP : -MINUTES_STEP
  for (let i = row + 1; i < next.length; i++) {
    if (next[i].minutes <= next[i - 1].minutes) next[i].minutes = next[i - 1].minutes + MINUTES_STEP
  }
  return next
}

/** Steps one token tier on row `row` by +1/-1, clamped to 0..3. A no-op at either bound returns `marks` unchanged. */
export function stepMarkTokens(marks: PianoMark[], row: number, tier: keyof TokenCounts, delta: number): PianoMark[] {
  const current = marks[row].tokens[tier]
  const value = Math.min(MAX_TOKENS_PER_TIER, Math.max(0, current + delta))
  if (value === current) return marks
  const next = cloneMarks(marks)
  next[row].tokens[tier] = value
  return next
}

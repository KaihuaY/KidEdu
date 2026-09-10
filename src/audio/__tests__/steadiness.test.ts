import { describe, expect, it } from 'vitest'
import { steadinessScore } from '../steadiness'

/** Cumulative onset timestamps from a list of inter-onset gaps, starting at 0. */
function onsetsFromGaps(gaps: number[]): number[] {
  const out: number[] = [0]
  let t = 0
  for (const g of gaps) {
    t += g
    out.push(t)
  }
  return out
}

describe('steadinessScore', () => {
  it('scores a metronomic 500ms beat close to perfectly steady', () => {
    const onsets = onsetsFromGaps(new Array(19).fill(500)) // 20 onsets, 19 intervals
    const score = steadinessScore(onsets)
    expect(score).toBeDefined()
    expect(score!).toBeGreaterThanOrEqual(0.95)
  })

  it('scores wildly irregular timing well under 0.5', () => {
    // Alternates short (~130-220ms) and long (~1650-1900ms) gaps - high variance.
    const onsets = onsetsFromGaps([130, 1900, 140, 1850, 160, 1800, 200, 1700, 220, 1650])
    const score = steadinessScore(onsets)
    expect(score).toBeDefined()
    expect(score!).toBeLessThan(0.5)
  })

  it('is undefined with fewer than 8 onsets', () => {
    const onsets = onsetsFromGaps([500, 500, 500, 500]) // 5 onsets total
    expect(steadinessScore(onsets)).toBeUndefined()
  })

  it('is undefined when too few intervals survive the 120ms/2000ms filters', () => {
    // 8 onsets, but every other gap is a >2000ms rest - only 4 short intervals survive, below the 6-interval floor.
    const onsets = onsetsFromGaps([300, 2500, 300, 2500, 300, 2500, 300])
    expect(steadinessScore(onsets)).toBeUndefined()
  })

  it('picks the densest 60s window rather than averaging over the whole take', () => {
    // A short, irregular warm-up burst (4 onsets, wide swings)...
    const warmup = [0, 300, 2200, 2450]
    // ...then, far more than 60s later (so no single window spans both), a
    // long, perfectly metronomic run (10 onsets, denser than the warm-up).
    const steadyRun = Array.from({ length: 10 }, (_, i) => 100_000 + i * 500)
    const onsets = [...warmup, ...steadyRun]

    const score = steadinessScore(onsets)
    expect(score).toBeDefined()
    // If the warm-up's irregular intervals leaked in, the score would be
    // pulled well below this - the densest window should isolate the steady
    // run on its own.
    expect(score!).toBeGreaterThanOrEqual(0.98)
  })
})

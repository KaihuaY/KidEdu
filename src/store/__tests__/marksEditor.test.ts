import { describe, expect, it } from 'vitest'
import type { PianoMark } from '../progress'
import { canStepMinutes, stepMarkMinutes, stepMarkTokens } from '../marksEditor'

function marks(...minutes: number[]): PianoMark[] {
  return minutes.map((m) => ({ minutes: m, tokens: { gold: 0, silver: 0, bronze: 0 } }))
}

describe('canStepMinutes', () => {
  it('always allows stepping up', () => {
    expect(canStepMinutes(marks(10, 20, 30), 0, 1)).toBe(true)
    expect(canStepMinutes(marks(10, 20, 30), 2, 1)).toBe(true)
  })

  it('disables row 0 stepping down below the 5-minute floor', () => {
    expect(canStepMinutes(marks(10, 20, 30), 0, -1)).toBe(true)
    expect(canStepMinutes(marks(5, 20, 30), 0, -1)).toBe(false)
  })

  it('disables a row stepping down to equal or below the previous row', () => {
    expect(canStepMinutes(marks(10, 20, 30), 1, -1)).toBe(true) // 20 -> 15, still > 10
    expect(canStepMinutes(marks(10, 15, 30), 1, -1)).toBe(false) // 15 -> 10, equals row 0
    expect(canStepMinutes(marks(10, 12, 30), 1, -1)).toBe(false) // 12 -> 7, below row 0 (10)
  })
})

describe('stepMarkMinutes', () => {
  it('steps a row up by 5 without touching other rows when they stay ascending', () => {
    expect(stepMarkMinutes(marks(10, 20, 30), 0, 1).map((m) => m.minutes)).toEqual([15, 20, 30])
  })

  it('pushes following rows up by 5 when stepping up would collide', () => {
    expect(stepMarkMinutes(marks(10, 15, 20), 0, 1).map((m) => m.minutes)).toEqual([15, 20, 25])
    expect(stepMarkMinutes(marks(10, 15, 16), 1, 1).map((m) => m.minutes)).toEqual([10, 20, 25])
  })

  it('steps a row down by 5 when allowed', () => {
    expect(stepMarkMinutes(marks(10, 20, 30), 1, -1).map((m) => m.minutes)).toEqual([10, 15, 30])
  })

  it('is a no-op stepping down past the floor or the previous row', () => {
    const atFloor = marks(5, 20, 30)
    expect(stepMarkMinutes(atFloor, 0, -1)).toBe(atFloor)
    const atPrev = marks(10, 15, 30)
    expect(stepMarkMinutes(atPrev, 1, -1)).toBe(atPrev)
  })

  it('does not mutate the input array', () => {
    const original = marks(10, 20, 30)
    const snapshot = original.map((m) => ({ ...m }))
    stepMarkMinutes(original, 0, 1)
    expect(original).toEqual(snapshot)
  })
})

describe('stepMarkTokens', () => {
  it('steps a tier up and down within 0..3', () => {
    const m = marks(10, 20, 30)
    const up = stepMarkTokens(m, 0, 'gold', 1)
    expect(up[0].tokens).toEqual({ gold: 1, silver: 0, bronze: 0 })
    const down = stepMarkTokens(up, 0, 'gold', -1)
    expect(down[0].tokens).toEqual({ gold: 0, silver: 0, bronze: 0 })
  })

  it('clamps at 3 and is a no-op past either bound', () => {
    const atMax: PianoMark[] = [{ minutes: 10, tokens: { gold: 3, silver: 0, bronze: 0 } }, { minutes: 20, tokens: { gold: 0, silver: 0, bronze: 0 } }, { minutes: 30, tokens: { gold: 0, silver: 0, bronze: 0 } }]
    expect(stepMarkTokens(atMax, 0, 'gold', 1)).toBe(atMax)
    const atMin = marks(10, 20, 30)
    expect(stepMarkTokens(atMin, 0, 'silver', -1)).toBe(atMin)
  })

  it('does not touch other rows or other tiers', () => {
    const m = marks(10, 20, 30)
    const next = stepMarkTokens(m, 1, 'bronze', 1)
    expect(next[0].tokens).toEqual({ gold: 0, silver: 0, bronze: 0 })
    expect(next[1].tokens).toEqual({ gold: 0, silver: 0, bronze: 1 })
    expect(next[2].tokens).toEqual({ gold: 0, silver: 0, bronze: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import {
  PIANO_GOAL_TIER,
  activeSecondsForDay,
  daysNeedingParentRating,
  goalProgress,
  goalReached,
  pianoDaysDone,
  takesForDay,
  tokenForParentStars,
} from '../pianoRewards'
import type { PianoSection, PianoTake } from '../progress'

function take(overrides: Partial<PianoTake> = {}): PianoTake {
  return {
    id: 'take-1',
    day: '2026-09-07',
    pieceId: null,
    startedAt: 0,
    durationSec: 60,
    activeSec: 30,
    mimeType: 'audio/webm',
    sizeBytes: 1000,
    hasAudio: true,
    deviceId: 'device-1',
    ...overrides,
  }
}

function piano(overrides: Partial<PianoSection> = {}): PianoSection {
  return {
    takes: [],
    days: {},
    streak: { current: 0, best: 0, lastDay: '' },
    updatedAt: 0,
    ...overrides,
  }
}

describe('tokenForParentStars', () => {
  it('1 star earns nothing extra', () => {
    expect(tokenForParentStars(1)).toBeNull()
  })
  it('2 stars earns silver', () => {
    expect(tokenForParentStars(2)).toBe('silver')
  })
  it('3 stars earns gold', () => {
    expect(tokenForParentStars(3)).toBe('gold')
  })
})

describe('PIANO_GOAL_TIER', () => {
  it('is bronze', () => {
    expect(PIANO_GOAL_TIER).toBe('bronze')
  })
})

describe('takesForDay / activeSecondsForDay', () => {
  it('filters to the given local day and sums active seconds', () => {
    const takes = [
      take({ id: 'a', day: '2026-09-06', activeSec: 100 }),
      take({ id: 'b', day: '2026-09-07', activeSec: 200 }),
      take({ id: 'c', day: '2026-09-07', activeSec: 50 }),
    ]
    expect(takesForDay(takes, '2026-09-07').map((t) => t.id)).toEqual(['b', 'c'])
    expect(activeSecondsForDay(takes, '2026-09-07')).toBe(250)
    expect(activeSecondsForDay(takes, '2026-09-08')).toBe(0)
  })
})

describe('goalReached', () => {
  it('is reached at exactly goalMinutes * 60 seconds, not before', () => {
    expect(goalReached(899, 15)).toBe(false)
    expect(goalReached(900, 15)).toBe(true)
    expect(goalReached(901, 15)).toBe(true)
  })
})

describe('goalProgress', () => {
  it('is clamped to 0..1', () => {
    expect(goalProgress(-10, 15)).toBe(0)
    expect(goalProgress(0, 15)).toBe(0)
    expect(goalProgress(450, 15)).toBeCloseTo(0.5)
    expect(goalProgress(900, 15)).toBe(1)
    expect(goalProgress(1800, 15)).toBe(1)
  })

  it('never divides by zero for a zero-minute goal', () => {
    expect(goalProgress(0, 0)).toBe(1)
    expect(goalProgress(30, 0)).toBe(1)
  })
})

describe('daysNeedingParentRating', () => {
  it('lists only days within the window that have a take and no parentStars, newest first', () => {
    const section = piano({
      takes: [
        take({ id: 'a', day: '2026-09-01' }), // before the 3-day window
        take({ id: 'b', day: '2026-09-05' }),
        take({ id: 'c', day: '2026-09-06' }),
        take({ id: 'd', day: '2026-09-07' }),
      ],
      days: {
        '2026-09-06': { parentStars: 3, parentRatedAt: 1 },
      },
    })
    expect(daysNeedingParentRating(section, '2026-09-07', 3)).toEqual(['2026-09-07', '2026-09-05'])
  })

  it('excludes days with no takes even when inside the window', () => {
    const section = piano({ takes: [take({ day: '2026-09-07' })] })
    expect(daysNeedingParentRating(section, '2026-09-07', 14)).toEqual(['2026-09-07'])
  })

  it('excludes fully-rated days', () => {
    const section = piano({
      takes: [take({ day: '2026-09-07' })],
      days: { '2026-09-07': { parentStars: 2, parentRatedAt: 1 } },
    })
    expect(daysNeedingParentRating(section, '2026-09-07', 14)).toEqual([])
  })

  it('defaults to a 14-day window', () => {
    const section = piano({
      takes: [take({ id: 'old', day: '2026-08-01' }), take({ id: 'new', day: '2026-09-07' })],
    })
    expect(daysNeedingParentRating(section, '2026-09-07')).toEqual(['2026-09-07'])
  })
})

describe('pianoDaysDone', () => {
  it('returns exactly the days with goalReachedAt set', () => {
    const section = piano({
      days: {
        '2026-09-05': { goalReachedAt: 100 },
        '2026-09-06': { parentStars: 2 },
        '2026-09-07': { goalReachedAt: 200 },
      },
    })
    expect(pianoDaysDone(section)).toEqual(new Set(['2026-09-05', '2026-09-07']))
  })
})

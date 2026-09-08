import { describe, expect, it } from 'vitest'
import { defaultDoc, type HoldProgress, type MissionProgress, type ProfileProgress } from '../progress'
import {
  estimateDaysToSummit,
  estimateMinutesRemaining,
  paceFactor,
  type HoldMissionsSpec,
} from '../planner'

function profileWith(holds: Record<string, HoldProgress>): ProfileProgress {
  const doc = defaultDoc()
  return { ...doc.profiles.kid, holds }
}

function mission(overrides: Partial<MissionProgress> = {}): MissionProgress {
  return { tries: 1, help: 'none', minutes: 0, ...overrides }
}

const HOLDS: HoldMissionsSpec[] = [
  {
    id: 'daisy',
    missions: [
      { id: 'D1', estimatedMinutes: 3 },
      { id: 'D2', estimatedMinutes: 4 },
    ],
  },
  {
    id: 'cross',
    missions: [
      { id: 'C1', estimatedMinutes: 5 },
      { id: 'C2', estimatedMinutes: 5 },
    ],
  },
]

describe('estimateMinutesRemaining (mission-based)', () => {
  it('sums the estimates of every not-yet-done mission across the given holds', () => {
    const profile = profileWith({})
    expect(estimateMinutesRemaining(profile, HOLDS)).toBe(3 + 4 + 5 + 5)
  })

  it('excludes missions that are already done', () => {
    const profile = profileWith({
      daisy: { stages: {}, missions: { D1: mission({ completedAt: 1 }) } },
    })
    expect(estimateMinutesRemaining(profile, HOLDS)).toBe(4 + 5 + 5)
  })

  it('a hold with masteredAt contributes 0, regardless of its individual mission records', () => {
    const profile = profileWith({
      daisy: { stages: {}, missions: {}, masteredAt: 999 },
    })
    expect(estimateMinutesRemaining(profile, HOLDS)).toBe(5 + 5)
  })

  it('is 0 once every hold is finished', () => {
    const profile = profileWith({
      daisy: { stages: {}, missions: {}, masteredAt: 1 },
      cross: { stages: {}, missions: {}, masteredAt: 2 },
    })
    expect(estimateMinutesRemaining(profile, HOLDS)).toBe(0)
  })
})

describe('paceFactor', () => {
  it('is neutral (1) with fewer than 3 completed-with-minutes samples', () => {
    const profile = profileWith({
      daisy: {
        stages: {},
        missions: {
          D1: mission({ completedAt: 1, minutes: 6 }), // 2x estimate
          D2: mission({ completedAt: 1, minutes: 8 }), // 2x estimate
        },
      },
    })
    expect(paceFactor(profile, HOLDS)).toBe(1)
  })

  it('averages actual/estimated once there are at least 3 samples', () => {
    const profile = profileWith({
      daisy: {
        stages: {},
        missions: {
          D1: mission({ completedAt: 1, minutes: 3 }), // 3/3 = 1
          D2: mission({ completedAt: 1, minutes: 4 }), // 4/4 = 1
        },
      },
      cross: {
        stages: {},
        missions: {
          C1: mission({ completedAt: 1, minutes: 10 }), // 10/5 = 2
        },
      },
    })
    // samples: 1, 1, 2 -> mean 4/3, within the 0.5-2 clamp
    expect(paceFactor(profile, HOLDS)).toBeCloseTo(4 / 3)
  })

  it('clamps an extreme average to the 0.5x-2x range', () => {
    const profile = profileWith({
      daisy: {
        stages: {},
        missions: {
          D1: mission({ completedAt: 1, minutes: 30 }), // 10x
          D2: mission({ completedAt: 1, minutes: 40 }), // 10x
        },
      },
      cross: {
        stages: {},
        missions: {
          C1: mission({ completedAt: 1, minutes: 50 }), // 10x
        },
      },
    })
    expect(paceFactor(profile, HOLDS)).toBe(2)
  })

  it('ignores missions that were never completed, or completed with 0 minutes', () => {
    const profile = profileWith({
      daisy: {
        stages: {},
        missions: {
          D1: mission({ minutes: 100 }), // no completedAt -> ignored
          D2: mission({ completedAt: 1, minutes: 0 }), // 0 minutes -> ignored
        },
      },
      cross: {
        stages: {},
        missions: {
          C1: mission({ completedAt: 1, minutes: 5 }), // 1 sample only
        },
      },
    })
    expect(paceFactor(profile, HOLDS)).toBe(1) // still under 3 real samples
  })

  it('feeds into estimateMinutesRemaining, scaling the raw total', () => {
    const profile = profileWith({
      daisy: {
        stages: {},
        missions: {
          D1: mission({ completedAt: 1, minutes: 6 }), // 2x
          D2: mission({ completedAt: 1, minutes: 8 }), // 2x
        },
      },
      cross: {
        stages: {},
        missions: {
          C1: mission({ completedAt: 1, minutes: 10 }), // 2x
        },
      },
    })
    // pace = 2 (3 samples all at 2x); remaining raw = C2's 5 minutes only
    // (D1, D2, C1 are all done); scaled = round(5 * 2) = 10
    expect(paceFactor(profile, HOLDS)).toBe(2)
    expect(estimateMinutesRemaining(profile, HOLDS)).toBe(10)
  })
})

describe('estimateDaysToSummit', () => {
  it('ceils minutes-remaining / sessionMinutes', () => {
    const profile = profileWith({})
    // 17 minutes remaining total, 10-minute sessions -> ceil(1.7) = 2
    expect(estimateDaysToSummit(profile, HOLDS, 10)).toBe(2)
  })

  it('is 0 days when nothing remains', () => {
    const profile = profileWith({
      daisy: { stages: {}, missions: {}, masteredAt: 1 },
      cross: { stages: {}, missions: {}, masteredAt: 1 },
    })
    expect(estimateDaysToSummit(profile, HOLDS, 10)).toBe(0)
  })

  it('is Infinity when sessionMinutes is 0 or negative', () => {
    const profile = profileWith({})
    expect(estimateDaysToSummit(profile, HOLDS, 0)).toBe(Infinity)
    expect(estimateDaysToSummit(profile, HOLDS, -5)).toBe(Infinity)
  })
})

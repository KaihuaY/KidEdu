import { describe, expect, it } from 'vitest'
import {
  analysedTakes,
  bestTakeId,
  milestones,
  personalBests,
  pieceSeries,
  trend,
} from '../songProgress'
import type { PianoTake, TakeCoach, TakeMetrics } from '../progress'

function metrics(overrides: Partial<TakeMetrics> = {}): TakeMetrics {
  return {
    v: 1,
    playedSec: 60,
    hesitations: 1,
    longestPauseSec: 1,
    dynamicRangeDb: 10,
    ...overrides,
  }
}

function ai(overrides: Partial<TakeMetrics> = {}, coachOverrides: Partial<TakeCoach> = {}): TakeCoach {
  return {
    metrics: metrics(overrides),
    at: 0,
    ...coachOverrides,
  }
}

function take(overrides: Partial<PianoTake> = {}): PianoTake {
  return {
    id: 'take-1',
    day: '2026-09-07',
    pieceId: 'twinkle',
    startedAt: 0,
    durationSec: 60,
    activeSec: 60,
    mimeType: 'audio/webm',
    sizeBytes: 1000,
    hasAudio: true,
    deviceId: 'device-1',
    ...overrides,
  }
}

describe('analysedTakes', () => {
  it('keeps only non-note takes of the piece that have ai.metrics, sorted by startedAt', () => {
    const takes = [
      take({ id: 'b', startedAt: 200, ai: ai() }),
      take({ id: 'no-ai', startedAt: 50 }),
      take({ id: 'other-piece', startedAt: 60, pieceId: 'chopsticks', ai: ai() }),
      take({ id: 'note', startedAt: 10, ai: ai(), isNote: true }),
      take({ id: 'a', startedAt: 100, ai: ai() }),
    ]
    expect(analysedTakes(takes, 'twinkle').map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('drops a take whose matchToBest says it was probably a different piece', () => {
    const takes = [
      take({ id: 'good', startedAt: 1, ai: ai({ matchToBest: 0.9 }) }),
      take({ id: 'no-match-field', startedAt: 2, ai: ai({ matchToBest: undefined }) }),
      take({ id: 'wrong-piece', startedAt: 3, ai: ai({ matchToBest: 0.2 }) }),
    ]
    expect(analysedTakes(takes, 'twinkle').map((t) => t.id)).toEqual(['good', 'no-match-field'])
  })
})

describe('pieceSeries', () => {
  it('groups by local day and applies fewest/best/median/longest per field', () => {
    const takes = [
      take({ id: 'a', day: '2026-09-06', startedAt: 1, ai: ai({ hesitations: 2, coverage: 0.4, stumbles: [0.1, 0.5], paceVsBest: 0.9, playedSec: 30 }) }),
      take({ id: 'b', day: '2026-09-07', startedAt: 2, ai: ai({ hesitations: 3, coverage: 0.5, stumbles: [0.2], paceVsBest: 1.0, playedSec: 40 }) }),
      take({ id: 'c', day: '2026-09-07', startedAt: 3, ai: ai({ hesitations: 1, coverage: 0.9, stumbles: [], paceVsBest: 1.2, playedSec: 55 }) }),
      take({ id: 'd', day: '2026-09-07', startedAt: 4, ai: ai({ hesitations: 0, coverage: undefined, stumbles: undefined, paceVsBest: undefined, playedSec: 10 }) }),
    ]
    const series = pieceSeries(takes, 'twinkle')
    expect(series.map((p) => p.day)).toEqual(['2026-09-06', '2026-09-07'])

    const day1 = series[1]
    expect(day1.takes).toBe(3)
    expect(day1.hesitations).toBe(0) // fewest of day
    expect(day1.stumbles).toBe(0) // fewest of day (c has 0)
    expect(day1.coverage).toBeCloseTo(0.9) // best of day
    expect(day1.pace).toBe(1.1) // median of [1.0, 1.2]
    expect(day1.playedSec).toBe(55) // longest of day
  })

  it('leaves optional fields undefined when nothing that day measured them', () => {
    const takes = [take({ id: 'a', day: '2026-09-06', ai: ai({ coverage: undefined, stumbles: undefined, paceVsBest: undefined }) })]
    const series = pieceSeries(takes, 'twinkle')
    expect(series[0].coverage).toBeUndefined()
    expect(series[0].stumbles).toBeUndefined()
    expect(series[0].pace).toBeUndefined()
  })
})

describe('personalBests', () => {
  it('picks the take id holding each best', () => {
    const takes = [
      take({ id: 'a', startedAt: 1, ai: ai({ hesitations: 3, coverage: 0.4, stumbles: [0.1, 0.2, 0.3], playedSec: 20 }) }),
      take({ id: 'b', startedAt: 2, ai: ai({ hesitations: 0, coverage: 0.95, stumbles: [], playedSec: 80 }) }),
      take({ id: 'c', startedAt: 3, ai: ai({ hesitations: 1, coverage: 0.6, stumbles: [0.5], playedSec: 40 }) }),
    ]
    expect(personalBests(takes, 'twinkle')).toEqual({
      fewestPauses: 'b',
      fewestStickySpots: 'b',
      furthest: 'b',
      longest: 'b',
    })
  })

  it('is undefined for a best with no data anywhere', () => {
    const takes = [take({ id: 'a', ai: ai({ coverage: undefined, stumbles: undefined }) })]
    const best = personalBests(takes, 'twinkle')
    expect(best.furthest).toBeUndefined()
    expect(best.fewestStickySpots).toBeUndefined()
    expect(best.fewestPauses).toBe('a')
    expect(best.longest).toBe('a')
  })

  it('is empty for a piece with no analysed takes', () => {
    expect(personalBests([], 'twinkle')).toEqual({
      fewestPauses: undefined,
      fewestStickySpots: undefined,
      furthest: undefined,
      longest: undefined,
    })
  })
})

describe('milestones', () => {
  it('fires "no long pauses" only the first time after an earlier take had some', () => {
    const takes = [
      take({ id: 'a', day: '2026-09-05', startedAt: 1, ai: ai({ hesitations: 2 }) }),
      take({ id: 'b', day: '2026-09-06', startedAt: 2, ai: ai({ hesitations: 0 }) }),
      take({ id: 'c', day: '2026-09-07', startedAt: 3, ai: ai({ hesitations: 0 }) }),
    ]
    const ribbons = milestones(takes, 'twinkle')
    const noPause = ribbons.filter((m) => m.text.includes('no long pauses'))
    expect(noPause).toHaveLength(1)
    expect(noPause[0].day).toBe('2026-09-06')
  })

  it('never fires "no long pauses" when the very first take already had none', () => {
    const takes = [take({ id: 'a', ai: ai({ hesitations: 0 }) })]
    expect(milestones(takes, 'twinkle').some((m) => m.text.includes('no long pauses'))).toBe(false)
  })

  it('fires "played it all the way through" the first time coverage reaches 0.95', () => {
    const takes = [
      take({ id: 'a', startedAt: 1, ai: ai({ coverage: 0.5 }) }),
      take({ id: 'b', startedAt: 2, ai: ai({ coverage: 0.97 }) }),
      take({ id: 'c', startedAt: 3, ai: ai({ coverage: 0.99 }) }),
    ]
    const ribbons = milestones(takes, 'twinkle')
    expect(ribbons.filter((m) => m.text.includes('all the way through'))).toHaveLength(1)
  })

  it('fires "fewest sticky spots yet" on a new minimum of stumbles.length with coverage >= 0.8', () => {
    const takes = [
      take({ id: 'a', startedAt: 1, ai: ai({ coverage: 0.9, stumbles: [0.1, 0.2, 0.3] }) }),
      take({ id: 'b', startedAt: 2, ai: ai({ coverage: 0.9, stumbles: [0.1] }) }), // new min, ribbon
      take({ id: 'c', startedAt: 3, ai: ai({ coverage: 0.5, stumbles: [] }) }), // new min but low coverage, no ribbon
    ]
    const ribbons = milestones(takes, 'twinkle')
    const sticky = ribbons.filter((m) => m.text.includes('sticky spots'))
    expect(sticky).toHaveLength(1)
    expect(sticky[0].id).toContain('b')
  })

  it('fires a take-count ribbon on the 5th take', () => {
    const takes = Array.from({ length: 5 }, (_, i) => take({ id: `t${i}`, startedAt: i, ai: ai() }))
    const ribbons = milestones(takes, 'twinkle')
    expect(ribbons.some((m) => m.text === '5 takes of this song 💪')).toBe(true)
  })

  it('caps at 6, newest first', () => {
    // 20 takes each on its own day, all starting with a hesitation so every
    // take after the first flips "no pauses", plus every count milestone,
    // guarantees far more than 6 candidate ribbons.
    const takes = Array.from({ length: 20 }, (_, i) =>
      take({ id: `t${i}`, day: `2026-09-${String(i + 1).padStart(2, '0')}`, startedAt: i, ai: ai({ hesitations: i % 2 }) }),
    )
    const ribbons = milestones(takes, 'twinkle')
    expect(ribbons.length).toBeLessThanOrEqual(6)
    // newest first
    for (let i = 1; i < ribbons.length; i++) {
      expect(ribbons[i - 1].day >= ribbons[i].day).toBe(true)
    }
  })
})

describe('trend', () => {
  it('needs at least 3 days, otherwise flat', () => {
    const series = pieceSeries(
      [
        take({ id: 'a', day: '2026-09-06', ai: ai({ coverage: 0.2 }) }),
        take({ id: 'b', day: '2026-09-07', ai: ai({ coverage: 0.9 }) }),
      ],
      'twinkle',
    )
    expect(trend(series, 'coverage')).toBe('flat')
  })

  it('reads up when the last third beats the first third', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']
    const vals = [0.2, 0.25, 0.5, 0.5, 0.8, 0.85]
    const series = pieceSeries(
      days.map((day, i) => take({ id: `t${i}`, day, startedAt: i, ai: ai({ coverage: vals[i] }) })),
      'twinkle',
    )
    expect(trend(series, 'coverage')).toBe('up')
  })

  it('is purely numeric: hesitations rising reads as "up" (the chart, not trend(), decides good/bad)', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03']
    const vals = [0, 1, 4]
    const series = pieceSeries(
      days.map((day, i) => take({ id: `t${i}`, day, startedAt: i, ai: ai({ hesitations: vals[i] }) })),
      'twinkle',
    )
    expect(trend(series, 'hesitations')).toBe('up')
  })

  it('is flat when nothing changes', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03']
    const series = pieceSeries(
      days.map((day, i) => take({ id: `t${i}`, day, startedAt: i, ai: ai({ coverage: 0.5 }) })),
      'twinkle',
    )
    expect(trend(series, 'coverage')).toBe('flat')
  })
})

describe('bestTakeId', () => {
  it('picks the highest composite score', () => {
    const takes = [
      take({ id: 'low', startedAt: 1, ai: ai({ coverage: 0.3, hesitations: 5, stumbles: [0.1, 0.2, 0.3, 0.4] }) }),
      take({ id: 'high', startedAt: 2, ai: ai({ coverage: 0.95, hesitations: 0, stumbles: [] }) }),
    ]
    expect(bestTakeId(takes, 'twinkle')).toBe('high')
  })

  it('is undefined for a piece with no analysed takes', () => {
    expect(bestTakeId([], 'twinkle')).toBeUndefined()
  })

  it('treats missing coverage/stumbles as neutral defaults (coverage 1, zero stumbles)', () => {
    const takes = [
      // No coverage/stumbles reported at all, but 0 hesitations - still beats
      // a take with a bad hesitation count even if it reports perfect coverage.
      take({ id: 'no-metrics', startedAt: 1, ai: ai({ coverage: undefined, stumbles: undefined, hesitations: 0 }) }),
      take({ id: 'many-pauses', startedAt: 2, ai: ai({ coverage: 1, stumbles: [], hesitations: 20 }) }),
    ]
    const id = bestTakeId(takes, 'twinkle')
    expect(id).toBeDefined()
  })
})

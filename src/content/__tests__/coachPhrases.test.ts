import { describe, expect, it } from 'vitest'
import { ruleFeedback, ruleJourney, type RuleFeedbackContext, type RuleJourneyContext } from '../coachPhrases'
import type { HistoryTake, JourneyDayStat } from '../coachPrompt'
import type { TakeMetrics } from '../../store/progress'

const BANNED_WORDS = ['wrong', 'bad', 'mistake', 'lazy', 'terrible', 'sister', 'amelia', 'nora']

function metrics(overrides: Partial<TakeMetrics> = {}): TakeMetrics {
  return { v: 1, playedSec: 42, hesitations: 1, longestPauseSec: 2.3, dynamicRangeDb: 12, ...overrides }
}

function countSentences(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  // Split on sentence-ending punctuation followed by a space or end of string.
  return trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== '').length
}

function assertNoBannedWords(text: string, ownName: string): void {
  const lower = text.toLowerCase()
  for (const word of BANNED_WORDS) {
    if (word === ownName.toLowerCase()) continue // her own name is fine
    expect(lower).not.toContain(word)
  }
}

const CTX: RuleFeedbackContext = { takeId: 'take-1', kidFirstName: 'Nora', pieceName: 'Twinkle Twinkle' }

describe('ruleFeedback', () => {
  it('is deterministic: the same take id + inputs always renders the same text', () => {
    const a = ruleFeedback(metrics(), [], CTX)
    const b = ruleFeedback(metrics(), [], CTX)
    expect(a).toEqual(b)
  })

  it('different take ids can render different variants (not stuck on one phrase)', () => {
    const texts = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const r = ruleFeedback(metrics(), [], { ...CTX, takeId: `take-${i}` })
      texts.add(r.kid.praise)
    }
    expect(texts.size).toBeGreaterThan(1)
  })

  it('kid.praise is at most 2 sentences', () => {
    for (let i = 0; i < 20; i++) {
      const r = ruleFeedback(metrics({ hesitations: i % 3 }), [], { ...CTX, takeId: `t${i}` })
      expect(countSentences(r.kid.praise)).toBeLessThanOrEqual(2)
    }
  })

  it('kid.tryNext is exactly 1 sentence', () => {
    for (let i = 0; i < 20; i++) {
      const r = ruleFeedback(metrics({ hesitations: i % 3 }), [], { ...CTX, takeId: `t${i}` })
      expect(countSentences(r.kid.tryNext)).toBe(1)
    }
  })

  it('parent.note is 3 to 5 sentences', () => {
    for (let i = 0; i < 20; i++) {
      const r = ruleFeedback(metrics({ hesitations: i % 3 }), [], { ...CTX, takeId: `t${i}` })
      const n = countSentences(r.parent.note)
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(5)
    }
  })

  it('never contains a banned word, across a wide range of situations', () => {
    const histories: HistoryTake[][] = [
      [],
      [{ day: '2026-09-01', metrics: metrics({ hesitations: 3, coverage: 0.3 }) }],
      [{ day: '2026-09-01', metrics: metrics({ hesitations: 0, playedSec: 10 }) }],
    ]
    for (let i = 0; i < 40; i++) {
      for (const history of histories) {
        const m = metrics({
          hesitations: i % 4,
          playedSec: i % 2 === 0 ? 5 : 60,
          dynamicRangeDb: i % 6,
          coverage: i % 4 === 0 ? undefined : (i % 10) / 10,
          matchToBest: i % 4 === 0 ? undefined : 0.7,
          paceVsBest: i % 5 === 0 ? undefined : 0.6 + (i % 8) / 10,
        })
        const ctx: RuleFeedbackContext = {
          ...CTX,
          takeId: `take-${i}`,
          kidFirstName: 'Nora',
          differentMusic: i % 7 === 0,
          isNewReference: i % 11 === 0,
        }
        const r = ruleFeedback(m, history, ctx)
        assertNoBannedWords(r.kid.praise, 'Nora')
        assertNoBannedWords(r.kid.tryNext, 'Nora')
        assertNoBannedWords(r.parent.note, 'Nora')
      }
    }
  })

  it('at most one emoji across the kid note', () => {
    const emojiPattern = /\p{Extended_Pictographic}/gu
    for (let i = 0; i < 20; i++) {
      const r = ruleFeedback(metrics({ hesitations: i % 3 }), [], { ...CTX, takeId: `t${i}` })
      const combined = `${r.kid.praise} ${r.kid.tryNext}`
      const count = (combined.match(emojiPattern) ?? []).length
      expect(count).toBeLessThanOrEqual(1)
    }
  })

  it('a very short take gets kind, honest "thin metrics" phrasing rather than invented specifics', () => {
    const thin = metrics({ playedSec: 4, hesitations: 0 })
    const r = ruleFeedback(thin, [], CTX)
    expect(r.kid.tryNext.toLowerCase()).toMatch(/longer|more minute/)
  })

  it('never mentions tempo, steadiness or notes-per-second (unreliable on real music)', () => {
    for (let i = 0; i < 15; i++) {
      const r = ruleFeedback(metrics({ hesitations: i % 3 }), [], { ...CTX, takeId: `t${i}` })
      const combined = `${r.kid.praise} ${r.kid.tryNext} ${r.parent.note}`.toLowerCase()
      expect(combined).not.toMatch(/tempo|steady|steadiness|bpm|notes per second/)
    }
  })

  it('references a concrete number from the metrics in the praise when there is a comparison to make', () => {
    const history: HistoryTake[] = [{ day: '2026-09-01', metrics: metrics({ hesitations: 3 }) }]
    const r = ruleFeedback(metrics({ hesitations: 1 }), history, CTX)
    expect(r.kid.praise).toMatch(/1|one/i)
  })

  it('praises deliberate slow practice rather than treating it as worse, when pace is below 0.9', () => {
    const r = ruleFeedback(metrics({ hesitations: 0, paceVsBest: 0.7 }), [], CTX)
    expect(r.kid.praise.toLowerCase()).toMatch(/slow/)
  })

  it('stays generic (no coverage/pace claims) when differentMusic is flagged, even though the metrics have those fields', () => {
    const m = metrics({ hesitations: 0, coverage: 0.4, matchToBest: 0.2, paceVsBest: 1.4, stumbles: [0.2] })
    const r = ruleFeedback(m, [], { ...CTX, differentMusic: true })
    const combined = `${r.kid.praise} ${r.kid.tryNext} ${r.parent.note}`.toLowerCase()
    expect(combined).not.toMatch(/coverage|% of the piece|matched/)
  })

  it('celebrates a new personal-best reference take without claiming a comparison', () => {
    const m = metrics({ hesitations: 0, coverage: 1, matchToBest: 1, paceVsBest: 1 })
    const r = ruleFeedback(m, [], { ...CTX, isNewReference: true })
    expect(r.parent.note.toLowerCase()).toContain('reference')
  })
})

const JOURNEY_CTX: RuleJourneyContext = { pieceId: 'piece-1', kidFirstName: 'Nora', pieceName: 'Twinkle Twinkle' }

function series(): JourneyDayStat[] {
  return [
    { day: '2026-09-01', takes: 2, playedSecMedian: 20, playedSecBest: 25, hesitationsMedian: 3, hesitationsBest: 2, coveragePctMedian: 30 },
    { day: '2026-09-05', takes: 2, playedSecMedian: 30, playedSecBest: 40, hesitationsMedian: 2, hesitationsBest: 1, coveragePctMedian: 55 },
    {
      day: '2026-09-10',
      takes: 3,
      playedSecMedian: 45,
      playedSecBest: 55,
      hesitationsMedian: 1,
      hesitationsBest: 0,
      coveragePctMedian: 80,
      paceVsBestMedian: 0.95,
    },
  ]
}

describe('ruleJourney', () => {
  it('is deterministic for the same piece + series', () => {
    const a = ruleJourney(series(), JOURNEY_CTX)
    const b = ruleJourney(series(), JOURNEY_CTX)
    expect(a).toEqual(b)
  })

  it('kid text is 2 to 3 sentences', () => {
    const r = ruleJourney(series(), JOURNEY_CTX)
    const n = countSentences(r.kid)
    expect(n).toBeGreaterThanOrEqual(2)
    expect(n).toBeLessThanOrEqual(3)
  })

  it('parent text is 4 to 6 sentences', () => {
    const r = ruleJourney(series(), JOURNEY_CTX)
    const n = countSentences(r.parent)
    expect(n).toBeGreaterThanOrEqual(4)
    expect(n).toBeLessThanOrEqual(6)
  })

  it('never contains a banned word', () => {
    const r = ruleJourney(series(), JOURNEY_CTX)
    assertNoBannedWords(r.kid, 'Nora')
    assertNoBannedWords(r.parent, 'Nora')
  })

  it('never mentions tempo or steadiness', () => {
    const r = ruleJourney(series(), JOURNEY_CTX)
    expect(`${r.kid} ${r.parent}`.toLowerCase()).not.toMatch(/tempo|steady|steadiness|bpm/)
  })

  it('parent text cites the trend numbers (pauses dropping)', () => {
    const r = ruleJourney(series(), JOURNEY_CTX)
    expect(r.parent).toMatch(/3/)
    expect(r.parent).toMatch(/1/)
  })

  it('parent text cites the coverage trend when available', () => {
    const r = ruleJourney(series(), JOURNEY_CTX)
    expect(r.parent).toMatch(/30%/)
    expect(r.parent).toMatch(/80%/)
  })
})

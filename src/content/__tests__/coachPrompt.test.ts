import { describe, expect, it } from 'vitest'
import {
  buildFeedbackUser,
  buildJourneyUser,
  COACH_SYSTEM,
  FEEDBACK_SCHEMA,
  JOURNEY_SCHEMA,
  type FeedbackInput,
  type JourneyInput,
} from '../coachPrompt'
import type { TakeMetrics } from '../../store/progress'

function metrics(overrides: Partial<TakeMetrics> = {}): TakeMetrics {
  return { v: 1, playedSec: 42, hesitations: 1, longestPauseSec: 2.3, dynamicRangeDb: 12, ...overrides }
}

/** Recursively checks every `type: 'object'` node in a JSON schema carries additionalProperties:false and required. */
function assertStrictObjects(schema: unknown): void {
  if (!schema || typeof schema !== 'object') return
  const node = schema as Record<string, unknown>
  if (node.type === 'object') {
    expect(node.additionalProperties).toBe(false)
    expect(Array.isArray(node.required)).toBe(true)
    const props = node.properties as Record<string, unknown> | undefined
    expect(props).toBeDefined()
    expect((node.required as string[]).sort()).toEqual(Object.keys(props!).sort())
  }
  const props = node.properties as Record<string, unknown> | undefined
  if (props) for (const v of Object.values(props)) assertStrictObjects(v)
}

/** No numeric/length constraints anywhere - Anthropic's structured output doesn't support them. */
function assertNoLengthConstraints(schema: unknown): void {
  const json = JSON.stringify(schema)
  for (const forbidden of ['minLength', 'maxLength', 'minimum', 'maximum']) {
    expect(json).not.toContain(forbidden)
  }
}

describe('COACH_SYSTEM', () => {
  it('is a non-empty string that sets up the tablet-mic limitation and forbids claiming to have heard the music', () => {
    expect(typeof COACH_SYSTEM).toBe('string')
    expect(COACH_SYSTEM.length).toBeGreaterThan(200)
    expect(COACH_SYSTEM.toLowerCase()).toContain('microphone')
    // The prompt explicitly bans the phrase (it must mention it to forbid it) - check the ban is there, phrased as a prohibition.
    expect(COACH_SYSTEM).toMatch(/never (say|write).{0,40}"I heard"/i)
  })

  it('explains how to read the pace comparison and never calls faster better by itself', () => {
    expect(COACH_SYSTEM.toLowerCase()).toContain('slower than her best take')
    expect(COACH_SYSTEM.toLowerCase()).toMatch(/faster.*(better|improvement)/s)
  })

  it('explains differentMusic and the new-reference-take case', () => {
    expect(COACH_SYSTEM).toContain('differentMusic')
    expect(COACH_SYSTEM.toLowerCase()).toContain('reference take')
  })

  it('explains theme (angle, only when the numbers support it) and voice (flavour, never overrides truth rules)', () => {
    const lower = COACH_SYSTEM.toLowerCase()
    expect(lower).toContain('"theme"')
    expect(lower).toContain('"voice"')
    expect(lower).toMatch(/voice.{0,80}(flavour|flavor)/s)
    expect(lower).toMatch(/never (loosens|override|bend)/s)
  })

  it('tells the model not to reuse the phrasing/opener/try-next idea of recent notes, and to vary sentence openers', () => {
    const lower = COACH_SYSTEM.toLowerCase()
    expect(lower).toMatch(/do not reuse the same phrasing/)
    expect(lower).toMatch(/vary how your sentences start/)
    expect(lower).toContain('one exclamation mark per sentence')
  })

  it('explains plays/time are only mentioned when round or new, and journal acknowledgement', () => {
    const lower = COACH_SYSTEM.toLowerCase()
    expect(lower).toMatch(/round or newly-crossed number/)
    expect(lower).toMatch(/practice journal today/)
  })

  it('requires the journey to add something the previous journey did not already say', () => {
    expect(COACH_SYSTEM.toLowerCase()).toMatch(/previous journey.{0,120}must add something/s)
  })
})

describe('FEEDBACK_SCHEMA / JOURNEY_SCHEMA', () => {
  it('every object node has additionalProperties:false and required matching its properties', () => {
    assertStrictObjects(FEEDBACK_SCHEMA)
    assertStrictObjects(JOURNEY_SCHEMA)
  })

  it('never uses minLength/maxLength/minimum/maximum', () => {
    assertNoLengthConstraints(FEEDBACK_SCHEMA)
    assertNoLengthConstraints(JOURNEY_SCHEMA)
  })

  it('FEEDBACK_SCHEMA shape matches { kid: { praise, tryNext }, parent: { note } }', () => {
    expect(FEEDBACK_SCHEMA.required).toEqual(['kid', 'parent'])
    expect(FEEDBACK_SCHEMA.properties.kid.required).toEqual(['praise', 'tryNext'])
    expect(FEEDBACK_SCHEMA.properties.parent.required).toEqual(['note'])
  })

  it('JOURNEY_SCHEMA shape matches { kid: string, parent: string }', () => {
    expect(JOURNEY_SCHEMA.required).toEqual(['kid', 'parent'])
    expect(JOURNEY_SCHEMA.properties.kid.type).toBe('string')
    expect(JOURNEY_SCHEMA.properties.parent.type).toBe('string')
  })
})

describe('buildFeedbackUser', () => {
  const base: FeedbackInput = {
    kidFirstName: 'Nora',
    age: 7,
    pieceName: 'Twinkle Twinkle',
    metrics: metrics(),
    history: [],
    takeNumber: 1,
    recentNotes: [],
    theme: 'rhythm & flow - notice how evenly the playing moved.',
    voice: 'playful coach - warm and upbeat.',
  }

  it('produces valid JSON carrying the kid name, age, piece and this take\'s metrics', () => {
    const text = buildFeedbackUser(base)
    const parsed = JSON.parse(text) as Record<string, unknown>
    expect(parsed.kidFirstName).toBe('Nora')
    expect(parsed.age).toBe(7)
    expect(parsed.piece).toBe('Twinkle Twinkle')
    expect(parsed.takeNumberForThisPiece).toBe(1)
    expect((parsed.thisTake as Record<string, unknown>).secondsPlayed).toBe(42)
  })

  it('falls back to "free play" when there is no piece', () => {
    const parsed = JSON.parse(buildFeedbackUser({ ...base, pieceName: null })) as Record<string, unknown>
    expect(parsed.piece).toBe('free play')
  })

  it('includes at most the 5 most recent history entries', () => {
    const history = Array.from({ length: 8 }, (_, i) => ({ day: `2026-09-0${i + 1}`, metrics: metrics({ hesitations: i }) }))
    const parsed = JSON.parse(buildFeedbackUser({ ...base, history })) as { previousTakesOfThisPiece: { day: string }[] }
    expect(parsed.previousTakesOfThisPiece).toHaveLength(5)
    expect(parsed.previousTakesOfThisPiece[4].day).toBe('2026-09-08')
  })

  it('omits optional fields (goal, self rating, repetitions, personal bests) when absent', () => {
    const parsed = JSON.parse(buildFeedbackUser(base)) as Record<string, unknown>
    expect(parsed.parentGoalForThisPiece).toBeUndefined()
    expect(parsed.kidSelfRating).toBeUndefined()
    expect(parsed.playedItTapsThisTake).toBeUndefined()
    expect(parsed.personalBestsForThisPiece).toBeUndefined()
  })

  it('includes them when present', () => {
    const parsed = JSON.parse(
      buildFeedbackUser({
        ...base,
        goalText: 'Bars 1-8 three times',
        selfRating: 'great',
        repetitions: 3,
        personalBests: { longestPlayedSec: 90, fewestHesitations: 0 },
      }),
    ) as Record<string, unknown>
    expect(parsed.parentGoalForThisPiece).toBe('Bars 1-8 three times')
    expect(parsed.kidSelfRating).toBe('great')
    expect(parsed.playedItTapsThisTake).toBe(3)
    expect(parsed.personalBestsForThisPiece).toEqual({ longestPlayedSec: 90, fewestHesitations: 0 })
  })

  it('never sends tempoBpm, tempoDrift, steadiness, or noteRate, even when present on the metrics', () => {
    const withUnreliable = metrics({ tempoBpm: 96, tempoDrift: 0.1, steadiness: 0.4, noteRate: 2.1 })
    const parsed = JSON.parse(buildFeedbackUser({ ...base, metrics: withUnreliable })) as { thisTake: Record<string, unknown> }
    const keys = Object.keys(parsed.thisTake).join(' ').toLowerCase()
    expect(keys).not.toMatch(/tempo|steadiness|noterate|notespersecond/)
  })

  it('sends coverage/matchToBest/pace/stumbles as plain labelled numbers when a reference comparison ran', () => {
    const withReference = metrics({ coverage: 0.62, matchToBest: 0.81, paceVsBest: 0.85, stumbles: [0.1, 0.5, 0.9] })
    const parsed = JSON.parse(buildFeedbackUser({ ...base, metrics: withReference })) as { thisTake: Record<string, unknown> }
    expect(parsed.thisTake.pieceCoveragePercent).toBe(62)
    expect(parsed.thisTake.matchToReference0to1).toBe(0.81)
    expect(parsed.thisTake.paceVsBestRatio).toBe(0.85)
    expect(parsed.thisTake.paceCompared).toBe('slower than her best take')
    expect(parsed.thisTake.stumbleCount).toBe(3)
    expect(parsed.thisTake.stumbleRoughPositions).toEqual(['start', 'middle', 'end'])
  })

  it('labels pace as "about the same" between 0.9 and 1.1, and "faster" above 1.1', () => {
    const same = JSON.parse(buildFeedbackUser({ ...base, metrics: metrics({ paceVsBest: 1.0 }) })) as { thisTake: Record<string, unknown> }
    expect(same.thisTake.paceCompared).toBe('about the same speed as her best take')
    const faster = JSON.parse(buildFeedbackUser({ ...base, metrics: metrics({ paceVsBest: 1.3 }) })) as { thisTake: Record<string, unknown> }
    expect(faster.thisTake.paceCompared).toBe('faster than her best take')
  })

  it('omits coverage/matchToBest/pace/stumbles and sets differentMusic:true when flagged, even though the numbers were computed', () => {
    const withReference = metrics({ coverage: 0.62, matchToBest: 0.3, paceVsBest: 0.85, stumbles: [0.1] })
    const parsed = JSON.parse(buildFeedbackUser({ ...base, metrics: withReference, differentMusic: true })) as {
      thisTake: Record<string, unknown>
      differentMusic: boolean
    }
    expect(parsed.differentMusic).toBe(true)
    expect(Object.keys(parsed.thisTake)).toEqual(['secondsPlayed', 'pauseCount', 'longestPauseSeconds', 'loudToSoftRangeDb'])
  })

  it('omits coverage/matchToBest/pace/stumbles and sets referenceStatus when this take is the new reference', () => {
    const selfReference = metrics({ coverage: 1, matchToBest: 1, paceVsBest: 1 })
    const parsed = JSON.parse(buildFeedbackUser({ ...base, metrics: selfReference, isNewReference: true })) as {
      thisTake: Record<string, unknown>
      referenceStatus: string
    }
    expect(parsed.referenceStatus).toBe('this take is now her reference take')
    expect(Object.keys(parsed.thisTake)).toEqual(['secondsPlayed', 'pauseCount', 'longestPauseSeconds', 'loudToSoftRangeDb'])
  })

  it('always includes theme and voice', () => {
    const parsed = JSON.parse(buildFeedbackUser(base)) as Record<string, unknown>
    expect(parsed.theme).toBe(base.theme)
    expect(parsed.voice).toBe(base.voice)
  })

  it('omits recentKidNotes when there are none, includes them (praise + tryNext) when there are', () => {
    const empty = JSON.parse(buildFeedbackUser(base)) as Record<string, unknown>
    expect(empty.recentKidNotes).toBeUndefined()

    const withRecent = JSON.parse(
      buildFeedbackUser({ ...base, recentNotes: [{ praise: 'You played so steadily!', tryNext: 'Try counting out loud.' }] }),
    ) as { recentKidNotes: { praise: string; tryNext: string }[] }
    expect(withRecent.recentKidNotes).toEqual([{ praise: 'You played so steadily!', tryNext: 'Try counting out loud.' }])
  })

  it('includes songSoFar only when song is given', () => {
    const noSong = JSON.parse(buildFeedbackUser(base)) as Record<string, unknown>
    expect(noSong.songSoFar).toBeUndefined()

    const withSong = JSON.parse(buildFeedbackUser({ ...base, song: { plays: 10, totalMin: 62.5, days: 6 } })) as {
      songSoFar: { totalPlays: number; totalMinutes: number; daysPracticed: number }
    }
    expect(withSong.songSoFar).toEqual({ totalPlays: 10, totalMinutes: 62.5, daysPracticed: 6 })
  })

  it('includes journalToday only when given', () => {
    const noJournal = JSON.parse(buildFeedbackUser(base)) as Record<string, unknown>
    expect(noJournal.journalToday).toBeUndefined()

    const withJournal = JSON.parse(buildFeedbackUser({ ...base, journalToday: 'Piano was fun today!' })) as Record<string, unknown>
    expect(withJournal.journalToday).toBe('Piano was fun today!')
  })
})

describe('buildJourneyUser', () => {
  const base: JourneyInput = {
    kidFirstName: 'Nora',
    age: 7,
    pieceName: 'Twinkle Twinkle',
    takeCount: 6,
    series: [
      { day: '2026-09-01', takes: 2, playedSecMedian: 20, playedSecBest: 25, hesitationsMedian: 3, hesitationsBest: 2 },
      { day: '2026-09-05', takes: 3, playedSecMedian: 40, playedSecBest: 50, hesitationsMedian: 1, hesitationsBest: 0 },
    ],
  }

  it('produces valid JSON carrying the day-by-day series', () => {
    const parsed = JSON.parse(buildJourneyUser(base)) as { days: unknown[]; totalAnalysedTakes: number; piece: string }
    expect(parsed.piece).toBe('Twinkle Twinkle')
    expect(parsed.totalAnalysedTakes).toBe(6)
    expect(parsed.days).toHaveLength(2)
  })

  it('includes the parent goal when present', () => {
    const parsed = JSON.parse(buildJourneyUser({ ...base, goalText: 'Play it smoothly' })) as Record<string, unknown>
    expect(parsed.parentGoalForThisPiece).toBe('Play it smoothly')
  })

  it('omits previousJourneySummary when absent, includes it when given', () => {
    const noPrevious = JSON.parse(buildJourneyUser(base)) as Record<string, unknown>
    expect(noPrevious.previousJourneySummary).toBeUndefined()

    const withPrevious = JSON.parse(buildJourneyUser({ ...base, previousJourney: 'Last time: pauses dropped from 3 to 1.' })) as Record<string, unknown>
    expect(withPrevious.previousJourneySummary).toBe('Last time: pauses dropped from 3 to 1.')
  })
})

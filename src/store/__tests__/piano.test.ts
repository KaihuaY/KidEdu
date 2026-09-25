import { beforeEach, describe, expect, it } from 'vitest'
import {
  allSongTargetsMet,
  awardMarksIfReached,
  awardSongTargetBeadsIfReached,
  bumpRepetition,
  markAudioPruned,
  repetitionsForPiece,
  saveTake,
  setJourney,
  setParentStars,
  setSelfRating,
  setTakeAi,
  setTakeGoalHit,
  slimOldTakes,
  songTargetsForDay,
} from '../piano'
import { getDoc, resetAll, update, type PianoPiece, type PianoTake, type TakeCoach } from '../progress'
import { dayOffset } from '../sessions'

// Same in-memory localStorage mock as progress.test.ts / sessions.test.ts -
// piano.ts writes through progress.ts's `update`, which persists there.
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
  resetAll()
})

function makeTake(overrides: Partial<PianoTake> = {}): PianoTake {
  return {
    id: 'take-1',
    day: '2026-09-07',
    pieceId: null,
    startedAt: Date.now(),
    durationSec: 120,
    activeSec: 60,
    mimeType: 'audio/webm',
    sizeBytes: 5000,
    hasAudio: true,
    deviceId: 'device-1',
    ...overrides,
  }
}

describe('saveTake', () => {
  it('appends the take and bumps piano.updatedAt', () => {
    const before = getDoc().piano.updatedAt
    saveTake(makeTake({ id: 'a' }))
    const doc = getDoc()
    expect(doc.piano.takes.map((t) => t.id)).toEqual(['a'])
    expect(doc.piano.updatedAt).toBeGreaterThanOrEqual(before)
  })
})

describe('saveTake retention cap', () => {
  it('drops take metadata older than 180 days but keeps the take being saved', () => {
    const recentDay = '2026-09-07'
    const oldDay = dayOffset(recentDay, -200)
    saveTake(makeTake({ id: 'old', day: oldDay }))
    saveTake(makeTake({ id: 'new', day: recentDay }))

    expect(getDoc().piano.takes.map((t) => t.id)).toEqual(['new'])
  })

  it('keeps takes within the 180-day window', () => {
    const recentDay = '2026-09-07'
    const withinWindowDay = dayOffset(recentDay, -100)
    saveTake(makeTake({ id: 'within', day: withinWindowDay }))
    saveTake(makeTake({ id: 'new', day: recentDay }))

    expect(getDoc().piano.takes.map((t) => t.id).sort()).toEqual(['new', 'within'])
  })
})

describe('setSelfRating', () => {
  it('sets the rating on the matching take only', () => {
    saveTake(makeTake({ id: 'a' }))
    saveTake(makeTake({ id: 'b' }))
    setSelfRating('a', 3)
    const doc = getDoc()
    expect(doc.piano.takes.find((t) => t.id === 'a')?.selfRating).toBe(3)
    expect(doc.piano.takes.find((t) => t.id === 'b')?.selfRating).toBeUndefined()
  })
})

describe('setTakeGoalHit', () => {
  it('sets goalHit on the matching take only', () => {
    saveTake(makeTake({ id: 'a' }))
    saveTake(makeTake({ id: 'b' }))
    setTakeGoalHit('a', true)
    const doc = getDoc()
    expect(doc.piano.takes.find((t) => t.id === 'a')?.goalHit).toBe(true)
    expect(doc.piano.takes.find((t) => t.id === 'b')?.goalHit).toBeUndefined()
  })

  it('can be set to false (kid said "Not yet")', () => {
    saveTake(makeTake({ id: 'a' }))
    setTakeGoalHit('a', false)
    expect(getDoc().piano.takes.find((t) => t.id === 'a')?.goalHit).toBe(false)
  })

  it('can be flipped back and forth', () => {
    saveTake(makeTake({ id: 'a' }))
    setTakeGoalHit('a', true)
    setTakeGoalHit('a', false)
    expect(getDoc().piano.takes.find((t) => t.id === 'a')?.goalHit).toBe(false)
  })
})

describe('awardMarksIfReached (mark 1 = the ring goal)', () => {
  it('defaults to "recording" mode: awards from wall time (durationSec), not activeSec', () => {
    const day = '2026-09-07'
    // Plenty of wall time, but well under the goal on activeSec alone -
    // proves this is summing durationSec, not activeSec.
    saveTake(makeTake({ id: 'a', day, durationSec: 900, activeSec: 100 }))

    expect(awardMarksIfReached(day).some((m) => m.index === 0)).toBe(true)

    let doc = getDoc()
    expect(doc.piano.days[day]?.goalReachedAt).toBeTruthy()
    expect(doc.piano.streak.current).toBe(1)
    expect(doc.profiles.kid.tokens.gold).toBe(1) // mark 1 gives a gold token by default (round 9)
    expect(doc.profiles.kid.xp).toBe(30)

    // Second call the same day: no-op, no double award.
    expect(awardMarksIfReached(day).some((m) => m.index === 0)).toBe(false)

    doc = getDoc()
    expect(doc.profiles.kid.tokens.gold).toBe(1) // mark 1 gives a gold token by default (round 9)
    expect(doc.profiles.kid.xp).toBe(30)
  })

  it('does not award before the goal is reached', () => {
    saveTake(makeTake({ id: 'a', day: '2026-09-07', durationSec: 100, activeSec: 100 }))
    expect(awardMarksIfReached('2026-09-07').some((m) => m.index === 0)).toBe(false)
    expect(getDoc().piano.days['2026-09-07']).toBeUndefined()
    expect(getDoc().profiles.kid.tokens.gold).toBe(0)
  })

  it('"heard" mode awards from activeSec instead, once the setting is switched', () => {
    update('settings', (s) => ({ ...s, pianoCountMode: 'heard' }))
    const day = '2026-09-07'
    // Plenty of wall time, but the goal is only reached on activeSec.
    saveTake(makeTake({ id: 'a', day, durationSec: 100, activeSec: 900 }))

    expect(awardMarksIfReached(day).some((m) => m.index === 0)).toBe(true)
    expect(getDoc().piano.days[day]?.goalReachedAt).toBeTruthy()
  })
})

describe('setParentStars', () => {
  it('1 star stores the rating but awards no token', () => {
    const tier = setParentStars('2026-09-07', 1)
    expect(tier).toBeNull()
    const doc = getDoc()
    expect(doc.piano.days['2026-09-07']?.parentStars).toBe(1)
    expect(doc.profiles.kid.tokens.gold).toBe(0)
    expect(doc.profiles.kid.tokens.silver).toBe(0)
  })

  it('2 stars awards silver', () => {
    expect(setParentStars('2026-09-07', 2)).toBe('silver')
    expect(getDoc().profiles.kid.tokens.silver).toBe(1)
  })

  it('3 stars awards gold', () => {
    expect(setParentStars('2026-09-07', 3)).toBe('gold')
    expect(getDoc().profiles.kid.tokens.gold).toBe(1)
  })

  it('only allows one rating per day - a second call the same day changes nothing', () => {
    setParentStars('2026-09-07', 2)
    const before = getDoc()

    const second = setParentStars('2026-09-07', 3)

    expect(second).toBeNull()
    const after = getDoc()
    expect(after.piano.days['2026-09-07']?.parentStars).toBe(2)
    expect(after.profiles.kid.tokens.gold).toBe(0)
    expect(after.profiles.kid.tokens.silver).toBe(1)
    expect(after.piano).toEqual(before.piano)
    expect(after.profiles).toEqual(before.profiles)
  })
})

function makePiece(overrides: Partial<PianoPiece> = {}): PianoPiece {
  return { id: 'piece-1', name: 'Twinkle', emoji: '⭐', ...overrides }
}

function setPieces(pieces: PianoPiece[]): void {
  update('settings', (s) => ({ ...s, pianoPieces: pieces }))
}

describe('bumpRepetition', () => {
  it('increments a saved take from undefined and returns the new count', () => {
    saveTake(makeTake({ id: 'a' }))
    expect(bumpRepetition('a')).toBe(1)
    expect(getDoc().piano.takes.find((t) => t.id === 'a')?.repetitions).toBe(1)
  })

  it('keeps incrementing on repeated calls', () => {
    saveTake(makeTake({ id: 'a' }))
    bumpRepetition('a')
    bumpRepetition('a')
    expect(bumpRepetition('a')).toBe(3)
  })

  it('only touches the matching take', () => {
    saveTake(makeTake({ id: 'a' }))
    saveTake(makeTake({ id: 'b' }))
    bumpRepetition('a')
    expect(getDoc().piano.takes.find((t) => t.id === 'b')?.repetitions).toBeUndefined()
  })
})

describe('repetitionsForPiece', () => {
  const day = '2026-09-07'

  it('sums repetitions across non-note takes of the piece on that day', () => {
    const takes: PianoTake[] = [
      makeTake({ id: 'a', day, pieceId: 'piece-1', repetitions: 2 }),
      makeTake({ id: 'b', day, pieceId: 'piece-1', repetitions: 1 }),
    ]
    expect(repetitionsForPiece(takes, 'piece-1', day)).toBe(3)
  })

  it('excludes other pieces, other days, notes, and takes with no repetitions', () => {
    const takes: PianoTake[] = [
      makeTake({ id: 'a', day, pieceId: 'piece-1', repetitions: 2 }),
      makeTake({ id: 'b', day, pieceId: 'piece-2', repetitions: 5 }),
      makeTake({ id: 'c', day: dayOffset(day, -1), pieceId: 'piece-1', repetitions: 5 }),
      makeTake({ id: 'd', day, pieceId: 'piece-1', isNote: true, repetitions: 5 }),
      makeTake({ id: 'e', day, pieceId: 'piece-1' }),
    ]
    expect(repetitionsForPiece(takes, 'piece-1', day)).toBe(2)
  })

  it('is 0 for a piece with no matching takes', () => {
    expect(repetitionsForPiece([], 'piece-1', day)).toBe(0)
  })
})

describe('songTargetsForDay', () => {
  const day = '2026-09-07'

  it('only includes pieces with a timesPerDay of at least 1', () => {
    const pieces = [makePiece({ id: 'a', timesPerDay: 3 }), makePiece({ id: 'b', timesPerDay: 0 }), makePiece({ id: 'c' })]
    const result = songTargetsForDay(pieces, [], day)
    expect(result.map((r) => r.piece.id)).toEqual(['a'])
    expect(result[0]).toEqual({ piece: pieces[0], done: 0, target: 3 })
  })

  it('reports done from that day\'s repetitions', () => {
    const pieces = [makePiece({ id: 'a', timesPerDay: 3 })]
    const takes = [makeTake({ id: 't', day, pieceId: 'a', repetitions: 2 })]
    expect(songTargetsForDay(pieces, takes, day)).toEqual([{ piece: pieces[0], done: 2, target: 3 }])
  })

  it('is empty when no piece has a target', () => {
    expect(songTargetsForDay([makePiece({ timesPerDay: 0 })], [], day)).toEqual([])
  })
})

describe('allSongTargetsMet', () => {
  const day = '2026-09-07'

  it('is false when there are no targets at all', () => {
    expect(allSongTargetsMet([makePiece({ timesPerDay: 0 })], [], day)).toBe(false)
  })

  it('is false when one target piece is short', () => {
    const pieces = [makePiece({ id: 'a', timesPerDay: 2 }), makePiece({ id: 'b', timesPerDay: 1 })]
    const takes = [
      makeTake({ id: 't1', day, pieceId: 'a', repetitions: 2 }),
      makeTake({ id: 't2', day, pieceId: 'b', repetitions: 0 }),
    ]
    expect(allSongTargetsMet(pieces, takes, day)).toBe(false)
  })

  it('is true once every target piece has met or passed its target', () => {
    const pieces = [makePiece({ id: 'a', timesPerDay: 2 }), makePiece({ id: 'b', timesPerDay: 1 })]
    const takes = [
      makeTake({ id: 't1', day, pieceId: 'a', repetitions: 3 }),
      makeTake({ id: 't2', day, pieceId: 'b', repetitions: 1 }),
    ]
    expect(allSongTargetsMet(pieces, takes, day)).toBe(true)
  })
})

describe('awardSongTargetBeadsIfReached', () => {
  const day = '2026-09-07'

  it('returns null and writes nothing when the piece has no target', () => {
    setPieces([makePiece({ id: 'piece-1' })])
    saveTake(makeTake({ id: 'a', day, pieceId: 'piece-1', repetitions: 5 }))
    const before = getDoc()
    expect(awardSongTargetBeadsIfReached('piece-1', day)).toBeNull()
    expect(getDoc().piano).toEqual(before.piano)
    expect(getDoc().collection).toEqual(before.collection)
  })

  it('returns null and writes nothing when the target is not yet met', () => {
    setPieces([makePiece({ id: 'piece-1', timesPerDay: 3 })])
    saveTake(makeTake({ id: 'a', day, pieceId: 'piece-1', repetitions: 2 }))
    const before = getDoc()
    expect(awardSongTargetBeadsIfReached('piece-1', day)).toBeNull()
    expect(getDoc().piano).toEqual(before.piano)
    expect(getDoc().collection.beads).toEqual(before.collection.beads)
  })

  it('awards 2 beads and stamps the day once the target is met', () => {
    setPieces([makePiece({ id: 'piece-1', timesPerDay: 3 })])
    saveTake(makeTake({ id: 'a', day, pieceId: 'piece-1', repetitions: 3 }))

    const beadIds = awardSongTargetBeadsIfReached('piece-1', day)

    expect(beadIds).not.toBeNull()
    expect(beadIds).toHaveLength(2)
    expect(getDoc().piano.days[day]?.songBeadsAwarded).toEqual(['piece-1'])
    const totalBeads = Object.values(getDoc().collection.beads).reduce((a, b) => a + b, 0)
    expect(totalBeads).toBe(2)
  })

  it('only awards once per piece per day - a second call is a no-op', () => {
    setPieces([makePiece({ id: 'piece-1', timesPerDay: 3 })])
    saveTake(makeTake({ id: 'a', day, pieceId: 'piece-1', repetitions: 3 }))
    awardSongTargetBeadsIfReached('piece-1', day)

    const before = getDoc()
    expect(awardSongTargetBeadsIfReached('piece-1', day)).toBeNull()
    expect(getDoc().piano).toEqual(before.piano)
    expect(getDoc().collection).toEqual(before.collection)
  })

  it('tracks each piece independently within the same day', () => {
    setPieces([makePiece({ id: 'piece-1', timesPerDay: 1 }), makePiece({ id: 'piece-2', timesPerDay: 1 })])
    saveTake(makeTake({ id: 'a', day, pieceId: 'piece-1', repetitions: 1 }))
    saveTake(makeTake({ id: 'b', day, pieceId: 'piece-2', repetitions: 1 }))

    expect(awardSongTargetBeadsIfReached('piece-1', day)).toHaveLength(2)
    expect(awardSongTargetBeadsIfReached('piece-2', day)).toHaveLength(2)
    expect(getDoc().piano.days[day]?.songBeadsAwarded?.sort()).toEqual(['piece-1', 'piece-2'])
    const totalBeads = Object.values(getDoc().collection.beads).reduce((a, b) => a + b, 0)
    expect(totalBeads).toBe(4)
  })
})

describe('markAudioPruned', () => {
  it('marks only the given takes as pruned', () => {
    saveTake(makeTake({ id: 'a' }))
    saveTake(makeTake({ id: 'b' }))

    markAudioPruned(['a'], 12345)

    const doc = getDoc()
    const a = doc.piano.takes.find((t) => t.id === 'a')!
    const b = doc.piano.takes.find((t) => t.id === 'b')!
    expect(a.hasAudio).toBe(false)
    expect(a.audioPrunedAt).toBe(12345)
    expect(b.hasAudio).toBe(true)
    expect(b.audioPrunedAt).toBeUndefined()
  })

  it('is a no-op for an empty list', () => {
    saveTake(makeTake({ id: 'a' }))
    const before = getDoc()
    markAudioPruned([])
    expect(getDoc()).toEqual(before)
  })
})

function makeMetrics(overrides: Partial<TakeCoach['metrics']> = {}): TakeCoach['metrics'] {
  return { v: 1, playedSec: 42, hesitations: 1, longestPauseSec: 2.3, dynamicRangeDb: 12, ...overrides }
}

describe('setTakeAi', () => {
  it('writes ai.metrics and drops the take\'s onsets', () => {
    saveTake(makeTake({ id: 'a', onsets: [100, 250, 400] }))
    const ai: TakeCoach = { metrics: makeMetrics(), at: 5000 }

    setTakeAi('a', ai)

    const take = getDoc().piano.takes.find((t) => t.id === 'a')!
    expect(take.ai).toEqual(ai)
    expect(take.onsets).toBeUndefined()
    expect('onsets' in take).toBe(false)
  })

  it('merges a second call (adding kid/parent text) onto the first rather than clobbering it', () => {
    saveTake(makeTake({ id: 'a' }))
    setTakeAi('a', { metrics: makeMetrics(), at: 1000 })
    setTakeAi('a', {
      metrics: makeMetrics(),
      kid: { praise: 'Nice work!', tryNext: 'Try it again slowly.' },
      parent: { note: 'She played steadily today.' },
      source: 'rules',
      at: 2000,
    })

    const take = getDoc().piano.takes.find((t) => t.id === 'a')!
    expect(take.ai?.kid?.praise).toBe('Nice work!')
    expect(take.ai?.source).toBe('rules')
    expect(take.ai?.at).toBe(2000)
  })

  it('only touches the matching take', () => {
    saveTake(makeTake({ id: 'a', onsets: [1, 2] }))
    saveTake(makeTake({ id: 'b', onsets: [3, 4] }))
    setTakeAi('a', { metrics: makeMetrics(), at: 1000 })

    const b = getDoc().piano.takes.find((t) => t.id === 'b')!
    expect(b.ai).toBeUndefined()
    expect(b.onsets).toEqual([3, 4])
  })
})

describe('setJourney', () => {
  it('writes a journey for one piece without touching others', () => {
    setJourney('piece-1', { kid: 'Great progress!', parent: 'The trend looks good.', at: 1000, takeCount: 3, source: 'rules' })
    setJourney('piece-2', { kid: 'Also great!', parent: 'Also good.', at: 2000, takeCount: 5, source: 'claude' })

    const journeys = getDoc().piano.journeys
    expect(journeys?.['piece-1']?.kid).toBe('Great progress!')
    expect(journeys?.['piece-2']?.takeCount).toBe(5)
  })

  it('overwrites an existing journey for the same piece', () => {
    setJourney('piece-1', { kid: 'v1', parent: 'v1', at: 1000, takeCount: 3 })
    setJourney('piece-1', { kid: 'v2', parent: 'v2', at: 2000, takeCount: 6 })

    expect(getDoc().piano.journeys?.['piece-1']?.kid).toBe('v2')
  })
})

describe('slimOldTakes', () => {
  const today = '2026-09-20'

  it('drops waveform from takes strictly older than 14 days, keeps recent ones', () => {
    const oldDay = dayOffset(today, -20)
    const recentDay = dayOffset(today, -5)
    saveTake(makeTake({ id: 'old', day: oldDay, waveform: [1, 2, 3] }))
    saveTake(makeTake({ id: 'recent', day: recentDay, waveform: [4, 5, 6] }))

    slimOldTakes(today)

    const takes = getDoc().piano.takes
    expect(takes.find((t) => t.id === 'old')?.waveform).toBeUndefined()
    expect(takes.find((t) => t.id === 'recent')?.waveform).toEqual([4, 5, 6])
  })

  it('is a no-op (does not bump piano.updatedAt) when no take has a stale waveform', () => {
    saveTake(makeTake({ id: 'recent', day: dayOffset(today, -2), waveform: [1] }))
    const before = getDoc()

    slimOldTakes(today)

    expect(getDoc()).toEqual(before)
    expect(getDoc().piano.updatedAt).toBe(before.piano.updatedAt)
  })

  it('is a no-op for a take with no waveform to begin with', () => {
    saveTake(makeTake({ id: 'old', day: dayOffset(today, -30) }))
    const before = getDoc()

    slimOldTakes(today)

    expect(getDoc()).toEqual(before)
  })
})

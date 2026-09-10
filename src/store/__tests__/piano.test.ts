import { beforeEach, describe, expect, it } from 'vitest'
import { awardGoalIfReached, markAudioPruned, saveTake, setParentStars, setSelfRating, setTakeGoalHit } from '../piano'
import { getDoc, resetAll, update, type PianoTake } from '../progress'
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

describe('awardGoalIfReached', () => {
  it('defaults to "recording" mode: awards from wall time (durationSec), not activeSec', () => {
    const day = '2026-09-07'
    // Plenty of wall time, but well under the goal on activeSec alone -
    // proves this is summing durationSec, not activeSec.
    saveTake(makeTake({ id: 'a', day, durationSec: 900, activeSec: 100 }))

    expect(awardGoalIfReached(day, 15)).toBe(true)

    let doc = getDoc()
    expect(doc.piano.days[day]?.goalReachedAt).toBeTruthy()
    expect(doc.piano.streak.current).toBe(1)
    expect(doc.profiles.kid.tokens.bronze).toBe(1)
    expect(doc.profiles.kid.xp).toBe(10)

    // Second call the same day: no-op, no double award.
    expect(awardGoalIfReached(day, 15)).toBe(false)

    doc = getDoc()
    expect(doc.profiles.kid.tokens.bronze).toBe(1)
    expect(doc.profiles.kid.xp).toBe(10)
  })

  it('does not award before the goal is reached', () => {
    saveTake(makeTake({ id: 'a', day: '2026-09-07', durationSec: 100, activeSec: 100 }))
    expect(awardGoalIfReached('2026-09-07', 15)).toBe(false)
    expect(getDoc().piano.days['2026-09-07']).toBeUndefined()
    expect(getDoc().profiles.kid.tokens.bronze).toBe(0)
  })

  it('"heard" mode awards from activeSec instead, once the setting is switched', () => {
    update('settings', (s) => ({ ...s, pianoCountMode: 'heard' }))
    const day = '2026-09-07'
    // Plenty of wall time, but the goal is only reached on activeSec.
    saveTake(makeTake({ id: 'a', day, durationSec: 100, activeSec: 900 }))

    expect(awardGoalIfReached(day, 15)).toBe(true)
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

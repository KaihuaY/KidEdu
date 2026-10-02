import { beforeEach, describe, expect, it } from 'vitest'
import {
  RANDOM_GOAL,
  awardRandomGoldIfReached,
  clearPick,
  countsAsRandom,
  pickRandom,
  randomPool,
  randomSongsDone,
  randomStatus,
  readPick,
  reelSequence,
  respin,
  spin,
} from '../randomSong'
import { getDoc, resetAll, update, type PianoPiece, type PianoTake } from '../progress'
import { clearKid, kidKey, setKid } from '../kid'

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

const TODAY = '2026-10-01'

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
  resetAll()
  clearKid()
})

function makeTake(overrides: Partial<PianoTake> = {}): PianoTake {
  return {
    id: 'take-1',
    day: TODAY,
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

function piece(id: string, extra: Partial<PianoPiece> = {}): PianoPiece {
  return { id, name: id.toUpperCase(), emoji: '🎵', inRandom: true, ...extra }
}

function setPieces(pieces: PianoPiece[]): void {
  update('settings', (s) => ({ ...s, pianoPieces: pieces }))
}

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function randomTakes(n: number, day = TODAY, pieceId = 'a'): PianoTake[] {
  return Array.from({ length: n }, (_, i) => makeTake({ id: `r-${day}-${i}`, day, pieceId, random: true, durationSec: 30 }))
}

describe('randomPool', () => {
  it('keeps only flagged, non-archived pieces in order', () => {
    const pieces = [
      piece('a'),
      piece('b', { inRandom: false }),
      piece('c', { status: 'archived' }),
      piece('d', { inRandom: undefined }),
      piece('e', { status: 'keep' }),
    ]
    expect(randomPool(pieces).map((p) => p.id)).toEqual(['a', 'e'])
  })
})

describe('countsAsRandom / randomSongsDone', () => {
  it('needs the flag, no note, and at least 20 seconds', () => {
    expect(countsAsRandom(makeTake({ random: true, durationSec: 19 }))).toBe(false)
    expect(countsAsRandom(makeTake({ random: true, durationSec: 20 }))).toBe(true)
    expect(countsAsRandom(makeTake({ random: true, durationSec: 60, isNote: true }))).toBe(false)
    expect(countsAsRandom(makeTake({ durationSec: 60 }))).toBe(false)
  })

  it('counts per day', () => {
    const takes = [...randomTakes(3), ...randomTakes(2, '2026-09-30')]
    expect(randomSongsDone(takes, TODAY)).toBe(3)
    expect(randomSongsDone(takes, '2026-09-30')).toBe(2)
    expect(randomSongsDone(takes, '2026-09-29')).toBe(0)
  })
})

describe('randomStatus', () => {
  it('reports pool size, done, goal and earned', () => {
    setPieces([piece('a'), piece('b'), piece('c', { inRandom: false })])
    update('piano', (p) => ({ ...p, takes: randomTakes(4) }))
    expect(randomStatus(getDoc(), TODAY)).toEqual({ poolSize: 2, done: 4, goal: RANDOM_GOAL, earned: false })
    update('piano', (p) => ({ ...p, days: { ...p.days, [TODAY]: { randomGoldAt: 5 } } }))
    expect(randomStatus(getDoc(), TODAY).earned).toBe(true)
  })
})

describe('pickRandom', () => {
  const pool = [piece('a'), piece('b'), piece('c')]

  it('only returns pool songs and never the previous one when there is a choice', () => {
    const rng = lcg(42)
    for (let i = 0; i < 200; i++) {
      const prev = pool[i % 3].id
      const got = pickRandom(pool, [], TODAY, prev, rng)
      expect(got).not.toBeNull()
      expect(pool.map((p) => p.id)).toContain(got!.id)
      expect(got!.id).not.toBe(prev)
    }
  })

  it('prefers songs not yet counted today', () => {
    const rng = lcg(7)
    const takes = randomTakes(1, TODAY, 'a')
    for (let i = 0; i < 50; i++) {
      expect(['b', 'c']).toContain(pickRandom(pool, takes, TODAY, null, rng)!.id)
    }
  })

  it('returns a single-song pool even when it equals previousId', () => {
    expect(pickRandom([piece('a')], [], TODAY, 'a')?.id).toBe('a')
  })

  it('returns null for an empty pool', () => {
    expect(pickRandom([], [], TODAY, null)).toBeNull()
  })
})

describe('reelSequence', () => {
  it('has the right length, ends on the chosen song and never repeats neighbours', () => {
    const pool = [piece('a'), piece('b'), piece('c')]
    const rng = lcg(3)
    for (const len of [8, 24, 30]) {
      const seq = reelSequence(pool, pool[1], rng, len)
      expect(seq).toHaveLength(len)
      expect(seq[len - 1].id).toBe('b')
      for (let i = 1; i < seq.length; i++) expect(seq[i].id).not.toBe(seq[i - 1].id)
    }
    const two = reelSequence([piece('a'), piece('b')], piece('a'), rng)
    expect(two.at(-1)?.id).toBe('a')
    for (let i = 1; i < two.length; i++) expect(two[i].id).not.toBe(two[i - 1].id)
  })

  it('enforces a minimum length of 8', () => {
    expect(reelSequence([piece('a'), piece('b')], piece('a'), lcg(1), 3).length).toBe(8)
  })
})

describe('spin / respin / readPick / clearPick', () => {
  beforeEach(() => setPieces([piece('a'), piece('b'), piece('c')]))

  it('spin stores a pick for today', () => {
    const pick = spin(TODAY, lcg(1))
    expect(pick).not.toBeNull()
    expect(pick!.respinUsed).toBe(false)
    expect(readPick(TODAY)).toEqual(pick)
  })

  it('spin returns null for an empty pool', () => {
    setPieces([])
    expect(spin(TODAY)).toBeNull()
  })

  it('respin works once, changes the song, then returns the same pick', () => {
    const first = spin(TODAY, lcg(5))!
    const second = respin(TODAY, lcg(6))!
    expect(second.respinUsed).toBe(true)
    expect(second.pieceId).not.toBe(first.pieceId)
    const third = respin(TODAY, lcg(7))!
    expect(third).toEqual(second)
    expect(readPick(TODAY)).toEqual(second)
  })

  it('respin without a pick returns null', () => {
    expect(respin(TODAY)).toBeNull()
  })

  it('readPick is null for another day and when the piece left the pool', () => {
    const pick = spin(TODAY, lcg(2))!
    expect(readPick('2026-10-02')).toBeNull()
    setPieces([piece('a'), piece('b'), piece('c')].map((p) => (p.id === pick.pieceId ? { ...p, inRandom: false } : p)))
    expect(readPick(TODAY)).toBeNull()
  })

  it('clearPick removes it', () => {
    spin(TODAY, lcg(2))
    clearPick()
    expect(readPick(TODAY)).toBeNull()
  })

  it('is stored per kid', () => {
    spin(TODAY, lcg(2))
    expect(localStorage.getItem('cubeclimb.piano.randomPick')).toBeTruthy()
    setKid('amelia')
    expect(kidKey('cubeclimb.piano.randomPick')).not.toBe('cubeclimb.piano.randomPick')
    expect(localStorage.getItem(kidKey('cubeclimb.piano.randomPick'))).toBeNull()
  })

  it('ignores malformed storage', () => {
    localStorage.setItem(kidKey('cubeclimb.piano.randomPick'), '{nope')
    expect(readPick(TODAY)).toBeNull()
  })
})

describe('awardRandomGoldIfReached', () => {
  function setTakes(n: number, day = TODAY): void {
    update('piano', (p) => ({ ...p, takes: randomTakes(n, day) }))
  }

  it('does nothing at 9 counted takes', () => {
    setTakes(RANDOM_GOAL - 1)
    const goldBefore = getDoc().profiles.kid.tokens.gold
    const updatedBefore = getDoc().piano.updatedAt
    expect(awardRandomGoldIfReached(TODAY)).toBe(false)
    expect(getDoc().profiles.kid.tokens.gold).toBe(goldBefore)
    expect(getDoc().piano.updatedAt).toBe(updatedBefore)
  })

  it('grants one gold, stamps the day and awards the badge at 10, once', () => {
    setTakes(RANDOM_GOAL)
    const goldBefore = getDoc().profiles.kid.tokens.gold
    expect(awardRandomGoldIfReached(TODAY)).toBe(true)
    const doc = getDoc()
    expect(doc.profiles.kid.tokens.gold).toBe(goldBefore + 1)
    expect(doc.piano.days[TODAY]?.randomGoldAt).toBeTruthy()
    expect((doc.rewards.badges ?? []).map((b) => b.id)).toContain('surprise-gold-1')

    expect(awardRandomGoldIfReached(TODAY)).toBe(false)
    expect(getDoc().profiles.kid.tokens.gold).toBe(goldBefore + 1)
  })

  it('another day with no takes is false', () => {
    setTakes(RANDOM_GOAL)
    awardRandomGoldIfReached(TODAY)
    expect(awardRandomGoldIfReached('2026-10-02')).toBe(false)
  })
})

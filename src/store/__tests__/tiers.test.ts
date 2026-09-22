import { beforeEach, describe, expect, it } from 'vitest'
import { getDoc, resetAll, update, type PianoTake } from '../progress'
import { adjustTokens, awardGoalIfReached, awardTiersIfReached, saveTake } from '../piano'

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

const DAY = '2026-09-22'
let n = 0
function take(durationSec: number, extra: Partial<PianoTake> = {}): PianoTake {
  n++
  return {
    id: `t${n}`,
    day: DAY,
    pieceId: 'p1',
    startedAt: 1_000_000 + n * 1000,
    durationSec,
    activeSec: durationSec,
    mimeType: 'audio/mp4',
    sizeBytes: 1,
    hasAudio: true,
    deviceId: 'd',
    ...extra,
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  resetAll()
  n = 0
})

describe('awardTiersIfReached', () => {
  it('awards nothing below the gold mark and never touches updatedAt on a no-op', () => {
    saveTake(take(19 * 60 + 59))
    const before = getDoc().piano.updatedAt
    const profilesBefore = getDoc().profiles.updatedAt
    expect(awardTiersIfReached(DAY)).toEqual({ gold: false, bonus: null })
    expect(getDoc().piano.updatedAt).toBe(before)
    expect(getDoc().profiles.updatedAt).toBe(profilesBefore)
    expect(getDoc().profiles.kid.tokens).toEqual({ gold: 0, silver: 0, bronze: 0 })
  })

  it('gives exactly one gold token at 20 minutes, with gold XP, once per day', () => {
    saveTake(take(20 * 60))
    expect(awardTiersIfReached(DAY)).toEqual({ gold: true, bonus: null })
    expect(getDoc().profiles.kid.tokens.gold).toBe(1)
    expect(getDoc().profiles.kid.xp).toBe(30)
    expect(getDoc().piano.days[DAY].goldReachedAt).toBeTypeOf('number')
    saveTake(take(3 * 60))
    expect(awardTiersIfReached(DAY)).toEqual({ gold: false, bonus: null })
    expect(getDoc().profiles.kid.tokens.gold).toBe(1)
  })

  it('gives the bonus token at 30 minutes by coin toss, once, and remembers which tier', () => {
    saveTake(take(30 * 60))
    expect(awardTiersIfReached(DAY, () => 0.9)).toEqual({ gold: true, bonus: 'silver' })
    expect(getDoc().profiles.kid.tokens).toEqual({ gold: 1, silver: 1, bronze: 0 })
    expect(getDoc().piano.days[DAY].bonusTier).toBe('silver')
    saveTake(take(10 * 60))
    expect(awardTiersIfReached(DAY, () => 0.1)).toEqual({ gold: false, bonus: null })
    expect(getDoc().profiles.kid.tokens).toEqual({ gold: 1, silver: 1, bronze: 0 })
  })

  it('a heads coin toss gives gold', () => {
    saveTake(take(31 * 60))
    expect(awardTiersIfReached(DAY, () => 0.2).bonus).toBe('gold')
    expect(getDoc().profiles.kid.tokens.gold).toBe(2)
  })

  it('respects the parent-set marks and the count mode', () => {
    update('settings', (s) => ({ ...s, pianoTiers: { goldMin: 25, bonusMin: 40 }, pianoCountMode: 'heard' }))
    saveTake(take(30 * 60, { activeSec: 24 * 60 }))
    expect(awardTiersIfReached(DAY)).toEqual({ gold: false, bonus: null })
    saveTake(take(2 * 60, { activeSec: 60 }))
    expect(awardTiersIfReached(DAY)).toEqual({ gold: true, bonus: null })
  })

  it('stacks with the ring goal: 30 minutes in one go earns bronze, gold and the bonus', () => {
    saveTake(take(30 * 60))
    expect(awardGoalIfReached(DAY, 10)).toBe(true)
    expect(awardTiersIfReached(DAY, () => 0.1)).toEqual({ gold: true, bonus: 'gold' })
    expect(getDoc().profiles.kid.tokens).toEqual({ gold: 2, silver: 0, bronze: 1 })
  })

  it('ignores grown-up voice notes', () => {
    saveTake(take(25 * 60, { isNote: true }))
    expect(awardTiersIfReached(DAY)).toEqual({ gold: false, bonus: null })
  })
})

describe('adjustTokens (grown-up box control)', () => {
  it('adds and removes one token, never below zero, without touching XP', () => {
    expect(adjustTokens('gold', 1)).toBe(1)
    expect(adjustTokens('gold', 1)).toBe(2)
    expect(adjustTokens('gold', -1)).toBe(1)
    expect(adjustTokens('silver', -1)).toBe(0)
    expect(getDoc().profiles.kid.tokens).toEqual({ gold: 1, silver: 0, bronze: 0 })
    expect(getDoc().profiles.kid.xp).toBe(0)
  })

  it('writes nothing when removing from zero', () => {
    const before = getDoc().profiles.updatedAt
    adjustTokens('bronze', -1)
    expect(getDoc().profiles.updatedAt).toBe(before)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { getDoc, resetAll, update, type PianoTake } from '../progress'
import { awardMarksIfReached, pianoMarks, saveTake, tokenEmojis } from '../piano'

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

const DAY = '2026-09-25'
let n = 0
function take(durationSec: number, extra: Partial<PianoTake> = {}): PianoTake {
  n++
  return { id: `t${n}`, day: DAY, pieceId: 'p1', startedAt: 1_000_000 + n * 1000, durationSec, activeSec: durationSec, mimeType: 'audio/mp4', sizeBytes: 1, hasAudio: true, deviceId: 'd', ...extra }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  resetAll()
  n = 0
  update('settings', (s) => ({ ...s, goalMinutes: { ...s.goalMinutes, piano: 10 } }))
})

describe('pianoMarks', () => {
  it('defaults to 10 = gold, 20 = gold + bronze, 30 = gold + silver + bronze, with mark 1 = the ring goal', () => {
    const marks = pianoMarks(getDoc().settings)
    expect(marks.map((m) => m.minutes)).toEqual([10, 20, 30])
    expect(marks.map((m) => tokenEmojis(m.tokens))).toEqual(['🟡', '🟡🟤', '🟡⚪🟤'])
  })

  it('seeds marks 2 and 3 from the older pianoTiers setting and keeps them ascending', () => {
    update('settings', (s) => ({ ...s, pianoTiers: { goldMin: 25, bonusMin: 40 } }))
    expect(pianoMarks(getDoc().settings).map((m) => m.minutes)).toEqual([10, 25, 40])
    update('settings', (s) => ({ ...s, goalMinutes: { ...s.goalMinutes, piano: 30 } }))
    expect(pianoMarks(getDoc().settings).map((m) => m.minutes)).toEqual([30, 35, 40])
  })

  it('uses the parent-configured marks and follows the ring goal for mark 1', () => {
    update('settings', (s) => ({ ...s, pianoMarks: [{ minutes: 10, tokens: { gold: 0, silver: 0, bronze: 2 } }, { minutes: 15, tokens: { gold: 0, silver: 1, bronze: 0 } }, { minutes: 45, tokens: { gold: 3, silver: 0, bronze: 0 } }] }))
    expect(pianoMarks(getDoc().settings).map((m) => tokenEmojis(m.tokens))).toEqual(['🟤🟤', '⚪', '🟡🟡🟡'])
  })
})

describe('awardMarksIfReached', () => {
  it('awards nothing below the ring goal and never touches updatedAt on a no-op', () => {
    saveTake(take(9 * 60 + 59))
    const p = getDoc().piano.updatedAt
    const q = getDoc().profiles.updatedAt
    expect(awardMarksIfReached(DAY)).toEqual([])
    expect(getDoc().piano.updatedAt).toBe(p)
    expect(getDoc().profiles.updatedAt).toBe(q)
  })

  it('mark 1 gives the gold token by default, stamps the day and bumps the streak, once', () => {
    saveTake(take(10 * 60))
    const got = awardMarksIfReached(DAY)
    expect(got.map((m) => m.index)).toEqual([0])
    expect(getDoc().profiles.kid.tokens).toEqual({ gold: 1, silver: 0, bronze: 0 })
    expect(getDoc().profiles.kid.xp).toBe(30)
    expect(getDoc().piano.days[DAY].goalReachedAt).toBeTypeOf('number')
    expect(getDoc().piano.streak.current).toBe(1)
    saveTake(take(60))
    expect(awardMarksIfReached(DAY)).toEqual([])
    expect(getDoc().profiles.kid.tokens.gold).toBe(1)
  })

  it('a long take can cross all three marks at once: 🟡 + 🟡🟤 + 🟡⚪🟤', () => {
    saveTake(take(31 * 60))
    const got = awardMarksIfReached(DAY)
    expect(got.map((m) => m.index)).toEqual([0, 1, 2])
    expect(getDoc().profiles.kid.tokens).toEqual({ gold: 3, silver: 1, bronze: 2 })
    expect(getDoc().piano.days[DAY].goldReachedAt).toBeTypeOf('number')
    expect(getDoc().piano.days[DAY].bonusReachedAt).toBeTypeOf('number')
    expect(getDoc().piano.days[DAY].bonusTier).toBeUndefined()
    expect(getDoc().piano.streak.current).toBe(1)
  })

  it('a mark with no tokens still stamps (streak keeps working) but grants nothing', () => {
    update('settings', (s) => ({ ...s, pianoMarks: [{ minutes: 10, tokens: { gold: 0, silver: 0, bronze: 0 } }, { minutes: 20, tokens: { gold: 1, silver: 0, bronze: 0 } }, { minutes: 30, tokens: { gold: 1, silver: 1, bronze: 1 } }] }))
    saveTake(take(12 * 60))
    expect(awardMarksIfReached(DAY).map((m) => m.index)).toEqual([0])
    expect(getDoc().profiles.kid.tokens).toEqual({ gold: 0, silver: 0, bronze: 0 })
    expect(getDoc().piano.days[DAY].goalReachedAt).toBeTypeOf('number')
    expect(getDoc().piano.streak.current).toBe(1)
  })

  it('respects the count mode and ignores voice notes', () => {
    update('settings', (s) => ({ ...s, pianoCountMode: 'heard' }))
    saveTake(take(12 * 60, { activeSec: 8 * 60 }))
    expect(awardMarksIfReached(DAY)).toEqual([])
    saveTake(take(20 * 60, { isNote: true }))
    expect(awardMarksIfReached(DAY)).toEqual([])
    saveTake(take(3 * 60, { activeSec: 3 * 60 }))
    expect(awardMarksIfReached(DAY).map((m) => m.index)).toEqual([0])
  })

  it('days stamped by the older tier code are not awarded again', () => {
    saveTake(take(25 * 60))
    update('piano', (p) => ({ ...p, days: { ...p.days, [DAY]: { goalReachedAt: 1, goldReachedAt: 2 } } }))
    expect(awardMarksIfReached(DAY)).toEqual([])
    saveTake(take(6 * 60))
    expect(awardMarksIfReached(DAY).map((m) => m.index)).toEqual([2])
  })
})

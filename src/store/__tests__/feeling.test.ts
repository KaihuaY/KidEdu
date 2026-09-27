import { beforeEach, describe, expect, it } from 'vitest'
import { getDoc, resetAll, update } from '../progress'
import { markNudgeShown } from '../journal'
import { averageFeeling, feelingSeries, setDayFeeling, shouldAskFeeling } from '../feeling'

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

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  resetAll()
})

describe('setDayFeeling', () => {
  it('clamps to 1..10, rounds, and stamps feelingAt', () => {
    setDayFeeling(DAY, 0)
    expect(getDoc().piano.days[DAY]?.feeling).toBe(1)
    expect(getDoc().piano.days[DAY]?.feelingAt).toBeGreaterThan(0)

    setDayFeeling(DAY, 11)
    expect(getDoc().piano.days[DAY]?.feeling).toBe(10)

    setDayFeeling(DAY, 7.6)
    expect(getDoc().piano.days[DAY]?.feeling).toBe(8)
  })

  it('is a no-op when the value would not change', () => {
    setDayFeeling(DAY, 5)
    const updatedAt = getDoc().piano.updatedAt
    setDayFeeling(DAY, 5)
    expect(getDoc().piano.updatedAt).toBe(updatedAt)
    expect(getDoc().piano.days[DAY]?.feeling).toBe(5)
  })
})

describe('shouldAskFeeling', () => {
  it('is false for a note, true once the ring is reached (just now or already), false once answered or dismissed', () => {
    expect(shouldAskFeeling(getDoc(), DAY, false)).toBe(false)
    expect(shouldAskFeeling(getDoc(), DAY, true, true)).toBe(false)
    expect(shouldAskFeeling(getDoc(), DAY, true)).toBe(true)

    update('piano', (piano) => ({ ...piano, days: { ...piano.days, [DAY]: { ...piano.days[DAY], goalReachedAt: Date.now() } } }))
    expect(shouldAskFeeling(getDoc(), DAY, false)).toBe(true)

    setDayFeeling(DAY, 6)
    expect(shouldAskFeeling(getDoc(), DAY, false)).toBe(false)
  })

  it('is false once the feeling nudge was dismissed for the day', () => {
    update('piano', (piano) => ({ ...piano, days: { ...piano.days, [DAY]: { ...piano.days[DAY], goalReachedAt: Date.now() } } }))
    markNudgeShown(DAY, 'feeling')
    expect(shouldAskFeeling(getDoc(), DAY, false)).toBe(false)
  })
})

describe('feelingSeries / averageFeeling', () => {
  it('returns undefined values for days without a feeling, and averages the rest rounded to 1 decimal', () => {
    const days = ['2026-09-23', '2026-09-24', '2026-09-25']
    setDayFeeling('2026-09-24', 4)
    setDayFeeling('2026-09-25', 7)
    const series = feelingSeries(getDoc().piano, days)
    expect(series).toEqual([
      { label: '9/23', value: undefined },
      { label: '9/24', value: 4 },
      { label: '9/25', value: 7 },
    ])
    expect(averageFeeling(getDoc().piano, days)).toBeCloseTo(5.5)
    expect(averageFeeling(getDoc().piano, ['2026-09-23'])).toBeUndefined()
  })
})

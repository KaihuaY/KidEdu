import { beforeEach, describe, expect, it } from 'vitest'
import { bumpStreak, dayOffset, formatClock, lastNDays, localDay, logCubeSession } from '../sessions'
import { getDoc, resetAll } from '../progress'

// Same in-memory localStorage mock as progress.test.ts - sessions.ts writes
// through progress.ts's `update`, which persists to localStorage.
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

describe('localDay', () => {
  it('uses the local calendar day, not UTC', () => {
    // 2026-09-07 23:30 local time must stay 2026-09-07 regardless of the
    // machine's UTC offset - this is exactly the bug toISOString() had.
    expect(localDay(new Date(2026, 8, 7, 23, 30))).toBe('2026-09-07')
  })

  it('pads single-digit months and days', () => {
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('dayOffset', () => {
  it('moves forward and backward across a month boundary', () => {
    expect(dayOffset('2026-09-07', -1)).toBe('2026-09-06')
    expect(dayOffset('2026-09-01', -1)).toBe('2026-08-31')
    expect(dayOffset('2026-09-07', 1)).toBe('2026-09-08')
  })
})

describe('lastNDays', () => {
  it('returns n days ending at today, oldest first', () => {
    const days = lastNDays(3, '2026-09-07')
    expect(days).toEqual(['2026-09-05', '2026-09-06', '2026-09-07'])
  })
})

describe('bumpStreak', () => {
  it('starts a fresh streak at 1 from a blank streak', () => {
    const next = bumpStreak({ current: 0, best: 0, lastDay: '' }, '2026-09-07')
    expect(next).toEqual({ current: 1, best: 1, lastDay: '2026-09-07' })
  })

  it('continues the streak when the last day was yesterday', () => {
    const next = bumpStreak({ current: 4, best: 4, lastDay: '2026-09-06' }, '2026-09-07')
    expect(next).toEqual({ current: 5, best: 5, lastDay: '2026-09-07' })
  })

  it('leaves current unchanged when already logged today', () => {
    const next = bumpStreak({ current: 4, best: 6, lastDay: '2026-09-07' }, '2026-09-07')
    expect(next).toEqual({ current: 4, best: 6, lastDay: '2026-09-07' })
  })

  it('restarts at 1 when a day was missed', () => {
    const next = bumpStreak({ current: 5, best: 5, lastDay: '2026-09-01' }, '2026-09-07')
    expect(next).toEqual({ current: 1, best: 5, lastDay: '2026-09-07' })
  })

  it('tracks best as the max ever reached', () => {
    const next = bumpStreak({ current: 2, best: 10, lastDay: '2026-09-06' }, '2026-09-07')
    expect(next).toEqual({ current: 3, best: 10, lastDay: '2026-09-07' })
  })
})

describe('formatClock', () => {
  it('formats M:SS, zero-padding seconds', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(600)).toBe('10:00')
  })
})

describe('logCubeSession', () => {
  it('logs one session per local day and bumps the streak', () => {
    logCubeSession('kid', 10)
    const today = localDay()
    const kid = getDoc().profiles.kid
    expect(kid.sessions).toEqual([{ day: today, minutes: 10, stagesDone: 0 }])
    expect(kid.streak.current).toBe(1)
  })

  it('does not log a second session the same day, and does not re-bump the streak', () => {
    logCubeSession('kid', 10)
    logCubeSession('kid', 10)
    const kid = getDoc().profiles.kid
    expect(kid.sessions.length).toBe(1)
    expect(kid.streak.current).toBe(1)
  })
})

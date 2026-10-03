import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chainLength, isSick, markableDays, recomputeCubeStreak, recomputePianoStreak, setSickDay, sickDays } from '../sickDays'
import { dayOffset, logCubeSession } from '../sessions'
import { getDoc, resetAll, update, type PianoDay, type Streak } from '../progress'

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

const D = '2026-09-30'
const off = (n: number) => dayOffset(D, n)

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  resetAll()
})

afterEach(() => {
  vi.useRealTimers()
})

function seedPiano(rings: number[], streak: Streak, extra: Record<number, PianoDay> = {}): void {
  update('piano', (piano) => {
    const days: Record<string, PianoDay> = {}
    for (const n of rings) days[off(n)] = { goalReachedAt: 1 }
    for (const [n, d] of Object.entries(extra)) days[off(Number(n))] = { ...days[off(Number(n))], ...d }
    return { ...piano, days, streak }
  })
}

function range(from: number, to: number): number[] {
  const out: number[] = []
  for (let i = from; i <= to; i++) out.push(i)
  return out
}

describe('markableDays', () => {
  it('runs from today-30 to today+1', () => {
    const days = markableDays(D)
    expect(days).toHaveLength(32)
    expect(days[0]).toBe(off(-30))
    expect(days[31]).toBe(off(1))
  })
})

describe('chainLength', () => {
  const set = (...ds: string[]) => (d: string) => ds.includes(d)
  it('counts consecutive practised days', () => {
    expect(chainLength(set(off(0), off(-1), off(-2)), () => false, off(0))).toBe(3)
  })
  it('passes over bridge days without counting them', () => {
    expect(chainLength(set(off(0), off(-3)), set(off(-1), off(-2)), off(0))).toBe(2)
  })
  it('stops at a gap', () => {
    expect(chainLength(set(off(0), off(-2)), () => false, off(0))).toBe(1)
  })
})

describe('recomputePianoStreak', () => {
  it('counts only ring days across sick gaps', () => {
    seedPiano([0, -1, -4], { current: 0, best: 0, lastDay: '' }, { [-2]: { sickDay: true }, [-3]: { sickDay: true } })
    expect(recomputePianoStreak(getDoc().piano)).toEqual({ current: 3, best: 3, lastDay: off(0) })
  })
  it('bridges a mix of sick and frozen days', () => {
    seedPiano([0, -3], { current: 0, best: 0, lastDay: '' }, { [-1]: { sickDay: true }, [-2]: { streakFreeze: true } })
    expect(recomputePianoStreak(getDoc().piano).current).toBe(2)
  })
  it('stops at an unmarked gap', () => {
    seedPiano([0, -3], { current: 0, best: 0, lastDay: '' }, { [-1]: { sickDay: true } })
    expect(recomputePianoStreak(getDoc().piano).current).toBe(1)
  })
  it('never lowers best', () => {
    seedPiano([0], { current: 0, best: 12, lastDay: '' })
    expect(recomputePianoStreak(getDoc().piano).best).toBe(12)
  })
  it('is 0 with no ring days', () => {
    seedPiano([], { current: 4, best: 6, lastDay: off(-1) })
    expect(recomputePianoStreak(getDoc().piano)).toEqual({ current: 0, best: 6, lastDay: off(-1) })
  })
})

describe('setSickDay', () => {
  it('restores a streak retroactively, updates records and badges, and un-marking lowers current but not best', () => {
    seedPiano([...range(-13, -4), -1], { current: 1, best: 10, lastDay: off(-1) })
    expect(setSickDay(off(-3), true, D)).toBe(true)
    expect(getDoc().piano.streak.current).toBe(1)
    expect(setSickDay(off(-2), true, D)).toBe(true)
    const piano = getDoc().piano
    expect(piano.streak).toEqual({ current: 11, best: 11, lastDay: off(-1) })
    expect(piano.records?.longestStreakDays?.value).toBe(11)
    expect(getDoc().rewards.badges?.map((b) => b.id)).toContain('piano-streak-7')
    expect(sickDays(piano)).toEqual([off(-3), off(-2)])

    expect(setSickDay(off(-3), false, D)).toBe(true)
    expect(getDoc().piano.streak.current).toBe(1)
    expect(getDoc().piano.streak.best).toBe(11)
    expect(getDoc().piano.days[off(-3)]).toBeUndefined()
    expect(isSick(getDoc().piano, off(-2))).toBe(true)
  })

  it('is a no-op when already in the requested state', () => {
    seedPiano([0], { current: 1, best: 1, lastDay: off(0) })
    expect(setSickDay(off(-5), false, D)).toBe(false)
    expect(setSickDay(off(-5), true, D)).toBe(true)
    const before = getDoc().piano
    expect(setSickDay(off(-5), true, D)).toBe(false)
    expect(getDoc().piano).toBe(before)
  })

  it('refuses a ring day and out-of-range days, and accepts tomorrow', () => {
    seedPiano([0], { current: 1, best: 1, lastDay: off(0) })
    const before = getDoc().piano
    expect(setSickDay(off(0), true, D)).toBe(false)
    expect(setSickDay(off(-31), true, D)).toBe(false)
    expect(setSickDay(off(2), true, D)).toBe(false)
    expect(getDoc().piano).toBe(before)
    expect(setSickDay(off(1), true, D)).toBe(true)
    expect(isSick(getDoc().piano, off(1))).toBe(true)
  })

  it('never lowers a stored streak when marking an unrelated day', () => {
    seedPiano([-2, -1, 0], { current: 9, best: 9, lastDay: off(0) })
    expect(setSickDay(off(-20), true, D)).toBe(true)
    expect(getDoc().piano.streak.current).toBe(9)
  })

  it('updates the kid cube streak from the marked gap', () => {
    update('profiles', (p) => ({
      ...p,
      kid: {
        ...p.kid,
        sessions: [...range(-6, -3), 0].map((n) => ({ day: off(n), minutes: 5, stagesDone: 0 })),
        streak: { current: 1, best: 4, lastDay: off(0) },
      },
    }))
    expect(setSickDay(off(-2), true, D)).toBe(true)
    expect(getDoc().profiles.kid.streak.current).toBe(1)
    expect(setSickDay(off(-1), true, D)).toBe(true)
    expect(getDoc().profiles.kid.streak).toEqual({ current: 5, best: 5, lastDay: off(0) })
  })
})

describe('recomputeCubeStreak', () => {
  it('restores a reset cube streak when the gap days are sick', () => {
    const sessions = [...range(-6, -3), 0].map((n) => ({ day: off(n) }))
    seedPiano([], { current: 0, best: 0, lastDay: '' }, { [-2]: { sickDay: true }, [-1]: { sickDay: true } })
    const piano = getDoc().piano
    expect(recomputeCubeStreak({ sessions, streak: { current: 1, best: 4, lastDay: off(0) } }, piano)).toEqual({ current: 5, best: 5, lastDay: off(0) })
  })
})

describe('logCubeSession across sick days', () => {
  function seedCube(sick: number[]): void {
    seedPiano([], { current: 0, best: 0, lastDay: '' }, Object.fromEntries(sick.map((n) => [n, { sickDay: true as const }])))
    update('profiles', (p) => ({
      ...p,
      kid: {
        ...p.kid,
        sessions: range(-6, -3).map((n) => ({ day: off(n), minutes: 5, stagesDone: 0 })),
        streak: { current: 4, best: 4, lastDay: off(-3) },
      },
    }))
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0, 0))
  }

  it('continues the streak when every gap day is sick', () => {
    seedCube([-2, -1])
    logCubeSession('kid', 10)
    expect(getDoc().profiles.kid.streak).toEqual({ current: 5, best: 5, lastDay: D })
  })

  it('restarts when one gap day is not sick', () => {
    seedCube([-1])
    logCubeSession('kid', 10)
    expect(getDoc().profiles.kid.streak.current).toBe(1)
  })
})

// Added in review: a stored streak the day history cannot fully prove must
// never be cut by a grown-up toggling a mark on and off again.
describe('un-marking never cuts a streak the history cannot prove', () => {
  it('mark then un-mark leaves an unprovable stored streak exactly as it was', async () => {
    const { getDoc, update } = await import('../progress')
    const { setSickDay } = await import('../sickDays')
    const { dayOffset } = await import('../sessions')
    const D = '2026-10-10'
    update('piano', (p) => ({
      ...p,
      days: { [dayOffset(D, -1)]: { goalReachedAt: 1 }, [dayOffset(D, -2)]: { goalReachedAt: 1 }, [dayOffset(D, -4)]: { goalReachedAt: 1 } },
      streak: { current: 9, best: 9, lastDay: dayOffset(D, -1) },
    }))
    expect(setSickDay(dayOffset(D, -3), true, D)).toBe(true)
    expect(getDoc().piano.streak.current).toBe(9)
    expect(setSickDay(dayOffset(D, -3), false, D)).toBe(true)
    expect(getDoc().piano.streak).toEqual({ current: 9, best: 9, lastDay: dayOffset(D, -1) })
  })
})

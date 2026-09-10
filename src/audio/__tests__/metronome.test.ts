import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clampBpm,
  getMetronomeState,
  getRememberedBpm,
  nudgeBpm,
  setBpm,
  setClick,
  setRememberedBpm,
  start,
  stop,
} from '../metronome'

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
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

describe('clampBpm', () => {
  it('clamps below the floor up to 40', () => {
    expect(clampBpm(10)).toBe(40)
  })

  it('clamps above the ceiling down to 160', () => {
    expect(clampBpm(999)).toBe(160)
  })

  it('rounds a fractional bpm', () => {
    expect(clampBpm(84.6)).toBe(85)
  })

  it('falls back to the default for a non-finite input', () => {
    expect(clampBpm(NaN)).toBe(84)
  })

  it('passes through an in-range whole bpm unchanged', () => {
    expect(clampBpm(96)).toBe(96)
  })
})

describe('nudgeBpm', () => {
  it('adds the delta and clamps', () => {
    expect(nudgeBpm(84, 4)).toBe(88)
    expect(nudgeBpm(84, -4)).toBe(80)
  })

  it('never nudges past the ceiling', () => {
    expect(nudgeBpm(158, 4)).toBe(160)
  })

  it('never nudges past the floor', () => {
    expect(nudgeBpm(42, -4)).toBe(40)
  })
})

describe('remembered tempo per piece', () => {
  it('defaults to 84 for a piece never set', () => {
    expect(getRememberedBpm('piece-1')).toBe(84)
    expect(getRememberedBpm(null)).toBe(84)
  })

  it('remembers a tempo set for one piece independently of another', () => {
    setRememberedBpm('piece-1', 108)
    setRememberedBpm('piece-2', 60)
    expect(getRememberedBpm('piece-1')).toBe(108)
    expect(getRememberedBpm('piece-2')).toBe(60)
    expect(getRememberedBpm(null)).toBe(84)
  })

  it('clamps a remembered tempo on the way in', () => {
    setRememberedBpm('piece-1', 999)
    expect(getRememberedBpm('piece-1')).toBe(160)
  })
})

describe('start/stop/setBpm', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('start marks running, sets bpm, and resets the beat counter', () => {
    start(96)
    const s = getMetronomeState()
    expect(s.running).toBe(true)
    expect(s.bpm).toBe(96)
    expect(s.beat).toBe(0)
  })

  it('increments the beat counter on an interval matching the bpm', () => {
    start(120) // one beat every 500ms
    expect(getMetronomeState().beat).toBe(0)
    vi.advanceTimersByTime(500)
    expect(getMetronomeState().beat).toBe(1)
    vi.advanceTimersByTime(500)
    expect(getMetronomeState().beat).toBe(2)
  })

  it('ticks at least 3 times in 3s at 84bpm', () => {
    start(84) // ~714ms per beat
    vi.advanceTimersByTime(3000)
    expect(getMetronomeState().beat).toBeGreaterThanOrEqual(3)
  })

  it('stop halts the beat counter and marks not running', () => {
    start(120)
    vi.advanceTimersByTime(500)
    stop()
    const beatAtStop = getMetronomeState().beat
    expect(getMetronomeState().running).toBe(false)
    vi.advanceTimersByTime(2000)
    expect(getMetronomeState().beat).toBe(beatAtStop)
  })

  it('setBpm reschedules a running metronome at the new tempo', () => {
    start(60) // one beat/second
    vi.advanceTimersByTime(1000)
    expect(getMetronomeState().beat).toBe(1)
    setBpm(120) // now one beat every 500ms
    vi.advanceTimersByTime(500)
    expect(getMetronomeState().beat).toBe(2)
  })

  it('setBpm on a stopped metronome only updates the tempo, not the beat', () => {
    const beatBefore = getMetronomeState().beat
    setBpm(72)
    expect(getMetronomeState().bpm).toBe(72)
    expect(getMetronomeState().running).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(getMetronomeState().beat).toBe(beatBefore)
  })

  it('setClick toggles the click flag without touching running/bpm', () => {
    start(96)
    setClick(false)
    const s = getMetronomeState()
    expect(s.click).toBe(false)
    expect(s.running).toBe(true)
    expect(s.bpm).toBe(96)
  })
})

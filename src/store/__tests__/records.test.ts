import { beforeEach, describe, expect, it } from 'vitest'
import { getDoc, resetAll, type PianoTake } from '../progress'
import { saveTake } from '../piano'
import { beatenRecords, computeRecords, playsInTake, updateRecords } from '../records'

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

let n = 0
function take(day: string, durationSec: number, extra: Partial<PianoTake> = {}): PianoTake {
  n++
  return {
    id: `t${n}`,
    day,
    pieceId: 'twinkle',
    startedAt: Date.parse(day + 'T10:00:00') + n * 60_000,
    durationSec,
    activeSec: durationSec,
    mimeType: 'audio/mp4',
    sizeBytes: 1,
    hasAudio: true,
    deviceId: 'd',
    ...extra,
  }
}
const streak = { current: 3, best: 5, lastDay: '2026-09-20' }

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  resetAll()
  n = 0
})

describe('computeRecords', () => {
  it('finds the longest take, the biggest day, the most plays of one song and the best streak; notes never count', () => {
    const takes = [
      take('2026-09-18', 60),
      take('2026-09-18', 150), // longest take
      take('2026-09-19', 100, { repetitions: 3 }),
      take('2026-09-19', 90, { repetitions: 2 }), // 5 plays of twinkle on the 19th
      take('2026-09-19', 40, { pieceId: 'ode' }),
      take('2026-09-20', 900, { isNote: true }), // a voice note: ignored everywhere
    ]
    const r = computeRecords(takes, streak, 'recording', 123)
    expect(r.longestTakeSec).toMatchObject({ value: 150, day: '2026-09-18', takeId: 't2' })
    expect(r.mostSecondsInDay).toMatchObject({ value: 230, day: '2026-09-19' })
    expect(r.mostPlaysOfSong).toMatchObject({ value: 5, day: '2026-09-19', pieceId: 'twinkle' })
    expect(r.longestStreakDays).toMatchObject({ value: 5 })
  })

  it('needs at least two plays of a song in a day before it is a record, and counts a plain take as one play', () => {
    expect(playsInTake(take('2026-09-18', 30))).toBe(1)
    expect(playsInTake(take('2026-09-18', 30, { repetitions: 4 }))).toBe(4)
    const r = computeRecords([take('2026-09-18', 30), take('2026-09-19', 30, { pieceId: 'ode' })], streak)
    expect(r.mostPlaysOfSong).toBeUndefined()
  })

  it('uses heard seconds when the count mode says so', () => {
    const r = computeRecords([take('2026-09-18', 300, { activeSec: 120 })], streak, 'heard')
    expect(r.mostSecondsInDay?.value).toBe(120)
    expect(r.longestTakeSec?.value).toBe(300)
  })

  it('reports which records were beaten, and nothing on the very first computation', () => {
    const before = computeRecords([take('2026-09-18', 60)], streak)
    const after = computeRecords([take('2026-09-18', 60), take('2026-09-19', 90)], streak)
    expect(beatenRecords(before, after)).toEqual(['longestTakeSec', 'mostSecondsInDay'])
    expect(beatenRecords(undefined, after)).toEqual([])
  })
})

describe('updateRecords', () => {
  it('caches silently the first time, then celebrates only real improvements and keeps old setAt dates', () => {
    saveTake(take('2026-09-18', 60))
    expect(updateRecords()).toEqual([])
    const first = getDoc().piano.records!
    expect(first.longestTakeSec?.value).toBe(60)

    saveTake(take('2026-09-19', 45))
    expect(updateRecords()).toEqual([]) // 45 s is shorter than 60 on both counts, and one play is not a plays record
    expect(getDoc().piano.records!.longestTakeSec).toEqual(first.longestTakeSec)

    saveTake(take('2026-09-19', 80))
    // Longer take, bigger day, and the second play of the song that day is her first "plays" record.
    expect(updateRecords()).toEqual(['longestTakeSec', 'mostSecondsInDay', 'mostPlaysOfSong'])
    expect(getDoc().piano.records!.longestTakeSec?.value).toBe(80)
    expect(getDoc().piano.records!.mostSecondsInDay?.value).toBe(125)
  })

  it('writes nothing when no record changed', () => {
    saveTake(take('2026-09-18', 60))
    updateRecords()
    const before = getDoc().piano.updatedAt
    expect(updateRecords()).toEqual([])
    expect(getDoc().piano.updatedAt).toBe(before)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { awardMarksIfReached, saveTake } from '../piano'
import { computeRecords } from '../records'
import { getDoc, resetAll, type PianoTake } from '../progress'
import { applyFreezeIfNeeded, freezeAvailable, freezeUsedInWeek, frozenDays, weekKey } from '../streakFreeze'

// Same in-memory localStorage mock as piano.test.ts - piano.ts writes through
// progress.ts's `update`, which persists there.
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

/** Logs one day's practice (past the default 15-minute ring goal) and runs awardMarksIfReached. */
function practice(day: string): void {
  const take: PianoTake = {
    id: `take-${day}`,
    day,
    pieceId: null,
    startedAt: Date.now(),
    durationSec: 900,
    activeSec: 900,
    mimeType: 'audio/webm',
    sizeBytes: 1000,
    hasAudio: true,
    deviceId: 'device-1',
  }
  saveTake(take)
  awardMarksIfReached(day)
}

describe('weekKey', () => {
  it('maps a Sunday to the previous Monday', () => {
    expect(weekKey('2026-09-27')).toBe('2026-09-21')
  })

  it('maps a Monday to itself', () => {
    expect(weekKey('2026-09-21')).toBe('2026-09-21')
  })
})

describe('applyFreezeIfNeeded (pure)', () => {
  it('is a no-op with an empty piano section', () => {
    const piano = getDoc().piano
    const { piano: next, frozenDay } = applyFreezeIfNeeded(piano, '2026-09-23')
    expect(frozenDay).toBeNull()
    expect(next).toBe(piano)
  })
})

describe('freeze applies for exactly one missed day', () => {
  it('bridges a single-day gap: streak becomes current+1 and the missed day is stamped', () => {
    practice('2026-09-21') // Mon
    // 2026-09-22 (Tue) skipped
    practice('2026-09-23') // Wed - day-2 === lastDay

    const doc = getDoc()
    expect(doc.piano.streak.current).toBe(2)
    expect(doc.piano.streak.lastDay).toBe('2026-09-23')
    expect(doc.piano.days['2026-09-22']?.streakFreeze).toBe(true)
    expect(frozenDays(doc.piano)).toEqual(['2026-09-22'])
  })

  it('a longer chain keeps going through the frozen day (streak.best counts it)', () => {
    practice('2026-09-21') // Mon: current 1
    // Tue skipped
    practice('2026-09-23') // Wed: freeze Tue, current 2
    practice('2026-09-24') // Thu: current 3
    practice('2026-09-25') // Fri: current 4

    const doc = getDoc()
    expect(doc.piano.streak.current).toBe(4)
    expect(doc.piano.streak.best).toBe(4)
    expect(doc.piano.days['2026-09-22']?.streakFreeze).toBe(true)
  })
})

describe('freeze does not apply outside the one-missed-day case', () => {
  it('does nothing on a normal consecutive-day streak (lastDay = day-1)', () => {
    practice('2026-09-21')
    practice('2026-09-22')

    const doc = getDoc()
    expect(doc.piano.streak.current).toBe(2)
    expect(frozenDays(doc.piano)).toEqual([])
  })

  it('resets to 1 when two days were missed (lastDay = day-3)', () => {
    practice('2026-09-21')
    // 09-22 and 09-23 skipped
    practice('2026-09-24')

    const doc = getDoc()
    expect(doc.piano.streak.current).toBe(1)
    expect(frozenDays(doc.piano)).toEqual([])
  })
})

describe('one freeze per Mon-Sun week', () => {
  it('a second one-day gap in the same week resets the streak instead of freezing again', () => {
    practice('2026-09-21') // Mon: current 1
    // Tue skipped
    practice('2026-09-23') // Wed: freeze Tue, current 2
    // Thu skipped
    practice('2026-09-25') // Fri: same week as the Tue freeze - should NOT freeze again

    const doc = getDoc()
    expect(doc.piano.streak.current).toBe(1)
    expect(doc.piano.days['2026-09-24']?.streakFreeze).toBeUndefined()
    expect(frozenDays(doc.piano)).toEqual(['2026-09-22'])
    expect(freezeUsedInWeek(doc.piano, '2026-09-25')).toBe('2026-09-22')
    expect(freezeAvailable(doc.piano, '2026-09-25')).toBe(false)
  })

  it('a freeze used last week does not block this week', () => {
    practice('2026-09-21') // Mon week 1: current 1
    // Tue skipped
    practice('2026-09-23') // Wed: freeze Tue (week 1), current 2
    // 09-24..09-27 skipped (streak breaks)
    practice('2026-09-28') // Mon week 2: reset to 1
    // Tue 09-29 skipped
    practice('2026-09-30') // Wed week 2: day-2 matches lastDay -> freeze should apply again (new week)

    const doc = getDoc()
    expect(doc.piano.streak.current).toBe(2)
    expect(doc.piano.days['2026-09-29']?.streakFreeze).toBe(true)
    expect(frozenDays(doc.piano).sort()).toEqual(['2026-09-22', '2026-09-29'])
    expect(freezeAvailable(doc.piano, '2026-09-30')).toBe(false) // this week's freeze is now used
    expect(freezeUsedInWeek(doc.piano, '2026-09-23')).toBe('2026-09-22') // last week's freeze is unaffected
  })
})

describe('records.longestStreakDays', () => {
  it('counts the frozen day as part of the chain', () => {
    practice('2026-09-21')
    practice('2026-09-23') // freeze
    practice('2026-09-24')
    practice('2026-09-25')

    const doc = getDoc()
    const records = computeRecords(doc.piano.takes, doc.piano.streak, doc.settings.pianoCountMode ?? 'recording')
    expect(records.longestStreakDays?.value).toBe(4)
  })
})

describe('cube streak is untouched', () => {
  it('leaves profiles.kid.streak at its default', () => {
    practice('2026-09-21')
    practice('2026-09-23')
    practice('2026-09-24')

    const kidStreak = getDoc().profiles.kid.streak
    expect(kidStreak).toEqual({ current: 0, best: 0, lastDay: '' })
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { BADGES, earnedBadges } from '../badges'
import { defaultDoc, resetAll, type MissionProgress, type PianoTake, type ProgressDoc } from '../../store/progress'

// Same in-memory localStorage mock used by src/store/__tests__/progress.test.ts,
// since awardNewBadges() round-trips through the real progress store.
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

function doneMission(): MissionProgress {
  return { completedAt: 1, tier: 'gold', tries: 1, help: 'none', minutes: 1 }
}

function take(overrides: Partial<PianoTake> = {}): PianoTake {
  return {
    id: 'take-1',
    day: '2026-09-07',
    pieceId: null,
    startedAt: 0,
    durationSec: 60,
    activeSec: 30,
    mimeType: 'audio/webm',
    sizeBytes: 1000,
    hasAudio: true,
    deviceId: 'device-1',
    ...overrides,
  }
}

describe('earnedBadges - cube firsts', () => {
  it('fires each hold-first exactly on its mission completion', () => {
    const doc: ProgressDoc = defaultDoc()
    doc.profiles.kid.holds.daisy = { stages: {}, missions: { D4: doneMission() } }
    expect(earnedBadges(doc)).toContain('first-daisy')
    expect(earnedBadges(doc)).not.toContain('first-cross')

    doc.profiles.kid.holds.cross = { stages: {}, missions: { C3: doneMission() } }
    doc.profiles.kid.holds.corners = { stages: {}, missions: { E3: doneMission() } }
    doc.profiles.kid.holds.middle = { stages: {}, missions: { M4: doneMission() } }
    doc.profiles.kid.holds.yellowCross = { stages: {}, missions: { Y2: doneMission() } }
    doc.profiles.kid.holds.cornerOrient = { stages: {}, missions: { S2: doneMission() } }

    const earned = earnedBadges(doc)
    expect(earned).toEqual(
      expect.arrayContaining(['first-daisy', 'first-cross', 'first-corners', 'first-middle', 'first-yellow-cross', 'summit']),
    )
  })

  it('does not fire on a mastered hold with no per-mission record either, since isMissionDone treats mastery as done', () => {
    const doc: ProgressDoc = defaultDoc()
    doc.profiles.kid.holds.daisy = { stages: {}, missions: {}, masteredAt: 1 }
    expect(earnedBadges(doc)).toContain('first-daisy')
  })
})

describe('earnedBadges - streaks', () => {
  it('fires cube streak milestones off streak.best, not current', () => {
    const doc: ProgressDoc = defaultDoc()
    doc.profiles.kid.streak = { current: 1, best: 7, lastDay: '2026-09-07' }
    const earned = earnedBadges(doc)
    expect(earned).toContain('cube-streak-3')
    expect(earned).toContain('cube-streak-7')
    expect(earned).not.toContain('cube-streak-14')
  })

  it('fires piano streak milestones off piano.streak.best', () => {
    const doc: ProgressDoc = defaultDoc()
    doc.piano.streak = { current: 1, best: 30, lastDay: '2026-09-07' }
    const earned = earnedBadges(doc)
    expect(earned).toEqual(
      expect.arrayContaining(['piano-streak-3', 'piano-streak-7', 'piano-streak-14', 'piano-streak-30']),
    )
  })
})

describe('earnedBadges - piano takes', () => {
  it('first-take and ten-takes count real takes only, never a grown-up note', () => {
    const doc: ProgressDoc = defaultDoc()
    doc.piano.takes = [take({ id: 'note-1', isNote: true })]
    expect(earnedBadges(doc)).not.toContain('first-take')

    doc.piano.takes = Array.from({ length: 9 }, (_, i) => take({ id: `t${i}` })).concat(take({ id: 'note-2', isNote: true }))
    expect(earnedBadges(doc)).toContain('first-take')
    expect(earnedBadges(doc)).not.toContain('ten-takes')

    doc.piano.takes.push(take({ id: 't9' }))
    expect(earnedBadges(doc)).toContain('ten-takes')
  })

  it('hundred-minutes sums activeSec across real takes only, excluding notes', () => {
    const doc: ProgressDoc = defaultDoc()
    doc.piano.takes = [
      take({ id: 'a', activeSec: 59 * 60 }),
      take({ id: 'b', activeSec: 40 * 60 }),
      take({ id: 'note', isNote: true, activeSec: 60 * 60 }),
    ]
    expect(earnedBadges(doc)).not.toContain('hundred-minutes')

    doc.piano.takes.push(take({ id: 'c', activeSec: 60 }))
    expect(earnedBadges(doc)).toContain('hundred-minutes')
  })

  it('first-gold-stars fires on any day with parentStars 3', () => {
    const doc: ProgressDoc = defaultDoc()
    doc.piano.days = { '2026-09-05': { parentStars: 2 }, '2026-09-07': { parentStars: 3 } }
    expect(earnedBadges(doc)).toContain('first-gold-stars')
  })
})

describe('BADGES catalogue', () => {
  it('every earnedBadges id is on the catalogue and every catalogue entry has a title/emoji/how', () => {
    const catalogueIds = new Set(BADGES.map((b) => b.id))
    for (const b of BADGES) {
      expect(b.title.length).toBeGreaterThan(0)
      expect(b.emoji.length).toBeGreaterThan(0)
      expect(b.how.length).toBeGreaterThan(0)
    }
    expect(catalogueIds.size).toBe(BADGES.length)
  })
})

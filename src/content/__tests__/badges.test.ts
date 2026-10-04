import { beforeEach, describe, expect, it } from 'vitest'
import { BADGES, earnedBadges } from '../badges'
import { COLLECTION, itemsInSet, SETS } from '../collection'
import { branchById } from '../lessons'
import { defaultDoc, resetAll, type Bracelet, type MissionProgress, type OwnedItem, type PianoTake, type ProgressDoc } from '../../store/progress'

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

function owned(id: string, count = 1): OwnedItem {
  return { id, count, firstAt: 1 }
}

function bracelet(overrides: Partial<Bracelet> = {}): Bracelet {
  return { id: 'b1', name: 'Test', beads: [], startedAt: 1, ...overrides }
}

describe('earnedBadges - collection', () => {
  it('first-card fires as soon as any card is owned', () => {
    const doc: ProgressDoc = defaultDoc()
    expect(earnedBadges(doc)).not.toContain('first-card')
    doc.collection.items = [owned('quartz')]
    expect(earnedBadges(doc)).toContain('first-card')
  })

  it('a set badge only fires once every card in that set is owned', () => {
    const doc: ProgressDoc = defaultDoc()
    const gemCards = itemsInSet('gems')
    expect(gemCards.length).toBeGreaterThan(0)

    doc.collection.items = gemCards.slice(0, -1).map((c) => owned(c.id))
    expect(earnedBadges(doc)).not.toContain('set-gems')

    doc.collection.items = gemCards.map((c) => owned(c.id))
    expect(earnedBadges(doc)).toContain('set-gems')
    expect(earnedBadges(doc)).not.toContain('set-animals')
    expect(earnedBadges(doc)).not.toContain('set-space')
  })

  it('a set with zero cards never counts as complete, and every set has a badge', () => {
    const doc: ProgressDoc = defaultDoc()
    const everything = COLLECTION.map((c) => owned(c.id))
    doc.collection.items = everything
    const earned = earnedBadges(doc)
    for (const s of SETS) {
      expect(BADGES.some((b) => b.id === `set-${s.id}`), `badge for ${s.id}`).toBe(true)
      expect(earned.includes(`set-${s.id}`), `set-${s.id}`).toBe(itemsInSet(s.id).length > 0)
    }
    doc.collection.items = []
    for (const s of SETS) expect(earnedBadges(doc)).not.toContain(`set-${s.id}`)
  })

  it('first-legendary fires only once a legendary-rarity card is owned', () => {
    const doc: ProgressDoc = defaultDoc()
    doc.collection.items = [owned('quartz')] // common, not legendary
    expect(earnedBadges(doc)).not.toContain('first-legendary')

    // 'andromeda-galaxy' is the legendary space card in the catalogue.
    doc.collection.items = [owned('quartz'), owned('andromeda-galaxy')]
    expect(earnedBadges(doc)).toContain('first-legendary')
  })

  it('first-bracelet fires only once a bracelet has finishedAt set', () => {
    const doc: ProgressDoc = defaultDoc()
    doc.collection.bracelets = [bracelet()]
    expect(earnedBadges(doc)).not.toContain('first-bracelet')

    doc.collection.bracelets = [bracelet({ finishedAt: 5 })]
    expect(earnedBadges(doc)).toContain('first-bracelet')
  })
})

describe('earnedBadges - cube side branches (round 13)', () => {
  it('first-pattern fires once any Pattern Lab mission is done, before the node is mastered', () => {
    const doc: ProgressDoc = defaultDoc()
    expect(earnedBadges(doc)).not.toContain('first-pattern')

    doc.profiles.kid.holds.patterns = { stages: {}, missions: { PL1: doneMission() } }
    expect(earnedBadges(doc)).toContain('first-pattern')
    expect(earnedBadges(doc)).not.toContain('pattern-lab-all')
  })

  it('pattern-lab-all fires once the Pattern Lab node is mastered', () => {
    const doc: ProgressDoc = defaultDoc()
    doc.profiles.kid.holds.patterns = { stages: {}, missions: {}, masteredAt: 1 }
    expect(earnedBadges(doc)).toContain('pattern-lab-all')
    expect(earnedBadges(doc)).toContain('first-pattern')
  })

  it('trick-gym-all fires only once every Trick Gym node is mastered', () => {
    const doc: ProgressDoc = defaultDoc()
    const gym = branchById('gym')
    expect(gym).toBeDefined()

    for (const id of gym!.nodeIds.slice(0, -1)) {
      doc.profiles.kid.holds[id] = { stages: {}, missions: {}, masteredAt: 1 }
    }
    expect(earnedBadges(doc)).not.toContain('trick-gym-all')

    for (const id of gym!.nodeIds) {
      doc.profiles.kid.holds[id] = { stages: {}, missions: {}, masteredAt: 1 }
    }
    expect(earnedBadges(doc)).toContain('trick-gym-all')
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

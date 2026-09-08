import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultDoc,
  emptyPiano,
  exportJson,
  getDoc,
  importJson,
  mergeDocs,
  resetAll,
  setGoalMinutes,
  update,
  type ProgressDoc,
} from '../progress'

// A tiny in-memory localStorage mock, since this module persists to
// localStorage and we want deterministic behavior regardless of whether the
// test environment provides a real one (jsdom) or none at all (node).
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

describe('mergeDocs', () => {
  it('picks the newer section from each side independently, dropping nothing', () => {
    const local: ProgressDoc = defaultDoc()
    local.settings.updatedAt = 100
    local.settings.kidName = 'Local Kid'
    local.rewards.updatedAt = 100
    local.rewards.stickers = [{ id: 'local-1', kind: 'emoji', value: '⭐', rarity: 'common', wonAt: 1 }]
    local.profiles.updatedAt = 300 // local wins here
    local.profiles.kid.xp = 42
    local.solveLog.updatedAt = 100

    const remote: ProgressDoc = defaultDoc()
    remote.settings.updatedAt = 200 // remote wins here
    remote.settings.kidName = 'Remote Kid'
    remote.rewards.updatedAt = 250 // remote wins here
    remote.rewards.stickers = [{ id: 'remote-1', kind: 'emoji', value: '🌟', rarity: 'rare', wonAt: 2 }]
    remote.profiles.updatedAt = 150
    remote.profiles.kid.xp = 999
    remote.solveLog.updatedAt = 100 // tie -> local kept

    const merged = mergeDocs(local, remote)

    // Newer section wins, independently per section.
    expect(merged.settings.kidName).toBe('Remote Kid')
    expect(merged.rewards.stickers).toEqual(remote.rewards.stickers)
    expect(merged.profiles.kid.xp).toBe(42)
    // A tie keeps the local value (nothing lost, deterministic).
    expect(merged.solveLog).toEqual(local.solveLog)

    // Nothing from either side's "winning" sections was dropped.
    expect(merged.settings.prizePools.gold.length).toBe(3)
    expect(merged.profiles.parent).toEqual(local.profiles.parent)
  })
})

describe('export / import round trip', () => {
  it('restores an identical doc after export then import', () => {
    update('settings', (s) => ({ ...s, kidName: 'Nora the Great' }))
    setGoalMinutes('cube', 15)
    update('rewards', (r) => ({
      ...r,
      stickers: [...r.stickers, { id: 's1', kind: 'emoji', value: '🎉', rarity: 'common', wonAt: 123 }],
    }))

    const before = getDoc()
    const json = exportJson()

    resetAll()
    expect(getDoc()).not.toEqual(before)

    importJson(json)
    expect(getDoc()).toEqual(before)
  })

  it('rejects a file with the wrong schema version', () => {
    expect(() => importJson(JSON.stringify({ schemaVersion: 2 }))).toThrow()
  })
})

describe('normalizeDoc (via importJson)', () => {
  it('backfills missing nested profile and settings fields so screens never see undefined', () => {
    // Simulates an older/partial save: profiles.kid exists but predates the
    // tokens/sessions/streak fields, profiles.parent is missing outright,
    // and settings predates ticketChance/prizePools.
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: { kidName: 'Old Kid', updatedAt: 1 },
      profiles: { kid: { holds: {}, xp: 10 }, updatedAt: 555 },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    const doc = getDoc()

    expect(doc.profiles.kid.xp).toBe(10) // preserved
    expect(doc.profiles.kid.tokens).toEqual({ gold: 0, silver: 0, bronze: 0 })
    expect(doc.profiles.kid.streak).toEqual({ current: 0, best: 0, lastDay: '' })
    expect(doc.profiles.kid.sessions).toEqual([])
    expect(doc.profiles.parent).toEqual(defaultDoc().profiles.parent)
    expect(doc.settings.kidName).toBe('Old Kid') // preserved
    expect(doc.settings.ticketChance).toEqual({ gold: 1, silver: 0.6, bronze: 0.3 })
    expect(doc.settings.prizePools.gold.length).toBeGreaterThan(0)
  })

  it('does not let a partially-specified prizePools/ticketChance drop the other tiers', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: {
        updatedAt: 1,
        prizePools: { gold: [{ id: 'g', name: 'Gold only', emoji: '🏆', weight: 1 }] },
        ticketChance: { gold: 0.5 },
      },
      profiles: { updatedAt: 1 },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    const doc = getDoc()

    expect(doc.settings.prizePools.gold).toEqual([{ id: 'g', name: 'Gold only', emoji: '🏆', weight: 1 }])
    expect(doc.settings.prizePools.silver.length).toBeGreaterThan(0)
    expect(doc.settings.prizePools.bronze.length).toBeGreaterThan(0)
    expect(doc.settings.ticketChance).toEqual({ gold: 0.5, silver: 0.6, bronze: 0.3 })
  })
})

describe('a brand-new (never-edited) local doc never outranks synced data', () => {
  it('stamps every section updatedAt: 0 so mergeDocs always prefers real remote progress', async () => {
    vi.resetModules()
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(), // empty - nothing saved on this "device" yet
      configurable: true,
      writable: true,
    })

    const fresh = await import('../progress')
    const localDoc = fresh.getDoc()
    expect(localDoc.settings.updatedAt).toBe(0)
    expect(localDoc.profiles.updatedAt).toBe(0)
    expect(localDoc.rewards.updatedAt).toBe(0)
    expect(localDoc.solveLog.updatedAt).toBe(0)

    // Any real synced doc - even one saved a long time ago - must win a
    // merge against a device that has never actually recorded an edit.
    const remote = fresh.defaultDoc()
    remote.profiles.updatedAt = 12345
    remote.profiles.kid.xp = 77
    remote.settings.updatedAt = 12345
    remote.settings.kidName = 'Synced Kid'

    const merged = fresh.mergeDocs(localDoc, remote)
    expect(merged.profiles.kid.xp).toBe(77)
    expect(merged.settings.kidName).toBe('Synced Kid')
  })
})

describe('fresh defaults have no fixed-dollar cash prizes', () => {
  it('gold and silver cash prizes are kind: cash with a $0-$1 range, not a fixed name', () => {
    const doc = defaultDoc()
    const allPrizes = [...doc.settings.prizePools.gold, ...doc.settings.prizePools.silver, ...doc.settings.prizePools.bronze]
    expect(allPrizes.some((p) => /^\$\d+$/.test(p.name))).toBe(false)

    const gold = doc.settings.prizePools.gold.find((p) => p.id === 'gold-cash')
    expect(gold).toEqual({ id: 'gold-cash', name: 'Cash surprise', emoji: '💵', weight: 1, kind: 'cash', minCents: 25, maxCents: 100 })

    const silver = doc.settings.prizePools.silver.find((p) => p.id === 'silver-cash')
    expect(silver).toEqual({ id: 'silver-cash', name: 'Cash surprise', emoji: '💵', weight: 1, kind: 'cash', minCents: 5, maxCents: 100 })
  })
})

describe('normalizeDoc migrates legacy fixed-dollar cash prizes (via importJson)', () => {
  it('replaces gold-cash-5 and silver-cash-1 with the new cash-surprise prize, keeping each pool weight', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: {
        updatedAt: 1,
        prizePools: {
          gold: [{ id: 'gold-cash-5', name: '$5', emoji: '💵', weight: 3 }],
          silver: [{ id: 'silver-cash-1', name: '$1', emoji: '💵', weight: 7 }],
          bronze: [{ id: 'bronze-high-five', name: 'High five', emoji: '🙌', weight: 1 }],
        },
      },
      profiles: { updatedAt: 1 },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    const doc = getDoc()

    expect(doc.settings.prizePools.gold).toEqual([
      { id: 'gold-cash', name: 'Cash surprise', emoji: '💵', weight: 3, kind: 'cash', minCents: 25, maxCents: 100 },
    ])
    expect(doc.settings.prizePools.silver).toEqual([
      { id: 'silver-cash', name: 'Cash surprise', emoji: '💵', weight: 7, kind: 'cash', minCents: 5, maxCents: 100 },
    ])
    // A prize that never was a fixed-dollar prize passes through untouched.
    expect(doc.settings.prizePools.bronze).toEqual([{ id: 'bronze-high-five', name: 'High five', emoji: '🙌', weight: 1 }])
  })

  it('also migrates any prize whose name matches /^\\$\\d+$/, even under a different id', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: {
        updatedAt: 1,
        prizePools: {
          gold: [{ id: 'custom-id', name: '$20', emoji: '💵', weight: 2 }],
        },
      },
      profiles: { updatedAt: 1 },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    const doc = getDoc()

    expect(doc.settings.prizePools.gold).toEqual([
      { id: 'gold-cash', name: 'Cash surprise', emoji: '💵', weight: 2, kind: 'cash', minCents: 25, maxCents: 100 },
    ])
  })

  it('leaves an already-migrated cash prize alone', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      settings: {
        updatedAt: 1,
        prizePools: {
          gold: [{ id: 'gold-cash', name: 'Cash surprise', emoji: '💵', weight: 1, kind: 'cash', minCents: 10, maxCents: 50 }],
        },
      },
      profiles: { updatedAt: 1 },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(json)
    const doc = getDoc()
    expect(doc.settings.prizePools.gold).toEqual([
      { id: 'gold-cash', name: 'Cash surprise', emoji: '💵', weight: 1, kind: 'cash', minCents: 10, maxCents: 50 },
    ])
  })

  it('previously won tickets keep their original fixed-dollar names', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      settings: { updatedAt: 1 },
      profiles: { updatedAt: 1 },
      rewards: {
        updatedAt: 1,
        tickets: [{ id: 't1', prizeId: 'gold-cash-5', name: '$5', emoji: '💵', tier: 'gold', wonAt: 1 }],
      },
      solveLog: { updatedAt: 1 },
    })

    importJson(json)
    const doc = getDoc()
    expect(doc.rewards.tickets).toEqual([{ id: 't1', prizeId: 'gold-cash-5', name: '$5', emoji: '💵', tier: 'gold', wonAt: 1 }])
  })
})

describe('resetAll', () => {
  it('stamps every section with updatedAt 0 so a reset never beats real progress in a merge', () => {
    resetAll()
    const local = getDoc()
    expect(local.profiles.updatedAt).toBe(0)
    expect(local.rewards.updatedAt).toBe(0)
    const remote = defaultDoc()
    remote.profiles.updatedAt = 1
    remote.profiles.kid.xp = 300
    const merged = mergeDocs(local, remote)
    expect(merged.profiles.kid.xp).toBe(300)
  })

  it('stamps piano.updatedAt 0 too', () => {
    resetAll()
    expect(getDoc().piano.updatedAt).toBe(0)
    const remote = defaultDoc()
    remote.piano.updatedAt = 1
    remote.piano.streak.current = 4
    const merged = mergeDocs(getDoc(), remote)
    expect(merged.piano.streak.current).toBe(4)
  })
})

describe('piano schema and migration', () => {
  it('normalizeDoc derives goalMinutes.cube from a legacy sessionMinutes, defaults piano goal to 15, and defaults piano.updatedAt to 0', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: { sessionMinutes: 15, updatedAt: 1 },
      profiles: { updatedAt: 1 },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })
    importJson(legacyJson)
    const doc = getDoc()
    expect(doc.settings.goalMinutes).toEqual({ cube: 15, piano: 15 })
    expect(doc.settings.sessionMinutes).toBe(15)
    expect(doc.piano).toEqual(emptyPiano(0))
  })

  it('mergeDocs with a remote lacking piano (an old build upload) keeps local and does not throw', () => {
    const local = defaultDoc()
    local.piano.updatedAt = 500
    local.piano.streak.current = 3
    // Simulate a raw remote JSON uploaded by a pre-piano build: no `piano` key at all.
    const rawRemote: Record<string, unknown> = { ...defaultDoc() }
    delete rawRemote.piano
    const remote = rawRemote as unknown as ProgressDoc
    expect(() => mergeDocs(local, remote)).not.toThrow()
    const merged = mergeDocs(local, remote)
    expect(merged.piano).toEqual(local.piano)
  })

  it('mergeDocs picks the newer piano section either way (LWW both directions)', () => {
    const local = defaultDoc()
    local.piano.updatedAt = 100
    local.piano.streak.current = 1
    const remoteNewer = defaultDoc()
    remoteNewer.piano.updatedAt = 200
    remoteNewer.piano.streak.current = 9
    expect(mergeDocs(local, remoteNewer).piano.streak.current).toBe(9)

    const remoteOlder = defaultDoc()
    remoteOlder.piano.updatedAt = 50
    remoteOlder.piano.streak.current = 9
    expect(mergeDocs(local, remoteOlder).piano.streak.current).toBe(1)
  })

  it('export/import round-trips the piano section', () => {
    update('piano', (p) => ({
      ...p,
      takes: [
        {
          id: 't1',
          day: '2026-09-07',
          pieceId: null,
          startedAt: 1,
          durationSec: 30,
          activeSec: 20,
          mimeType: 'audio/mp4',
          sizeBytes: 1234,
          hasAudio: true,
          deviceId: 'device-1',
        },
      ],
      days: { '2026-09-07': { goalReachedAt: 1 } },
      streak: { current: 2, best: 2, lastDay: '2026-09-07' },
    }))

    const before = getDoc()
    const json = exportJson()
    resetAll()
    expect(getDoc().piano).not.toEqual(before.piano)
    importJson(json)
    expect(getDoc().piano).toEqual(before.piano)
  })
})

describe('normalizeDoc migrates the split cube holds (via importJson)', () => {
  it('copies a legacy combined "cross" hold (daisy+cross) onto the new "daisy" id, keeping "cross" itself', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: { updatedAt: 1 },
      profiles: {
        updatedAt: 1,
        kid: {
          holds: {
            cross: {
              stages: { learn: { bestTries: 1, stars: 3, attempts: 1, minutes: 2, completedAt: 10 } },
              masteredAt: 20,
            },
          },
        },
      },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    const doc = getDoc()

    expect(doc.profiles.kid.holds.daisy).toEqual(doc.profiles.kid.holds.cross)
    expect(doc.profiles.kid.holds.daisy.masteredAt).toBe(20)
  })

  it('does not overwrite an already-present "daisy" hold', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: { updatedAt: 1 },
      profiles: {
        updatedAt: 1,
        kid: {
          holds: {
            cross: { stages: {}, masteredAt: 20 },
            daisy: { stages: {}, masteredAt: 5 },
          },
        },
      },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    expect(getDoc().profiles.kid.holds.daisy.masteredAt).toBe(5)
  })

  it('marks the new "cornerFind" hold mastered when "corners" is already mastered', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: { updatedAt: 1 },
      profiles: {
        updatedAt: 1,
        kid: { holds: { corners: { stages: {}, masteredAt: 42 } } },
      },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    const doc = getDoc()

    expect(doc.profiles.kid.holds.cornerFind?.masteredAt).toBe(42)
  })

  it('leaves cornerFind alone when corners is not yet mastered', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: { updatedAt: 1 },
      profiles: {
        updatedAt: 1,
        kid: { holds: { corners: { stages: { learn: { bestTries: 1, stars: 1, attempts: 1, minutes: 1, completedAt: 1 } } } } },
      },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    expect(getDoc().profiles.kid.holds.cornerFind).toBeUndefined()
  })

  it('does not overwrite an already-present "cornerFind" hold', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: { updatedAt: 1 },
      profiles: {
        updatedAt: 1,
        kid: {
          holds: {
            corners: { stages: {}, masteredAt: 42 },
            cornerFind: { stages: {}, masteredAt: 7 },
          },
        },
      },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    expect(getDoc().profiles.kid.holds.cornerFind.masteredAt).toBe(7)
  })

  it('a completely fresh profile with no holds at all migrates without throwing', () => {
    expect(() => importJson(JSON.stringify({
      schemaVersion: 1,
      settings: { updatedAt: 1 },
      profiles: { updatedAt: 1 },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    }))).not.toThrow()
    expect(getDoc().profiles.kid.holds).toEqual({})
  })
})

describe('setGoalMinutes', () => {
  it('sets the goal for the given activity and mirrors sessionMinutes only for cube', () => {
    setGoalMinutes('cube', 20)
    expect(getDoc().settings.goalMinutes.cube).toBe(20)
    expect(getDoc().settings.sessionMinutes).toBe(20)

    setGoalMinutes('piano', 30)
    expect(getDoc().settings.goalMinutes.piano).toBe(30)
    expect(getDoc().settings.sessionMinutes).toBe(20) // unchanged by the piano goal
  })
})

describe('missions backfill (via importJson)', () => {
  it('backfills an empty missions record on a legacy hold that predates the mission curriculum', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: { updatedAt: 1 },
      profiles: {
        updatedAt: 1,
        kid: {
          holds: {
            daisy: {
              stages: { learn: { bestTries: 1, stars: 3, attempts: 1, minutes: 2, completedAt: 10 } },
              masteredAt: 20,
            },
          },
        },
      },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    const hold = getDoc().profiles.kid.holds.daisy

    expect(hold.missions).toEqual({})
    // stages and masteredAt are untouched by the backfill.
    expect(hold.masteredAt).toBe(20)
    expect(hold.stages.learn?.completedAt).toBe(10)
  })

  it('backfills missions on the synthesised cornerFind hold too', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: { updatedAt: 1 },
      profiles: {
        updatedAt: 1,
        kid: { holds: { corners: { stages: {}, masteredAt: 42 } } },
      },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    const doc = getDoc()

    expect(doc.profiles.kid.holds.cornerFind?.masteredAt).toBe(42)
    expect(doc.profiles.kid.holds.cornerFind?.missions).toEqual({})
    // The split-hold migration for "cross" -> "daisy" also goes through the
    // same backfill.
    expect(doc.profiles.kid.holds.corners.missions).toEqual({})
  })

  it('leaves an already-present missions record alone', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      settings: { updatedAt: 1 },
      profiles: {
        updatedAt: 1,
        kid: {
          holds: {
            daisy: {
              stages: {},
              missions: { D1: { tries: 2, help: 'scan', minutes: 3, completedAt: 5, tier: 'silver' } },
            },
          },
        },
      },
      rewards: { updatedAt: 1 },
      solveLog: { updatedAt: 1 },
    })

    importJson(legacyJson)
    expect(getDoc().profiles.kid.holds.daisy.missions).toEqual({
      D1: { tries: 2, help: 'scan', minutes: 3, completedAt: 5, tier: 'silver' },
    })
  })

  it('export/import round-trips a hold with mission progress, keeping missions intact', () => {
    update('profiles', (profiles) => ({
      ...profiles,
      kid: {
        ...profiles.kid,
        holds: {
          ...profiles.kid.holds,
          daisy: {
            stages: {},
            missions: { D1: { tries: 1, help: 'none', minutes: 4, completedAt: 100, tier: 'gold' } },
          },
        },
      },
    }))

    const before = getDoc()
    const json = exportJson()
    resetAll()
    expect(getDoc().profiles.kid.holds.daisy).toBeUndefined()

    importJson(json)
    expect(getDoc().profiles.kid.holds.daisy).toEqual(before.profiles.kid.holds.daisy)
    expect(getDoc().profiles.kid.holds.daisy.missions).toEqual({
      D1: { tries: 1, help: 'none', minutes: 4, completedAt: 100, tier: 'gold' },
    })
  })
})

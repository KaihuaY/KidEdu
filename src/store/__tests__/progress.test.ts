import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultDoc,
  exportJson,
  getDoc,
  importJson,
  mergeDocs,
  resetAll,
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
    update('settings', (s) => ({ ...s, kidName: 'Nora the Great', sessionMinutes: 15 }))
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

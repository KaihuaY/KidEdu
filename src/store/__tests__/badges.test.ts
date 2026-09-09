import { beforeEach, describe, expect, it } from 'vitest'
import { awardNewBadges, dismissBadgeToast } from '../badges'
import { getDoc, resetAll, update, type MissionProgress } from '../progress'

// Same in-memory localStorage mock used by progress.test.ts.
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

describe('awardNewBadges', () => {
  it('appends only newly-earned ids, stamped with earnedAt, and never awards the same badge twice', () => {
    update('profiles', (profiles) => ({
      ...profiles,
      kid: { ...profiles.kid, holds: { ...profiles.kid.holds, daisy: { stages: {}, missions: { D4: doneMission() } } } },
    }))

    const firstRound = awardNewBadges()
    expect(firstRound).toEqual(['first-daisy'])
    const stored = getDoc().rewards.badges ?? []
    expect(stored.map((b) => b.id)).toEqual(['first-daisy'])
    expect(stored[0].earnedAt).toBeGreaterThan(0)

    // Calling again with nothing new earned is a no-op - no doc write, no duplicate.
    const beforeUpdatedAt = getDoc().rewards.updatedAt
    expect(awardNewBadges()).toEqual([])
    expect(getDoc().rewards.badges?.length).toBe(1)
    expect(getDoc().rewards.updatedAt).toBe(beforeUpdatedAt)

    update('profiles', (profiles) => ({
      ...profiles,
      kid: { ...profiles.kid, holds: { ...profiles.kid.holds, cross: { stages: {}, missions: { C3: doneMission() } } } },
    }))
    expect(awardNewBadges()).toEqual(['first-cross'])
    expect(
      getDoc()
        .rewards.badges?.map((b) => b.id)
        .sort(),
    ).toEqual(['first-cross', 'first-daisy'])
  })
})

describe('dismissBadgeToast', () => {
  // useBadgeAwards() is what actually pushes toasts, from a mounted
  // component - this file has no React runtime, so this just checks the
  // queue's own mutator never throws on an id it doesn't have queued.
  it('is a safe no-op for an id that is not queued', () => {
    expect(() => dismissBadgeToast('not-queued')).not.toThrow()
  })
})

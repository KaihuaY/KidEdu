// The 2026-10-14/15 losses, pinned down. Nora's progress doc reached ~1 MB and
// one pretty backup of it ~1.8 MB, past Safari's ~2.6 M-character storage
// budget, so saving the doc began failing silently. Her iPad reloaded an old
// saved copy while its remembered merge base still described newer data, so
// the old sections looked like local edits and were pushed over the gist:
// 18 boxes, 17 cards, 9 tickets, 2 bracelets and 60 XP went missing.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultDoc, mergeBaseOf, mergeDocs, rebaseOnStaleLoad, type ProgressDoc } from '../progress'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  /** Characters allowed in total (keys + values); setItem past it throws like Safari. */
  quota = Infinity
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
    let used = 0
    for (const [k, v] of this.map) if (k !== key) used += k.length + v.length
    if (used + key.length + value.length > this.quota) throw new DOMException('quota', 'QuotaExceededError')
    this.map.set(key, value)
  }
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
  vi.resetModules()
})

function docAt(stamp: number, xp: number, boxes: number): ProgressDoc {
  const d = defaultDoc()
  for (const key of ['settings', 'profiles', 'rewards', 'solveLog', 'piano', 'notes', 'collection', 'teacherNotes'] as const) {
    ;(d[key] as { updatedAt: number }).updatedAt = stamp
  }
  d.profiles.kid.xp = xp
  d.rewards.boxHistory = Array.from({ length: boxes }, (_, i) => ({ tier: 'gold' as const, openedAt: i + 1, result: `Box ${i + 1}` }))
  return d
}

describe('rebaseOnStaleLoad: an old saved copy reloaded after a failed save', () => {
  it('lets the newer gist win every section the old copy is behind on', () => {
    const synced = docAt(2_000, 830, 77) // what this iPad last synced
    const loaded = docAt(1_000, 750, 59) // what it found in storage after the reload
    const remote = docAt(2_000, 830, 77) // the gist, unchanged since
    const base = rebaseOnStaleLoad(mergeBaseOf(synced), mergeBaseOf(loaded))
    const merged = mergeDocs(loaded, remote, base)
    expect(merged.rewards.boxHistory).toHaveLength(77)
    expect(merged.profiles.kid.xp).toBe(830)
  })

  it('without the rebase the old copy would have won - the bug it fixes', () => {
    const synced = docAt(2_000, 830, 77)
    const loaded = docAt(1_000, 750, 59)
    const remote = docAt(2_000, 830, 77)
    // the strict three-way rule alone already refuses the stale sections...
    expect(mergeDocs(loaded, remote, mergeBaseOf(synced)).rewards.boxHistory).toHaveLength(77)
    // ...but an edit on top of the old copy (today's plan) made its profile look changed:
    const edited = docAt(1_000, 750, 59)
    edited.profiles = { ...edited.profiles, kid: { ...edited.profiles.kid, cubeDay: { day: '2026-10-13' } }, updatedAt: 3_000 }
    expect(mergeDocs(edited, remote, mergeBaseOf(synced)).profiles.kid.xp).toBe(750)
    // with the rebase, XP comes from the gist and today's plan is kept (the 2026-10-13 case)
    const rebased = rebaseOnStaleLoad(mergeBaseOf(synced), mergeBaseOf(loaded))
    const merged = mergeDocs(edited, remote, rebased)
    expect(merged.profiles.kid.xp).toBe(830)
    expect(merged.profiles.kid.cubeDay?.day).toBe('2026-10-13')
  })

  it('changes nothing when the saved copy is current', () => {
    const base = mergeBaseOf(docAt(2_000, 830, 77))
    expect(rebaseOnStaleLoad(base, mergeBaseOf(docAt(2_000, 830, 77)))).toBe(base)
    expect(rebaseOnStaleLoad(base, undefined)).toBe(base)
    expect(rebaseOnStaleLoad(undefined, base)).toBeUndefined()
  })
})

describe('section stamps only move forward', () => {
  it('an edit right after pulling a section stamped by a faster clock is still newer than it', async () => {
    const progress = await import('../progress')
    const future = Date.now() + 60_000 // another iPad's clock runs a minute ahead
    progress.importJson(JSON.stringify(docAt(future, 10, 1)))
    progress.update('rewards', (r) => ({ ...r, tickets: [] }))
    expect(progress.getDoc().rewards.updatedAt).toBeGreaterThan(future)
  })

  it('a no-op update keeps the stamp', async () => {
    const progress = await import('../progress')
    progress.importJson(JSON.stringify(docAt(5_000, 10, 1)))
    progress.update('rewards', (r) => r)
    expect(progress.getDoc().rewards.updatedAt).toBe(5_000)
  })

  it("a grown-up's restore or import counts as a fresh change, so the next sync keeps it", async () => {
    const progress = await import('../progress')
    progress.importJson(JSON.stringify(docAt(9_000, 830, 77)))
    const base = progress.mergeBaseOf(progress.getDoc())
    progress.importJson(JSON.stringify(docAt(1_000, 500, 3)), { asEdit: true })
    const restored = progress.getDoc()
    expect(restored.rewards.updatedAt).toBeGreaterThan(9_000)
    const merged = progress.mergeDocs(restored, docAt(9_000, 830, 77), base)
    expect(merged.rewards.boxHistory).toHaveLength(3)
    expect(merged.profiles.kid.xp).toBe(500)
  })
})

describe('saving when storage is full', () => {
  it('frees the space old in-localStorage backups took, then saves', async () => {
    const big = 'x'.repeat(5_000)
    storage.setItem('cubeclimb.progress.backups', JSON.stringify([{ savedAt: 1, buildId: 'old', json: big }]))
    storage.quota = 6_000
    const progress = await import('../progress')
    progress.update('rewards', (r) => ({ ...r, tickets: [{ id: 't', prizeId: 'p', name: 'Treat', emoji: '🍪', tier: 'gold', wonAt: 1 }] }))
    expect(JSON.parse(storage.getItem('cubeclimb.progress')!).rewards.tickets).toHaveLength(1)
    expect(progress.hasSaveProblem()).toBe(false)
  })

  it('flags the problem (and clears it once saving works again) instead of failing silently', async () => {
    const progress = await import('../progress')
    storage.quota = 100
    progress.update('rewards', (r) => ({ ...r, tickets: [{ id: 't', prizeId: 'p', name: 'Treat', emoji: '🍪', tier: 'gold', wonAt: 1 }] }))
    expect(progress.hasSaveProblem()).toBe(true)
    storage.quota = Infinity
    progress.update('rewards', (r) => ({ ...r, tickets: [] }))
    expect(progress.hasSaveProblem()).toBe(false)
  })

  it('captures what was loaded once, for the first merge only', async () => {
    storage.setItem('cubeclimb.progress', JSON.stringify(docAt(1_000, 750, 59)))
    const progress = await import('../progress')
    const loaded = progress.consumeLoadedBase()
    expect(loaded?.sections.rewards).toBe(1_000)
    expect(loaded?.profiles?.kid.xp).toBe(750)
    expect(progress.consumeLoadedBase()).toBeUndefined()
  })
})

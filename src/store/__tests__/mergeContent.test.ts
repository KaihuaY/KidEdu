// The 2026-10-11 accident, pinned down: a fresh copy of the app synced first
// and stamped EMPTY sections with "now"; the kid's real iPad then merged and
// lost weeks of takes and XP to those empty sections. These tests make sure
// a never-used section can never outrank real content, and that takes are
// unioned rather than replaced.
import { describe, expect, it } from 'vitest'
import { defaultDoc, mergeDocs, type PianoTake, type ProgressDoc } from '../progress'

function take(id: string, day: string, startedAt: number): PianoTake {
  return { id, day, pieceId: null, startedAt, durationSec: 120, activeSec: 100, mimeType: 'audio/mp4', sizeBytes: 1, hasAudio: true, deviceId: 'ipad' }
}

/** Weeks of real use, with timestamps from a few days ago. */
function realDoc(stamp = 1_000_000): ProgressDoc {
  const d = defaultDoc()
  d.piano = { ...d.piano, takes: [take('t1', '2026-10-01', stamp - 50_000), take('t2', '2026-10-02', stamp - 40_000), take('t3', '2026-10-03', stamp - 30_000)], days: { '2026-10-01': { goalReachedAt: 1 }, '2026-10-03': { goalReachedAt: 2 } }, streak: { current: 2, best: 3, lastDay: '2026-10-03' }, journal: [{ id: 'j1', day: '2026-10-02', at: stamp - 35_000, text: 'fun' }], updatedAt: stamp }
  d.profiles = { ...d.profiles, kid: { ...d.profiles.kid, xp: 120, tokens: { gold: 1, silver: 0, bronze: 2 } }, updatedAt: stamp }
  d.rewards = { ...d.rewards, boxHistory: [{ tier: 'gold', openedAt: stamp, result: 'Comet' }], updatedAt: stamp }
  d.collection = { ...d.collection, items: [{ id: 'comet', count: 1, firstAt: stamp }], updatedAt: stamp }
  d.settings = { ...d.settings, pianoPieces: [{ id: 'p1', name: 'Twinkle', emoji: '⭐' }], updatedAt: stamp }
  return d
}

/** A fresh install that has been opened and poked at, so its empty sections carry NEWER timestamps. */
function freshDoc(stamp = 2_000_000): ProgressDoc {
  const d = defaultDoc()
  for (const key of ['settings', 'profiles', 'rewards', 'solveLog', 'piano', 'notes', 'collection', 'teacherNotes'] as const) {
    ;(d[key] as { updatedAt: number }).updatedAt = stamp
  }
  return d
}

describe('a never-used section never outranks real content', () => {
  it('real iPad merging a newer-but-empty remote keeps every take, the XP, the cards (the Amelia case)', () => {
    const merged = mergeDocs(realDoc(), freshDoc())
    expect(merged.piano.takes.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(merged.piano.streak).toEqual({ current: 2, best: 3, lastDay: '2026-10-03' })
    expect(merged.profiles.kid.xp).toBe(120)
    expect(merged.rewards.boxHistory).toHaveLength(1)
    expect(merged.collection.items).toHaveLength(1)
    expect(merged.settings.pianoPieces).toHaveLength(1)
  })

  it('the fresh copy merging the real remote adopts it entirely, even though its own sections are newer', () => {
    const merged = mergeDocs(freshDoc(), realDoc())
    expect(merged.piano.takes).toHaveLength(3)
    expect(merged.profiles.kid.xp).toBe(120)
    expect(merged.rewards.boxHistory).toHaveLength(1)
  })

  it('two pristine sides still follow newer-wins; two used sides still follow newer-wins', () => {
    const a = freshDoc(1), b = freshDoc(2)
    expect(mergeDocs(a, b).profiles.updatedAt).toBe(2)
    const r1 = realDoc(1_000), r2 = realDoc(2_000)
    r2.profiles.kid.xp = 999
    expect(mergeDocs(r1, r2).profiles.kid.xp).toBe(999)
    expect(mergeDocs(r2, r1).profiles.kid.xp).toBe(999)
  })
})

describe('piano merges by union', () => {
  it('takes recorded on two devices both survive, ordered by start time, and days/journal are unioned', () => {
    const a = realDoc(1_000_000)
    const b = realDoc(3_000_000)
    b.piano = { ...b.piano, takes: [take('t1', '2026-10-01', 950_000), take('t9', '2026-10-05', 2_900_000)], days: { '2026-10-05': { goalReachedAt: 5 } }, journal: [{ id: 'j2', day: '2026-10-05', at: 2_950_000, text: 'yay' }] }
    const merged = mergeDocs(a, b)
    expect(merged.piano.takes.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't9'])
    expect(Object.keys(merged.piano.days).sort()).toEqual(['2026-10-01', '2026-10-03', '2026-10-05'])
    expect(merged.piano.journal?.map((j) => j.id)).toEqual(['j1', 'j2'])
    // the newer side is the base: its copy of a shared take wins
    expect(merged.piano.takes[0].startedAt).toBe(950_000)
  })

  it('a stale device with fewer takes cannot delete the others', () => {
    const full = realDoc(1_000_000)
    const stale = realDoc(5_000_000)
    stale.piano = { ...stale.piano, takes: [take('t1', '2026-10-01', 950_000)] }
    expect(mergeDocs(full, stale).piano.takes).toHaveLength(3)
    expect(mergeDocs(stale, full).piano.takes).toHaveLength(3)
  })

  it('returns the base section object untouched when nothing needs adding', () => {
    const a = realDoc(1_000_000)
    const b = realDoc(500_000)
    expect(mergeDocs(a, b).piano).toBe(a.piano)
  })
})

// Three-way merge with a base (what this device last synced).
describe('three-way merge with a remembered base', () => {
  it("the 19:15 XP race: a laptop that only added one token must not drag the iPad's XP back", async () => {
    const { mergeBaseOf } = await import('../progress')
    // what the laptop last synced
    const synced = realDoc(1_000_000)
    synced.profiles.kid.xp = 750
    synced.profiles.kid.tokens = { gold: 3, silver: 2, bronze: 1 }
    const base = mergeBaseOf(synced)
    // the iPad since then: earned a mark → xp 830 (tokens 3 → the mark's gold already counted), newer streak
    const remote = realDoc(1_000_000)
    remote.profiles = { ...synced.profiles, kid: { ...synced.profiles.kid, xp: 830, streak: { current: 5, best: 5, lastDay: '2026-10-10' } }, updatedAt: 1_500_000 }
    // the laptop: grown-up added one gold on its stale copy, a bit later
    const local = realDoc(1_000_000)
    local.profiles = { ...synced.profiles, kid: { ...synced.profiles.kid, tokens: { gold: 4, silver: 2, bronze: 1 } }, updatedAt: 1_600_000 }
    const merged = mergeDocs(local, remote, base)
    expect(merged.profiles.kid.xp).toBe(830)
    expect(merged.profiles.kid.tokens).toEqual({ gold: 4, silver: 2, bronze: 1 })
    expect(merged.profiles.kid.streak).toEqual({ current: 5, best: 5, lastDay: '2026-10-10' })
    expect(merged.profiles.updatedAt).toBe(1_600_000)
  })

  it('a section unchanged here since the last sync takes the remote copy even if its own stamp is newer', async () => {
    const { mergeBaseOf } = await import('../progress')
    const synced = realDoc(1_000_000)
    const base = mergeBaseOf(synced)
    const local = realDoc(1_000_000) // rewards untouched since sync
    const remote = realDoc(900_000) // older stamp, but changed remotely: one more box
    remote.rewards = { ...remote.rewards, boxHistory: [...remote.rewards.boxHistory, { tier: 'bronze', openedAt: 5, result: 'Fox' }], updatedAt: 900_000 }
    const merged = mergeDocs(local, remote, base)
    expect(merged.rewards.boxHistory).toHaveLength(2)
  })

  it('a field changed on both sides takes the newer section; without a base the content rules apply', async () => {
    const { mergeBaseOf } = await import('../progress')
    const synced = realDoc(1_000_000)
    const base = mergeBaseOf(synced)
    const a = realDoc(1_000_000)
    a.profiles = { ...a.profiles, kid: { ...a.profiles.kid, xp: 200 }, updatedAt: 1_200_000 }
    const b = realDoc(1_000_000)
    b.profiles = { ...b.profiles, kid: { ...b.profiles.kid, xp: 300 }, updatedAt: 1_300_000 }
    expect(mergeDocs(a, b, base).profiles.kid.xp).toBe(300)
    expect(mergeDocs(b, a, base).profiles.kid.xp).toBe(300)
    expect(mergeDocs(a, b).profiles.kid.xp).toBe(300)
  })

  it('piano is still unioned under a base: a take recorded here survives even when only the remote changed', async () => {
    const { mergeBaseOf } = await import('../progress')
    const synced = realDoc(1_000_000)
    const base = mergeBaseOf(synced)
    const local = realDoc(1_000_000)
    local.piano = { ...local.piano, takes: [...local.piano.takes, take('t4', '2026-10-04', 1_000_500)] } // same stamp (edge), new take
    const remote = realDoc(1_000_000)
    remote.piano = { ...remote.piano, takes: [...remote.piano.takes, take('t5', '2026-10-05', 1_100_000)], updatedAt: 1_100_000 }
    const ids = mergeDocs(local, remote, base).piano.takes.map((t) => t.id)
    expect(ids).toEqual(['t1', 't2', 't3', 't4', 't5'])
  })
})

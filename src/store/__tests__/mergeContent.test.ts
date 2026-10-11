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

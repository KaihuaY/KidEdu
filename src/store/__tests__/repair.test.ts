import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDoc, resetAll, update } from '../progress'
import { getRecordingStore } from '../recordings'
import { rebuildTakesFromRecordings, takeFromRecording } from '../repair'
import { clearKid } from '../kid'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() { return this.map.size }
  clear() { this.map.clear() }
  getItem(k: string) { return this.map.get(k) ?? null }
  key(i: number) { return [...this.map.keys()][i] ?? null }
  removeItem(k: string) { this.map.delete(k) }
  setItem(k: string, v: string) { this.map.set(k, v) }
}

beforeEach(async () => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  clearKid()
  resetAll()
  await getRecordingStore().clear()
})

describe('takeFromRecording', () => {
  it('derives the day from when the audio was saved and never produces a zero-length take', () => {
    const t = takeFromRecording({ id: 'r1', savedAt: Date.UTC(2026, 9, 5, 12), sizeBytes: 100, mimeType: 'audio/mp4' }, 0, 'dev')
    expect(t.id).toBe('r1')
    expect(t.durationSec).toBe(1)
    expect(t.hasAudio).toBe(true)
    expect(t.day).toMatch(/^2026-10-0[45]$/)
  })
})

describe('rebuildTakesFromRecordings', () => {
  it('adds a take for every stored recording the doc lacks, re-stamps full days, recomputes the streak, and backs up first', async () => {
    const store = getRecordingStore()
    const blob = new Blob([new Uint8Array(1000)], { type: 'audio/mp4' })
    const day = (n: number) => Date.UTC(2026, 9, n, 15)
    await store.put('a', blob, day(1))
    await store.put('b', blob, day(2))
    await store.put('c', blob, day(2))
    // one take is still known - it must not be duplicated
    update('piano', (p) => ({ ...p, takes: [{ id: 'c', day: '2026-10-02', pieceId: null, startedAt: day(2), durationSec: 300, activeSec: 300, mimeType: 'audio/mp4', sizeBytes: 1000, hasAudio: true, deviceId: 'x' }] }))
    const result = await rebuildTakesFromRecordings(async () => 700) // each recording measures 700 s
    expect(result.added).toBe(2)
    const takes = getDoc().piano.takes
    expect(takes.map((t) => t.id).sort()).toEqual(['a', 'b', 'c'])
    // 2026-10-02 now has 700 + 300 s ≥ the default 15-minute ring; 2026-10-01 has 700 s → not reached
    const days = getDoc().piano.days
    expect(Boolean(days['2026-10-02']?.goalReachedAt)).toBe(true)
    expect(Boolean(days['2026-10-01']?.goalReachedAt)).toBe(false)
    expect(result.daysRestamped).toBe(1)
    expect(getDoc().piano.streak.current).toBeGreaterThanOrEqual(1)
    // a backup was saved before touching the doc
    const backups = JSON.parse(localStorage.getItem('cubeclimb.progress.backups') ?? '[]') as { buildId: string }[]
    expect(backups.some((b) => /before rebuild/.test(b.buildId))).toBe(true)
  })

  it('is a no-op when every recording is already listed', async () => {
    const result = await rebuildTakesFromRecordings(async () => 100)
    expect(result.added).toBe(0)
    expect(localStorage.getItem('cubeclimb.progress.backups')).toBeNull()
  })
})

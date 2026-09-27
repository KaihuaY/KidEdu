import { beforeEach, describe, expect, it } from 'vitest'
import { claimTomorrowFirstApply, setTomorrowFirst, tomorrowFirstFor } from '../tomorrowFirst'
import { getDoc, resetAll, update, type PianoPiece } from '../progress'
import { clearKid, kidKey, setKid } from '../kid'

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

function piece(id: string, overrides: Partial<PianoPiece> = {}): PianoPiece {
  return { id, name: `Song ${id}`, emoji: '🎵', ...overrides }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
  resetAll()
  clearKid()
  update('settings', (s) => ({ ...s, pianoPieces: [piece('p1'), piece('p2'), piece('archived-1', { status: 'archived' })] }))
})

describe('setTomorrowFirst / tomorrowFirstFor', () => {
  it('sets and reads back the choice for the matching day', () => {
    setTomorrowFirst('p1', '2026-09-27')
    const found = tomorrowFirstFor(getDoc(), '2026-09-27')
    expect(found?.id).toBe('p1')
  })

  it('ignores a stale forDay', () => {
    setTomorrowFirst('p1', '2026-09-27')
    expect(tomorrowFirstFor(getDoc(), '2026-09-28')).toBeUndefined()
  })

  it('ignores a piece id that no longer exists', () => {
    setTomorrowFirst('does-not-exist', '2026-09-27')
    expect(tomorrowFirstFor(getDoc(), '2026-09-27')).toBeUndefined()
  })

  it('ignores an archived piece', () => {
    setTomorrowFirst('archived-1', '2026-09-27')
    expect(tomorrowFirstFor(getDoc(), '2026-09-27')).toBeUndefined()
  })

  it('is a no-op (does not bump updatedAt) when re-set to the same pieceId+forDay', () => {
    setTomorrowFirst('p1', '2026-09-27')
    const before = getDoc().piano.updatedAt
    setTomorrowFirst('p1', '2026-09-27')
    expect(getDoc().piano.updatedAt).toBe(before)
  })

  it('overwrites a previous choice for a different piece', () => {
    setTomorrowFirst('p1', '2026-09-27')
    setTomorrowFirst('p2', '2026-09-27')
    expect(tomorrowFirstFor(getDoc(), '2026-09-27')?.id).toBe('p2')
  })
})

describe('claimTomorrowFirstApply', () => {
  it('is true once per local day, then false, then true again for a new day', () => {
    expect(claimTomorrowFirstApply('2026-09-27')).toBe(true)
    expect(claimTomorrowFirstApply('2026-09-27')).toBe(false)
    expect(claimTomorrowFirstApply('2026-09-27')).toBe(false)
    expect(claimTomorrowFirstApply('2026-09-28')).toBe(true)
  })

  it('uses a per-kid storage key', () => {
    expect(claimTomorrowFirstApply('2026-09-27')).toBe(true)
    expect(localStorage.getItem(kidKey('cubeclimb.piano.firstSongApplied'))).toBe('2026-09-27')

    setKid('amelia')
    expect(claimTomorrowFirstApply('2026-09-27')).toBe(true)
    expect(localStorage.getItem(kidKey('cubeclimb.piano.firstSongApplied', 'amelia'))).toBe('2026-09-27')
    // Nora's own key is untouched by Amelia's claim.
    expect(localStorage.getItem(kidKey('cubeclimb.piano.firstSongApplied', 'nora'))).toBe('2026-09-27')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { claimTomorrowFirstApply, setTomorrowFirst, tomorrowChoices, tomorrowFirstFor } from '../tomorrowFirst'
import { getDoc, resetAll, update, type PianoPiece, type PianoTake } from '../progress'
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

describe('tomorrowChoices', () => {
  const TODAY = '2026-10-03'
  const list = Array.from({ length: 12 }, (_, i) => piece(`p${i + 1}`, { order: i + 1 }))

  function take(pieceId: string, day: string, extra: Partial<PianoTake> = {}): PianoTake {
    return {
      id: `${pieceId}-${day}-${Math.random()}`,
      day,
      pieceId,
      startedAt: 0,
      durationSec: 60,
      activeSec: 60,
      mimeType: 'audio/webm',
      sizeBytes: 1,
      hasAudio: false,
      deviceId: 'd',
      ...extra,
    }
  }

  it('puts the most-played pieces of the last 14 days first', () => {
    const takes = [take('p9', TODAY), take('p9', TODAY), take('p9', TODAY), take('p5', TODAY), take('p5', '2026-09-30')]
    const { top } = tomorrowChoices(list, takes, TODAY, undefined)
    expect(top.slice(0, 2).map((p) => p.id)).toEqual(['p9', 'p5'])
  })

  it('ignores notes and takes older than 14 days, then fills from week order', () => {
    const takes = [take('p9', '2026-09-19'), take('p9', '2026-09-19'), take('p8', TODAY, { isNote: true }), take('p3', TODAY)]
    const { top } = tomorrowChoices(list, takes, TODAY, undefined)
    expect(top.map((p) => p.id)).toEqual(['p3', 'p1', 'p2', 'p4', 'p5', 'p6', 'p7', 'p8'])
  })

  it('respects the limit and puts the rest under more', () => {
    const { top, more } = tomorrowChoices(list, [], TODAY, undefined, 8)
    expect(top).toHaveLength(8)
    expect(more.map((p) => p.id)).toEqual(['p9', 'p10', 'p11', 'p12'])
  })

  it('always includes the chosen piece, swapping out the last one', () => {
    const { top, more } = tomorrowChoices(list, [], TODAY, 'p11')
    expect(top).toHaveLength(8)
    expect(top[7].id).toBe('p11')
    expect(more.map((p) => p.id)).toContain('p8')
    expect(more.map((p) => p.id)).not.toContain('p11')
  })

  it('never offers archived pieces, even when chosen or played', () => {
    const small = [piece('a'), piece('b', { status: 'archived' }), piece('c')]
    const { top, more } = tomorrowChoices(small, [take('b', TODAY), take('b', TODAY)], TODAY, 'b')
    expect([...top, ...more].map((p) => p.id)).toEqual(['a', 'c'])
  })

  it('lists keep pieces behind more', () => {
    const small = [piece('a'), piece('b', { status: 'keep' }), piece('c')]
    const { top, more } = tomorrowChoices(small, [], TODAY, undefined)
    expect(top.map((p) => p.id)).toEqual(['a', 'c'])
    expect(more.map((p) => p.id)).toEqual(['b'])
  })
})

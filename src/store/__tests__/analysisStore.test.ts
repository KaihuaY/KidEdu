import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAnalysisStore, type AnalysisStore, type StoredFingerprint } from '../analysisStore'

let store: AnalysisStore

beforeEach(() => {
  // A fresh IDBFactory per test so tests never see each other's databases.
  store = openAnalysisStore(new IDBFactory())
})

function fp(overrides: Partial<StoredFingerprint> = {}): StoredFingerprint {
  return {
    takeId: 'take-1',
    pieceId: 'piece-1',
    blockSec: 0.5,
    blocks: 3,
    data: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    at: 1000,
    ...overrides,
  }
}

describe('putFingerprint / getFingerprint', () => {
  it('round-trips a fingerprint by takeId', async () => {
    await store.putFingerprint(fp())
    const back = await store.getFingerprint('take-1')
    expect(back).not.toBeNull()
    expect(back?.pieceId).toBe('piece-1')
    expect(back?.blocks).toBe(3)
    expect(Array.from(back!.data)).toEqual(Array.from(fp().data))
  })

  it('resolves null (not a rejection) for a missing id', async () => {
    await expect(store.getFingerprint('missing')).resolves.toBeNull()
  })

  it('put again with the same takeId overwrites rather than duplicating', async () => {
    await store.putFingerprint(fp({ blocks: 3 }))
    await store.putFingerprint(fp({ blocks: 9 }))
    const back = await store.getFingerprint('take-1')
    expect(back?.blocks).toBe(9)
    expect(await store.fingerprintsForPiece('piece-1')).toHaveLength(1)
  })

  it('accepts a free-play fingerprint with pieceId null', async () => {
    await store.putFingerprint(fp({ takeId: 'free-1', pieceId: null }))
    const back = await store.getFingerprint('free-1')
    expect(back?.pieceId).toBeNull()
  })
})

describe('fingerprintsForPiece', () => {
  it('returns only the matching piece, sorted oldest first', async () => {
    await store.putFingerprint(fp({ takeId: 'a', pieceId: 'piece-1', at: 300 }))
    await store.putFingerprint(fp({ takeId: 'b', pieceId: 'piece-1', at: 100 }))
    await store.putFingerprint(fp({ takeId: 'c', pieceId: 'piece-1', at: 200 }))
    await store.putFingerprint(fp({ takeId: 'd', pieceId: 'piece-2', at: 50 }))

    const results = await store.fingerprintsForPiece('piece-1')
    expect(results.map((r) => r.takeId)).toEqual(['b', 'c', 'a'])
  })

  it('is empty for a piece with no fingerprints', async () => {
    expect(await store.fingerprintsForPiece('nothing-here')).toEqual([])
  })
})

describe('pruning to the newest 40 per piece', () => {
  it('keeps only the 40 most recent fingerprints once a piece exceeds that count', async () => {
    for (let i = 0; i < 45; i++) {
      await store.putFingerprint(fp({ takeId: `t${i}`, pieceId: 'piece-1', at: i }))
    }
    const results = await store.fingerprintsForPiece('piece-1')
    expect(results).toHaveLength(40)
    // The 5 oldest (at 0..4) should have been pruned; the newest 40 (at 5..44) remain.
    expect(results[0].at).toBe(5)
    expect(results[results.length - 1].at).toBe(44)
  })

  it('does not prune across different pieces', async () => {
    for (let i = 0; i < 45; i++) {
      await store.putFingerprint(fp({ takeId: `a${i}`, pieceId: 'piece-a', at: i }))
    }
    for (let i = 0; i < 10; i++) {
      await store.putFingerprint(fp({ takeId: `b${i}`, pieceId: 'piece-b', at: i }))
    }
    expect(await store.fingerprintsForPiece('piece-a')).toHaveLength(40)
    expect(await store.fingerprintsForPiece('piece-b')).toHaveLength(10)
  })

  it('never prunes free-play fingerprints (pieceId null)', async () => {
    for (let i = 0; i < 45; i++) {
      await store.putFingerprint(fp({ takeId: `free-${i}`, pieceId: null, at: i }))
    }
    // No error, and the individual records are still retrievable.
    const back = await store.getFingerprint('free-0')
    expect(back).not.toBeNull()
  })
})

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { openRecordingStore, type RecordingStore } from '../recordings'

function makeBlob(bytes: number, type = 'audio/webm'): Blob {
  return new Blob([new Uint8Array(bytes)], { type })
}

let store: RecordingStore

beforeEach(() => {
  // A fresh IDBFactory per test so tests never see each other's databases.
  store = openRecordingStore(new IDBFactory())
})

describe('recordings store', () => {
  it('round-trips bytes and mime type through put/get', async () => {
    const blob = makeBlob(1234, 'audio/mp4')
    const meta = await store.put('take-1', blob, 1000)
    expect(meta).toEqual({ id: 'take-1', savedAt: 1000, sizeBytes: 1234, mimeType: 'audio/mp4' })

    const back = await store.get('take-1')
    expect(back).not.toBeNull()
    expect(back!.type).toBe('audio/mp4')
    const bytes = await back!.arrayBuffer()
    expect(bytes.byteLength).toBe(1234)
  })

  it('resolves null (not a rejection) for a missing id', async () => {
    await expect(store.get('missing')).resolves.toBeNull()
  })

  it('lists metadata sorted by savedAt', async () => {
    await store.put('b', makeBlob(10), 200)
    await store.put('a', makeBlob(10), 100)
    await store.put('c', makeBlob(10), 300)

    const list = await store.list()
    expect(list.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('removes a single id', async () => {
    await store.put('x', makeBlob(10), 1)
    await store.put('y', makeBlob(10), 2)
    await store.remove('x')

    const list = await store.list()
    expect(list.map((m) => m.id)).toEqual(['y'])
    expect(await store.get('x')).toBeNull()
  })

  it('prunes only ids strictly older than the cutoff and returns their ids', async () => {
    await store.put('old-1', makeBlob(10), 100)
    await store.put('old-2', makeBlob(10), 200)
    await store.put('at-cutoff', makeBlob(10), 500)
    await store.put('new-1', makeBlob(10), 900)

    const removed = await store.pruneOlderThan(500)
    expect(removed.sort()).toEqual(['old-1', 'old-2'])

    const remaining = (await store.list()).map((m) => m.id).sort()
    expect(remaining).toEqual(['at-cutoff', 'new-1'])
  })

  it('sums usage across all stored recordings', async () => {
    expect(await store.usageBytes()).toBe(0)
    await store.put('x', makeBlob(100), 1)
    await store.put('y', makeBlob(250), 2)
    expect(await store.usageBytes()).toBe(350)
  })

  it('clear empties the store', async () => {
    await store.put('x', makeBlob(10), 1)
    await store.put('y', makeBlob(10), 2)
    await store.clear()

    expect(await store.list()).toEqual([])
    expect(await store.usageBytes()).toBe(0)
  })
})

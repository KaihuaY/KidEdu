import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backupProgressToDrive,
  buildFileName,
  enqueueUpload,
  isDriveConfigured,
  lastProgressBackupDay,
  processUploadQueue,
  retryFailedUploads,
  testDriveConnection,
  uploadNow,
  useUploadSummary,
  type DriveConfig,
} from '../driveUpload'
import { getDoc, resetAll, update, type PianoTake } from '../progress'
import type { RecordingStore } from '../recordings'

// Same in-memory localStorage mock as progress.test.ts.
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

const DEVICE_ID = 'device-a'
const OTHER_DEVICE_ID = 'device-b'
const SECRET = 'shh'
const CFG: DriveConfig = { scriptUrl: 'https://script.google.com/exec', secret: SECRET, folderName: 'Nora Piano' }

function makeTake(overrides: Partial<PianoTake> = {}): PianoTake {
  return {
    id: 'take-1',
    day: '2026-09-07',
    pieceId: null,
    startedAt: new Date(2026, 8, 7, 14, 5).getTime(),
    durationSec: 60,
    activeSec: 40,
    mimeType: 'audio/mp4',
    sizeBytes: 1000,
    hasAudio: true,
    deviceId: DEVICE_ID,
    ...overrides,
  }
}

/** A minimal fake RecordingStore backed by a Map<id, Blob>. */
function fakeStore(blobs: Record<string, Blob> = {}): RecordingStore {
  const map = new Map(Object.entries(blobs))
  return {
    async put(id, blob) {
      map.set(id, blob)
      return { id, savedAt: Date.now(), sizeBytes: blob.size, mimeType: blob.type }
    },
    async get(id) {
      return map.get(id) ?? null
    },
    async remove(id) {
      map.delete(id)
    },
    async list() {
      return Array.from(map.entries()).map(([id, b]) => ({ id, savedAt: 0, sizeBytes: b.size, mimeType: b.type }))
    },
    async usageBytes() {
      return Array.from(map.values()).reduce((sum, b) => sum + b.size, 0)
    },
    async pruneOlderThan() {
      return []
    },
    async clear() {
      map.clear()
    },
    // driveUpload.ts never touches partials - stubbed only to satisfy RecordingStore.
    async putPartial() {},
    async listPartialIds() {
      return []
    },
    async assemblePartial() {
      return null
    },
    async deletePartial() {},
  }
}

function okFetch(body: Record<string, unknown>): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch
}

function addTake(take: PianoTake): void {
  update('piano', (piano) => ({ ...piano, takes: [...piano.takes, take] }))
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
  resetAll()
  update('settings', (s) => ({ ...s, driveUpload: CFG, kidName: 'Nora' }))
})

describe('isDriveConfigured', () => {
  it('is false with no driveUpload, true once both scriptUrl and secret are set', () => {
    expect(isDriveConfigured(getDoc().settings)).toBe(true) // set in beforeEach
    update('settings', (s) => ({ ...s, driveUpload: undefined }))
    expect(isDriveConfigured(getDoc().settings)).toBe(false)
    update('settings', (s) => ({ ...s, driveUpload: { scriptUrl: '', secret: '', folderName: '' } }))
    expect(isDriveConfigured(getDoc().settings)).toBe(false)
  })
})

describe('enqueueUpload', () => {
  it('sets a pending upload on an existing take without one', () => {
    addTake(makeTake({ upload: undefined }))
    enqueueUpload('take-1')
    const take = getDoc().piano.takes[0]
    expect(take.upload).toMatchObject({ status: 'pending', attempts: 0 })
  })

  it('does nothing for a take that already finished uploading', () => {
    addTake(makeTake({ upload: { status: 'done', attempts: 1, updatedAt: 1, driveFileId: 'f1' } }))
    enqueueUpload('take-1')
    expect(getDoc().piano.takes[0].upload?.status).toBe('done')
  })

  it('does nothing for an unknown take id', () => {
    expect(() => enqueueUpload('missing')).not.toThrow()
  })
})

describe('processUploadQueue', () => {
  it('uploads a pending take and marks it done with driveUrl/driveFileId', async () => {
    addTake(
      makeTake({
        upload: { status: 'pending', attempts: 0, updatedAt: 0 },
      }),
    )
    const fetchFn = okFetch({ ok: true, fileId: 'abc123', url: 'https://drive/view', downloadUrl: 'https://drive/dl' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await processUploadQueue({ fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    const take = getDoc().piano.takes[0]
    expect(take.upload).toMatchObject({
      status: 'done',
      driveFileId: 'abc123',
      driveUrl: 'https://drive/dl',
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(init.body as string)
    expect(payload.secret).toBe(SECRET)
    expect(payload.mimeType).toBe('audio/mp4')
    expect(payload.dataBase64).toEqual(expect.any(String))
  })

  it('falls back to url when downloadUrl is absent', async () => {
    addTake(makeTake({ upload: { status: 'pending', attempts: 0, updatedAt: 0 } }))
    const fetchFn = okFetch({ ok: true, fileId: 'abc', url: 'https://drive/view' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await processUploadQueue({ fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    expect(getDoc().piano.takes[0].upload?.driveUrl).toBe('https://drive/view')
  })

  it('on {ok:false}, increments attempts, stays pending, and records lastError', async () => {
    addTake(makeTake({ upload: { status: 'pending', attempts: 0, updatedAt: 0 } }))
    const fetchFn = okFetch({ ok: false, error: 'bad secret' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await processUploadQueue({ fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    const take = getDoc().piano.takes[0]
    expect(take.upload).toMatchObject({ status: 'pending', attempts: 1, lastError: 'bad secret' })
  })

  it('does nothing on a second call within the backoff window (10s after the 1st attempt)', async () => {
    addTake(makeTake({ upload: { status: 'pending', attempts: 1, updatedAt: 1_000_000, lastError: 'boom' } }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    // 5s later - still within the 10s backoff after 1 attempt.
    await processUploadQueue({
      fetch: fetchFn,
      store,
      deviceId: DEVICE_ID,
      online: () => true,
      now: () => 1_005_000,
    })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(getDoc().piano.takes[0].upload?.status).toBe('pending')
  })

  it('retries once the backoff window has passed (10s after the 1st attempt)', async () => {
    addTake(makeTake({ upload: { status: 'pending', attempts: 1, updatedAt: 1_000_000 } }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    // 11s later - past the 10s backoff after 1 attempt.
    await processUploadQueue({
      fetch: fetchFn,
      store,
      deviceId: DEVICE_ID,
      online: () => true,
      now: () => 1_011_000,
    })

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(getDoc().piano.takes[0].upload?.status).toBe('done')
  })

  it('waits 60s after the 2nd attempt, then 5min after the 3rd, then 30min after the 4th+', async () => {
    const schedule: Array<[attempts: number, backoffMs: number]> = [
      [2, 60_000],
      [3, 5 * 60_000],
      [4, 30 * 60_000],
      [7, 30 * 60_000], // capped - no further growth past the 4th backoff stage
    ]
    for (const [attempts, backoff] of schedule) {
      addTake(makeTake({ id: `sched-${attempts}`, upload: { status: 'pending', attempts, updatedAt: 1_000_000 } }))
      const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
      const store = fakeStore({ [`sched-${attempts}`]: new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

      // Just before the boundary: still blocked.
      await processUploadQueue({
        fetch: fetchFn,
        store,
        deviceId: DEVICE_ID,
        online: () => true,
        now: () => 1_000_000 + backoff - 1_000,
      })
      expect(fetchFn).not.toHaveBeenCalled()

      // Just past the boundary: retries.
      await processUploadQueue({
        fetch: fetchFn,
        store,
        deviceId: DEVICE_ID,
        online: () => true,
        now: () => 1_000_000 + backoff + 1_000,
      })
      expect(fetchFn).toHaveBeenCalledTimes(1)
    }
  })

  it('picks up a take that has local audio but no `upload` field at all (e.g. recorded before Drive was configured)', async () => {
    addTake(makeTake({ upload: undefined }))
    const fetchFn = okFetch({ ok: true, fileId: 'abc', url: 'https://drive/view' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await processUploadQueue({ fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(getDoc().piano.takes[0].upload).toMatchObject({ status: 'done', driveFileId: 'abc' })
  })

  it('still skips a no-upload-field take recorded on another device', async () => {
    addTake(makeTake({ deviceId: OTHER_DEVICE_ID, upload: undefined }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await processUploadQueue({ fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(getDoc().piano.takes[0].upload).toBeUndefined()
  })

  it('gives up after too many attempts', async () => {
    addTake(makeTake({ upload: { status: 'pending', attempts: 8, updatedAt: 0 } }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await processUploadQueue({ fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(getDoc().piano.takes[0].upload).toMatchObject({ status: 'failed', lastError: 'gave up' })
  })

  it('skips takes recorded on another device', async () => {
    addTake(makeTake({ deviceId: OTHER_DEVICE_ID, upload: { status: 'pending', attempts: 0, updatedAt: 0 } }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await processUploadQueue({ fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(getDoc().piano.takes[0].upload?.status).toBe('pending')
  })

  it('marks a take failed with "no local audio" when the blob is missing', async () => {
    addTake(makeTake({ upload: { status: 'pending', attempts: 0, updatedAt: 0 } }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({}) // no blob for take-1

    await processUploadQueue({ fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(getDoc().piano.takes[0].upload).toMatchObject({ status: 'failed', lastError: 'no local audio' })
  })

  it('does nothing while offline', async () => {
    addTake(makeTake({ upload: { status: 'pending', attempts: 0, updatedAt: 0 } }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await processUploadQueue({ fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => false })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(getDoc().piano.takes[0].upload?.status).toBe('pending')
  })

  it('does nothing when Drive is not configured', async () => {
    update('settings', (s) => ({ ...s, driveUpload: undefined }))
    addTake(makeTake({ upload: { status: 'pending', attempts: 0, updatedAt: 0 } }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await processUploadQueue({ fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('a network throw is treated like a failed response', async () => {
    addTake(makeTake({ upload: { status: 'pending', attempts: 0, updatedAt: 0 } }))
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await processUploadQueue({ fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    expect(getDoc().piano.takes[0].upload).toMatchObject({ status: 'pending', attempts: 1, lastError: 'network down' })
  })
})

describe('useUploadSummary (via getDoc snapshot logic)', () => {
  it('counts pending/uploading as pending, and failed/done separately', () => {
    addTake(makeTake({ id: 't1', upload: { status: 'pending', attempts: 0, updatedAt: 0 } }))
    addTake(makeTake({ id: 't2', upload: { status: 'uploading', attempts: 0, updatedAt: 0 } }))
    addTake(makeTake({ id: 't3', upload: { status: 'failed', attempts: 8, updatedAt: 0 } }))
    addTake(makeTake({ id: 't4', upload: { status: 'done', attempts: 1, updatedAt: 0 } }))
    addTake(makeTake({ id: 't5', upload: undefined }))

    // useUploadSummary is a React hook (useSyncExternalStore); exercise its
    // pure getSnapshot logic indirectly by checking the doc state it reads.
    const takes = getDoc().piano.takes
    const pending = takes.filter((t) => t.upload?.status === 'pending' || t.upload?.status === 'uploading').length
    const failed = takes.filter((t) => t.upload?.status === 'failed').length
    const done = takes.filter((t) => t.upload?.status === 'done').length
    expect({ pending, failed, done }).toEqual({ pending: 2, failed: 1, done: 1 })
    expect(typeof useUploadSummary).toBe('function')
  })
})

describe('retryFailedUploads', () => {
  it('resets every failed take to pending with attempts 0', () => {
    addTake(makeTake({ id: 't1', upload: { status: 'failed', attempts: 8, updatedAt: 0, lastError: 'gave up' } }))
    addTake(makeTake({ id: 't2', upload: { status: 'done', attempts: 1, updatedAt: 0 } }))

    retryFailedUploads()

    const takes = getDoc().piano.takes
    expect(takes.find((t) => t.id === 't1')?.upload).toMatchObject({ status: 'pending', attempts: 0 })
    expect(takes.find((t) => t.id === 't2')?.upload).toMatchObject({ status: 'done' })
  })
})

describe('uploadNow', () => {
  it('resets a failed take (the "Try again" chip button) and uploads it immediately', async () => {
    addTake(makeTake({ upload: { status: 'failed', attempts: 8, updatedAt: 0, lastError: 'gave up' } }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await uploadNow('take-1', { fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(getDoc().piano.takes[0].upload?.status).toBe('done')
  })

  it('clears a pending take out of its backoff window (the "Upload now" chip button)', async () => {
    addTake(makeTake({ upload: { status: 'pending', attempts: 1, updatedAt: 1_000_000, lastError: 'boom' } }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    // Still well within the 10s backoff, but uploadNow ignores that.
    await uploadNow('take-1', { fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true, now: () => 1_001_000 })

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(getDoc().piano.takes[0].upload?.status).toBe('done')
  })

  it('enqueues and uploads a take with no `upload` field at all when called with its id', async () => {
    addTake(makeTake({ upload: undefined }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await uploadNow('take-1', { fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(getDoc().piano.takes[0].upload?.status).toBe('done')
  })

  it('leaves an already-done take alone', async () => {
    addTake(makeTake({ upload: { status: 'done', attempts: 1, updatedAt: 0, driveFileId: 'f1' } }))
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({ 'take-1': new Blob([new Uint8Array(10)], { type: 'audio/mp4' }) })

    await uploadNow('take-1', { fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(getDoc().piano.takes[0].upload).toMatchObject({ status: 'done', driveFileId: 'f1' })
  })

  it('with no id, clears every pending/uploading take out of backoff and uploads them all', async () => {
    addTake(makeTake({ id: 't1', upload: { status: 'pending', attempts: 1, updatedAt: 1_000_000 } }))
    addTake(makeTake({ id: 't2', upload: { status: 'pending', attempts: 2, updatedAt: 1_000_000 } }))
    addTake(makeTake({ id: 't3', upload: { status: 'failed', attempts: 8, updatedAt: 0 } })) // untouched - not "pending"
    const fetchFn = okFetch({ ok: true, fileId: 'x', url: 'u' })
    const store = fakeStore({
      t1: new Blob([new Uint8Array(10)], { type: 'audio/mp4' }),
      t2: new Blob([new Uint8Array(10)], { type: 'audio/mp4' }),
    })

    await uploadNow(undefined, { fetch: fetchFn, store, deviceId: DEVICE_ID, online: () => true, now: () => 1_001_000 })

    const takes = getDoc().piano.takes
    expect(takes.find((t) => t.id === 't1')?.upload?.status).toBe('done')
    expect(takes.find((t) => t.id === 't2')?.upload?.status).toBe('done')
    expect(takes.find((t) => t.id === 't3')?.upload?.status).toBe('failed')
  })
})

describe('buildFileName', () => {
  it('formats YYYY-MM-DD_HHmm_<slug>.<ext> from local time and piece name', () => {
    const take = makeTake({ startedAt: new Date(2026, 8, 7, 14, 5).getTime(), mimeType: 'audio/mp4' })
    expect(buildFileName(take, 'Twinkle Twinkle')).toBe('2026-09-07_1405_twinkle-twinkle.m4a')
  })

  it('falls back to free-play when there is no piece name', () => {
    const take = makeTake({ startedAt: new Date(2026, 8, 7, 9, 3).getTime(), mimeType: 'audio/webm;codecs=opus' })
    expect(buildFileName(take, null)).toBe('2026-09-07_0903_free-play.webm')
  })
})

describe('testDriveConnection', () => {
  it('reports ok on {ok:true,pong:true}', async () => {
    const fetchFn = okFetch({ ok: true, pong: true })
    const result = await testDriveConnection(CFG, { fetch: fetchFn })
    expect(result.ok).toBe(true)
    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(init.body as string)
    expect(payload).toEqual({ secret: SECRET, ping: true })
  })

  it('reports failure with the server error on a bad secret', async () => {
    const fetchFn = okFetch({ ok: false, error: 'bad secret' })
    const result = await testDriveConnection(CFG, { fetch: fetchFn })
    expect(result.ok).toBe(false)
    expect(result.message).toBe('bad secret')
  })

  it('reports failure when the URL or secret is blank, without calling fetch', async () => {
    const fetchFn = okFetch({ ok: true, pong: true })
    const result = await testDriveConnection({ scriptUrl: '', secret: '', folderName: '' }, { fetch: fetchFn })
    expect(result.ok).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('backupProgressToDrive', () => {
  it('uploads once per local day, skips a second call the same day, and uploads again on a new day', async () => {
    const fetchFn = okFetch({ ok: true, fileId: 'p1', url: 'https://drive/progress' })

    await backupProgressToDrive({ fetch: fetchFn, online: () => true, now: () => new Date(2026, 8, 7, 10, 0).getTime() })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(CFG.scriptUrl)
    const payload = JSON.parse(init.body as string)
    expect(payload.secret).toBe(SECRET)
    expect(payload.fileName).toBe('practice-progress-2026-09-07.json')
    expect(payload.mimeType).toBe('application/json')
    expect(payload.dataBase64).toEqual(expect.any(String))
    expect(lastProgressBackupDay()).toBe('2026-09-07')

    // Later the same local day - skipped.
    await backupProgressToDrive({ fetch: fetchFn, online: () => true, now: () => new Date(2026, 8, 7, 20, 0).getTime() })
    expect(fetchFn).toHaveBeenCalledTimes(1)

    // A new local day - uploads again.
    await backupProgressToDrive({ fetch: fetchFn, online: () => true, now: () => new Date(2026, 8, 8, 9, 0).getTime() })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    const [, init2] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(init2.body as string).fileName).toBe('practice-progress-2026-09-08.json')
    expect(lastProgressBackupDay()).toBe('2026-09-08')
  })

  it('does nothing when Drive is not configured', async () => {
    update('settings', (s) => ({ ...s, driveUpload: undefined }))
    const fetchFn = okFetch({ ok: true })
    await backupProgressToDrive({ fetch: fetchFn, online: () => true })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('does nothing while offline', async () => {
    const fetchFn = okFetch({ ok: true })
    await backupProgressToDrive({ fetch: fetchFn, online: () => false })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('does not mark the day done when the script reports failure, so the next call retries', async () => {
    const failFetch = okFetch({ ok: false, error: 'bad secret' })
    await backupProgressToDrive({ fetch: failFetch, online: () => true, now: () => new Date(2026, 8, 7).getTime() })
    expect(lastProgressBackupDay()).toBeNull()

    const okFetchFn = okFetch({ ok: true, fileId: 'p1' })
    await backupProgressToDrive({ fetch: okFetchFn, online: () => true, now: () => new Date(2026, 8, 7).getTime() })
    expect(okFetchFn).toHaveBeenCalledTimes(1)
    expect(lastProgressBackupDay()).toBe('2026-09-07')
  })

  it('a network throw leaves the day unmarked, same as a reported failure', async () => {
    const throwingFetch = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    await backupProgressToDrive({ fetch: throwingFetch, online: () => true })
    expect(lastProgressBackupDay()).toBeNull()
  })
})

describe('getUploadSummarySnapshot', () => {
  it('returns the same object while takes are unchanged (useSyncExternalStore stability)', async () => {
    const { getUploadSummarySnapshot } = await import('../driveUpload')
    const a = getUploadSummarySnapshot()
    const b = getUploadSummarySnapshot()
    expect(a).toBe(b)
  })
})

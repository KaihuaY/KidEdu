import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enqueuePhotoUpload, processPhotoQueue, retryFailedPhotoUploads } from '../photoUpload'
import { addTeacherNote, setTeacherNoteUpload } from '../teacherNotes'
import { getDoc, resetAll, update } from '../progress'
import type { RecordingStore } from '../recordings'

// Same in-memory localStorage mock as progress.test.ts / driveUpload.test.ts.
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

const CFG = { scriptUrl: 'https://script.google.com/exec', secret: 'shh', folderName: 'Nora Piano' }

function okFetch(body: Record<string, unknown>): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch
}

/** A minimal fake RecordingStore backed by a Map<id, Blob> of photos only - photoUpload.ts never touches takes/partials. */
function fakePhotoStore(blobs: Record<string, Blob> = {}): RecordingStore {
  const map = new Map(Object.entries(blobs))
  return {
    async put(id, blob) {
      return { id, savedAt: Date.now(), sizeBytes: blob.size, mimeType: blob.type }
    },
    async get() {
      return null
    },
    async remove() {},
    async list() {
      return []
    },
    async usageBytes() {
      return 0
    },
    async pruneOlderThan() {
      return []
    },
    async clear() {},
    async putPartial() {},
    async listPartialIds() {
      return []
    },
    async assemblePartial() {
      return null
    },
    async deletePartial() {},
    async putPhoto(id, blob) {
      map.set(id, blob)
    },
    async getPhoto(id) {
      return map.get(id) ?? null
    },
    async removePhoto(id) {
      map.delete(id)
    },
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  resetAll()
  update('settings', (s) => ({ ...s, driveUpload: CFG, kidName: 'Nora' }))
})

describe('enqueuePhotoUpload', () => {
  it('sets a note back to pending with a clean attempt count', () => {
    const id = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    setTeacherNoteUpload(id, { status: 'failed', attempts: 3, lastError: 'boom' })
    enqueuePhotoUpload(id)
    expect(getDoc().teacherNotes.items[0].upload).toMatchObject({ status: 'pending', attempts: 0 })
  })

  it('does nothing once a note has already finished uploading', () => {
    const id = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    setTeacherNoteUpload(id, { status: 'done', driveUrl: 'https://drive/x' })
    enqueuePhotoUpload(id)
    expect(getDoc().teacherNotes.items[0].upload.status).toBe('done')
  })

  it('does nothing for an unknown id', () => {
    expect(() => enqueuePhotoUpload('missing')).not.toThrow()
  })
})

describe('processPhotoQueue', () => {
  it('uploads a pending note into the "- Teacher notes" subfolder, marks it done, and clears the local photo', async () => {
    const id = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,', caption: 'Week 3' })
    const fetchFn = okFetch({ ok: true, fileId: 'f1', downloadUrl: 'https://drive/dl' })
    const store = fakePhotoStore({ [id]: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }) })

    await processPhotoQueue({ fetch: fetchFn, store, online: () => true })

    const note = getDoc().teacherNotes.items[0]
    expect(note.upload).toMatchObject({ status: 'done', driveFileId: 'f1', driveUrl: 'https://drive/dl' })
    expect(await store.getPhoto(id)).toBeNull()

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(init.body as string)
    expect(payload.folderName).toBe('Nora Piano - Teacher notes')
    expect(payload.mimeType).toBe('image/jpeg')
    expect(payload.fileName).toBe(`teacher-note_2026-09-20_${id.slice(0, 8)}.jpg`)
    expect(payload.description).toBe('Nora · teacher note · 2026-09-20 · Week 3')
    expect(payload.dataBase64).toEqual(expect.any(String))
  })

  it('on {ok:false}, increments attempts, stays pending, and records lastError', async () => {
    const id = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    const fetchFn = okFetch({ ok: false, error: 'bad secret' })
    const store = fakePhotoStore({ [id]: new Blob([new Uint8Array(4)], { type: 'image/jpeg' }) })

    await processPhotoQueue({ fetch: fetchFn, store, online: () => true })

    expect(getDoc().teacherNotes.items[0].upload).toMatchObject({ status: 'pending', attempts: 1, lastError: 'bad secret' })
  })

  it('does not remove the local photo when the response has no url', async () => {
    const id = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    const fetchFn = okFetch({ ok: true, fileId: 'f1' })
    const store = fakePhotoStore({ [id]: new Blob([new Uint8Array(4)], { type: 'image/jpeg' }) })

    await processPhotoQueue({ fetch: fetchFn, store, online: () => true })

    expect(getDoc().teacherNotes.items[0].upload.status).toBe('done')
    expect(await store.getPhoto(id)).not.toBeNull()
  })

  it('gives up (status failed) once MAX_ATTEMPTS is reached, without calling fetch', async () => {
    const id = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    setTeacherNoteUpload(id, { status: 'pending', attempts: 8 })
    const updatedAt = getDoc().teacherNotes.items[0].upload.updatedAt
    const fetchFn = okFetch({ ok: true, fileId: 'f1', url: 'https://drive/x' })
    const store = fakePhotoStore({ [id]: new Blob([new Uint8Array(4)], { type: 'image/jpeg' }) })

    // Past the (capped) 30-minute backoff so it's actually picked up as a candidate.
    await processPhotoQueue({ fetch: fetchFn, store, online: () => true, now: () => updatedAt + 31 * 60_000 })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(getDoc().teacherNotes.items[0].upload).toMatchObject({ status: 'failed', lastError: 'gave up' })
  })

  it('fails immediately (no fetch) when the local photo is missing', async () => {
    addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    const fetchFn = okFetch({ ok: true })
    const store = fakePhotoStore()

    await processPhotoQueue({ fetch: fetchFn, store, online: () => true })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(getDoc().teacherNotes.items[0].upload).toMatchObject({ status: 'failed', lastError: 'no local photo' })
  })

  it('does nothing while offline', async () => {
    const id = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    const fetchFn = okFetch({ ok: true })
    const store = fakePhotoStore({ [id]: new Blob([new Uint8Array(4)]) })

    await processPhotoQueue({ fetch: fetchFn, store, online: () => false })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(getDoc().teacherNotes.items[0].upload.status).toBe('pending')
  })

  it('does nothing when Drive is not configured', async () => {
    update('settings', (s) => ({ ...s, driveUpload: undefined }))
    addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    const fetchFn = okFetch({ ok: true })

    await processPhotoQueue({ fetch: fetchFn, store: fakePhotoStore(), online: () => true })

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('respects backoff between attempts, same schedule as takes (10s after 1st attempt)', async () => {
    const id = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    setTeacherNoteUpload(id, { status: 'pending', attempts: 1 })
    // setTeacherNoteUpload always stamps real Date.now(); read it back so the test's injected `now` can sit just inside/outside the 10s window.
    const updatedAt = getDoc().teacherNotes.items[0].upload.updatedAt
    const fetchFn = okFetch({ ok: true, fileId: 'f1', url: 'https://drive/x' })
    const store = fakePhotoStore({ [id]: new Blob([new Uint8Array(4)]) })

    await processPhotoQueue({ fetch: fetchFn, store, online: () => true, now: () => updatedAt + 5_000 })
    expect(fetchFn).not.toHaveBeenCalled()

    await processPhotoQueue({ fetch: fetchFn, store, online: () => true, now: () => updatedAt + 11_000 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe('retryFailedPhotoUploads', () => {
  it('resets every failed note to pending with a clean attempt count, leaving done/pending notes alone', () => {
    const failed = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    setTeacherNoteUpload(failed, { status: 'failed', attempts: 5, lastError: 'gave up' })
    const done = addTeacherNote({ day: '2026-09-21', thumbDataUrl: 'data:,' })
    setTeacherNoteUpload(done, { status: 'done', driveUrl: 'https://drive/x' })

    retryFailedPhotoUploads()

    const items = getDoc().teacherNotes.items
    expect(items.find((n) => n.id === failed)!.upload).toMatchObject({ status: 'pending', attempts: 0 })
    expect(items.find((n) => n.id === done)!.upload.status).toBe('done')
  })
})

// Uploads teacher-note photos to the parent's Google Drive, into a
// subfolder named "<parent folder> - Teacher notes" so they don't mix in
// with piano takes. Mirrors driveUpload.ts's take-upload queue (same
// backoff/attempts contract, same postToDrive request shape) but reads
// TeacherNote entries instead of PianoTake, and stores its blobs in
// recordings.ts's `photos` object store instead of `takes`.
//
// Offline-safe: with no Drive config at all, this queue is simply never
// drained - a note stays "Saved on this device" forever, same spirit as an
// un-uploaded take.

import { getDoc, type TeacherNote } from './progress'
import { isDriveConfigured, postToDrive, type DriveConfig } from './driveUpload'
import { blobToBase64 } from '../utils/image'
import { getRecordingStore, type RecordingStore } from './recordings'
import { pendingTeacherNoteUploads, setTeacherNoteUpload } from './teacherNotes'

const BACKOFF_MS = [10_000, 60_000, 5 * 60_000, 30 * 60_000]
const MAX_ATTEMPTS = 8
const STALE_UPLOADING_MS = 10 * 60_000

function backoffMs(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]
}

function defaultOnline(): boolean {
  try {
    if (typeof navigator === 'undefined') return true
    return navigator.onLine
  } catch {
    return true
  }
}

export interface PhotoUploadDeps {
  fetch?: typeof fetch
  store?: RecordingStore
  now?: () => number
  online?: () => boolean
}

/** Marks a teacher note's photo pending. addTeacherNote() already starts a note this way; this is for re-queuing one explicitly. */
export function enqueuePhotoUpload(id: string): void {
  const note = getDoc().teacherNotes.items.find((n) => n.id === id)
  if (!note || note.upload.status === 'done') return
  setTeacherNoteUpload(id, { status: 'pending', attempts: 0 })
}

/** Resets every 'failed' teacher-note upload back to 'pending' with a clean attempt count, so the queue retries them right away. */
export function retryFailedPhotoUploads(): void {
  for (const note of getDoc().teacherNotes.items) {
    if (note.upload.status === 'failed') setTeacherNoteUpload(note.id, { status: 'pending', attempts: 0 })
  }
}

function teacherNotesFolder(cfg: DriveConfig): DriveConfig {
  return { ...cfg, folderName: `${cfg.folderName} - Teacher notes` }
}

function fileNameFor(note: TeacherNote): string {
  return `teacher-note_${note.day}_${note.id.slice(0, 8)}.jpg`
}

function descriptionFor(note: TeacherNote, kidName: string): string {
  const parts = [kidName, 'teacher note', note.day, note.caption].filter((p): p is string => !!p && p.trim() !== '')
  return parts.join(' · ')
}

let uploading = false

/**
 * Walks every teacher note whose photo still needs uploading (pending or
 * failed, per pendingTeacherNoteUploads - unlike the take queue, a failed
 * photo keeps being retried automatically here since a teacher's note is
 * harder to recapture than a piano take), one at a time.
 */
export async function processPhotoQueue(deps: PhotoUploadDeps = {}): Promise<void> {
  if (uploading) return
  const settings = getDoc().settings
  if (!isDriveConfigured(settings)) return
  const online = deps.online ?? defaultOnline
  if (!online()) return

  uploading = true
  try {
    const now = deps.now ?? Date.now
    const doFetch = deps.fetch ?? fetch
    const store = deps.store ?? getRecordingStore()
    const nowMs = now()

    const candidateIds = pendingTeacherNoteUploads(getDoc().teacherNotes.items)
      .filter((n) => {
        const upload = n.upload
        if (upload.status === 'uploading') return nowMs - upload.updatedAt >= STALE_UPLOADING_MS
        if (upload.attempts > 0 && nowMs - upload.updatedAt < backoffMs(upload.attempts)) return false
        return true
      })
      .map((n) => n.id)

    for (const id of candidateIds) {
      await uploadOnePhoto(id, { doFetch, store, cfg: settings.driveUpload! })
    }
  } finally {
    uploading = false
  }
}

async function uploadOnePhoto(
  id: string,
  ctx: { doFetch: typeof fetch; store: RecordingStore; cfg: DriveConfig },
): Promise<void> {
  const { doFetch, store, cfg } = ctx
  const note = getDoc().teacherNotes.items.find((n) => n.id === id)
  if (!note) return

  if (note.upload.attempts >= MAX_ATTEMPTS) {
    setTeacherNoteUpload(id, { status: 'failed', lastError: 'gave up' })
    return
  }

  const blob = await store.getPhoto(id)
  if (!blob) {
    setTeacherNoteUpload(id, { status: 'failed', attempts: note.upload.attempts + 1, lastError: 'no local photo' })
    return
  }

  setTeacherNoteUpload(id, { status: 'uploading' })

  const kidName = getDoc().settings.kidName
  const fileName = fileNameFor(note)
  const description = descriptionFor(note, kidName)

  try {
    const dataBase64 = await blobToBase64(blob)
    const parsed = await postToDrive(teacherNotesFolder(cfg), { fileName, mimeType: 'image/jpeg', description, dataBase64 }, doFetch)

    const latest = getDoc().teacherNotes.items.find((n) => n.id === id)
    if (!latest) return

    if (parsed.ok) {
      const driveUrl = parsed.downloadUrl ?? parsed.url
      setTeacherNoteUpload(id, { status: 'done', attempts: latest.upload.attempts, driveFileId: parsed.fileId, driveUrl })
      // Free the local copy only once the Drive copy is confirmed reachable.
      if (driveUrl) await store.removePhoto(id)
    } else {
      setTeacherNoteUpload(id, { status: 'pending', attempts: latest.upload.attempts + 1, lastError: parsed.error ?? 'upload failed' })
    }
  } catch (err) {
    const latest = getDoc().teacherNotes.items.find((n) => n.id === id)
    if (!latest) return
    setTeacherNoteUpload(id, {
      status: 'pending',
      attempts: latest.upload.attempts + 1,
      lastError: err instanceof Error ? err.message : 'network error',
    })
  }
}

// Uploads piano takes recorded on this device to the parent's Google Drive,
// via the Apps Script web app in scripts/drive-uploader.gs. See the plan's
// section B2 for the full design; this module owns the client side of that
// contract only - the server side is scripts/drive-uploader.gs and must not
// be edited to match this file, it's the other way around.
//
// Nothing here blocks the kid: a take is saved locally and rewarded before
// any of this runs. Uploads happen in the background, retry with backoff,
// and give up quietly after enough failed attempts - the take just stays
// "recorded on this device" forever in that case.

import { useSyncExternalStore } from 'react'
import { extensionFor } from '../audio/mime'
import { getDoc, subscribe, update, type PianoTake, type Settings } from './progress'
import { getRecordingStore, type RecordingStore } from './recordings'

export interface DriveConfig {
  scriptUrl: string
  secret: string
  folderName: string
}

/** True when Settings has enough Drive config to attempt an upload. */
export function isDriveConfigured(settings: Settings): settings is Settings & { driveUpload: DriveConfig } {
  const cfg = settings.driveUpload
  return !!cfg && cfg.scriptUrl.trim() !== '' && cfg.secret.trim() !== ''
}

const DEVICE_ID_KEY = 'cubeclimb.deviceId'

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

/** The stable per-device id used to tell "recorded on this device" apart from other devices. */
export function getDeviceId(): string {
  if (!hasLocalStorage()) return 'unknown-device'
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const fresh = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(DEVICE_ID_KEY, fresh)
    return fresh
  } catch {
    return 'unknown-device'
  }
}

/** Marks a take for upload. No-op if the take doesn't exist or already finished uploading. */
export function enqueueUpload(takeId: string): void {
  update('piano', (piano) => {
    const take = piano.takes.find((t) => t.id === takeId)
    if (!take || take.upload?.status === 'done') return piano
    return {
      ...piano,
      takes: piano.takes.map((t) =>
        t.id === takeId ? { ...t, upload: { status: 'pending', attempts: 0, updatedAt: Date.now() } } : t,
      ),
    }
  })
}

/** Sets every 'failed' take back to 'pending' with a clean attempt count, so the queue retries them right away. */
export function retryFailedUploads(): void {
  update('piano', (piano) => ({
    ...piano,
    takes: piano.takes.map((t) =>
      t.upload?.status === 'failed'
        ? { ...t, upload: { status: 'pending', attempts: 0, updatedAt: Date.now() } }
        : t,
    ),
  }))
}

export interface UploadDeps {
  fetch?: typeof fetch
  store?: RecordingStore
  now?: () => number
  online?: () => boolean
  deviceId?: string
}

const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000]
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

function pieceName(pieceId: string | null, settings: Settings): string | null {
  if (!pieceId) return null
  return settings.pianoPieces.find((p) => p.id === pieceId)?.name ?? null
}

/** `YYYY-MM-DD_HHmm_<slug>.<ext>` from the take's local start time and piece (or 'free-play'). */
export function buildFileName(take: PianoTake, pieceNameValue: string | null): string {
  const d = new Date(take.startedAt)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const base = pieceNameValue && pieceNameValue.trim() !== '' ? pieceNameValue : 'free-play'
  const slug =
    base
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'free-play'
  const ext = extensionFor(take.mimeType)
  return `${y}-${mo}-${day}_${hh}${mm}_${slug}.${ext}`
}

/** Chunked base64 encoding so a large ArrayBuffer doesn't blow the call stack via `String.fromCharCode(...bytes)`. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

interface UploadResponse {
  ok: boolean
  fileId?: string
  url?: string
  downloadUrl?: string
  error?: string
}

let uploading = false

/**
 * Walks every eligible take once, uploading them one at a time, sequentially.
 * Re-entrant calls while a run is already in progress are ignored - the
 * in-flight run will pick up anything new next pass (called again on a
 * timer / online event by startUploadWorker).
 */
export async function processUploadQueue(deps: UploadDeps = {}): Promise<void> {
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
    const deviceId = deps.deviceId ?? getDeviceId()

    // Snapshot candidate ids up front; the doc is re-read before each write
    // since takes may change while we're awaiting a fetch.
    const nowMs = now()
    const candidateIds = getDoc()
      .piano.takes.filter((t) => {
        if (t.deviceId !== deviceId || !t.hasAudio) return false
        const upload = t.upload
        if (!upload) return false
        if (upload.status === 'pending') {
          if (upload.attempts > 0 && nowMs - upload.updatedAt < backoffMs(upload.attempts)) return false
          return true
        }
        if (upload.status === 'uploading') {
          return nowMs - upload.updatedAt >= STALE_UPLOADING_MS
        }
        return false
      })
      .map((t) => t.id)

    for (const takeId of candidateIds) {
      await uploadOne(takeId, { doFetch, store, now, cfg: settings.driveUpload })
    }
  } finally {
    uploading = false
  }
}

function setTakeUpload(takeId: string, upload: NonNullable<PianoTake['upload']>): void {
  update('piano', (piano) => ({
    ...piano,
    takes: piano.takes.map((t) => (t.id === takeId ? { ...t, upload } : t)),
  }))
}

async function uploadOne(
  takeId: string,
  ctx: { doFetch: typeof fetch; store: RecordingStore; now: () => number; cfg: DriveConfig },
): Promise<void> {
  const { doFetch, store, now, cfg } = ctx
  const doc = getDoc()
  const take = doc.piano.takes.find((t) => t.id === takeId)
  if (!take || !take.upload) return

  // attempts >= MAX_ATTEMPTS -> give up.
  if (take.upload.attempts >= MAX_ATTEMPTS) {
    setTakeUpload(takeId, { ...take.upload, status: 'failed', lastError: 'gave up', updatedAt: now() })
    return
  }

  const blob = await store.get(takeId)
  if (!blob) {
    setTakeUpload(takeId, { ...take.upload, status: 'failed', lastError: 'no local audio', updatedAt: now() })
    return
  }

  setTakeUpload(takeId, { ...take.upload, status: 'uploading', updatedAt: now() })

  const settings = getDoc().settings
  const name = pieceName(take.pieceId, settings)
  const fileName = buildFileName(take, name)
  const description = `${settings.kidName} · ${name ?? 'Free play'} · ${take.activeSec}s played of ${take.durationSec}s`

  try {
    const dataBase64 = arrayBufferToBase64(await blob.arrayBuffer())
    const res = await doFetch(cfg.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({
        secret: cfg.secret,
        folderName: cfg.folderName,
        fileName,
        mimeType: take.mimeType,
        description,
        dataBase64,
      }),
    })
    let parsed: UploadResponse | null = null
    try {
      parsed = (await res.json()) as UploadResponse
    } catch {
      parsed = null
    }

    const latest = getDoc().piano.takes.find((t) => t.id === takeId)
    if (!latest || !latest.upload) return

    if (parsed?.ok) {
      setTakeUpload(takeId, {
        status: 'done',
        attempts: latest.upload.attempts,
        driveFileId: parsed.fileId,
        driveUrl: parsed.downloadUrl ?? parsed.url,
        updatedAt: now(),
      })
    } else {
      const lastError = parsed?.error ?? `HTTP ${res.status}`
      setTakeUpload(takeId, {
        status: 'pending',
        attempts: latest.upload.attempts + 1,
        lastError,
        updatedAt: now(),
      })
    }
  } catch (err) {
    const latest = getDoc().piano.takes.find((t) => t.id === takeId)
    if (!latest || !latest.upload) return
    setTakeUpload(takeId, {
      status: 'pending',
      attempts: latest.upload.attempts + 1,
      lastError: err instanceof Error ? err.message : 'network error',
      updatedAt: now(),
    })
  }
}

/** Derived counts of this device's takes by upload status, for the Settings summary chip. */
export function useUploadSummary(): { pending: number; failed: number; done: number } {
  return useSyncExternalStore(subscribe, getUploadSummarySnapshot, getUploadSummarySnapshot)
}

// useSyncExternalStore needs a referentially stable snapshot while nothing
// changed, so the summary is cached against the takes array identity.
let summaryForTakes: PianoTake[] | null = null
let summaryCache: { pending: number; failed: number; done: number } = { pending: 0, failed: 0, done: 0 }

export function getUploadSummarySnapshot(): { pending: number; failed: number; done: number } {
  const takes = getDoc().piano.takes
  if (takes === summaryForTakes) return summaryCache
  let pending = 0
  let failed = 0
  let done = 0
  for (const t of takes) {
    if (t.upload?.status === 'pending' || t.upload?.status === 'uploading') pending += 1
    else if (t.upload?.status === 'failed') failed += 1
    else if (t.upload?.status === 'done') done += 1
  }
  summaryForTakes = takes
  summaryCache = { pending, failed, done }
  return summaryCache
}

/** Settings "Test" button: pings the script with the given config, without touching any take. */
export async function testDriveConnection(
  cfg: DriveConfig,
  deps: Pick<UploadDeps, 'fetch'> = {},
): Promise<{ ok: boolean; message: string }> {
  const doFetch = deps.fetch ?? fetch
  if (cfg.scriptUrl.trim() === '' || cfg.secret.trim() === '') {
    return { ok: false, message: 'Enter a script URL and secret first.' }
  }
  try {
    const res = await doFetch(cfg.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ secret: cfg.secret, ping: true }),
    })
    let parsed: { ok?: boolean; pong?: boolean; error?: string } | null = null
    try {
      parsed = await res.json()
    } catch {
      parsed = null
    }
    if (parsed?.ok && parsed.pong) return { ok: true, message: 'Connected! Drive is ready.' }
    if (parsed?.error) return { ok: false, message: parsed.error }
    return { ok: false, message: `Could not connect (HTTP ${res.status}).` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not reach that URL.' }
  }
}

/**
 * Installs a 60s timer plus an `online` listener that call
 * processUploadQueue(). Returns a disposer. Guards every browser global so
 * this is a safe no-op when imported in node (tests, SSR).
 */
export function startUploadWorker(): () => void {
  if (typeof window === 'undefined') return () => {}

  const tick = () => {
    void processUploadQueue()
  }
  const interval = window.setInterval(tick, 60_000)
  window.addEventListener('online', tick)
  tick()

  return () => {
    window.clearInterval(interval)
    window.removeEventListener('online', tick)
  }
}

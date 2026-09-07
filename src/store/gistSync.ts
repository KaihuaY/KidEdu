import { useSyncExternalStore } from 'react'
import { exportJson, getDoc, importJson, mergeDocs, subscribe, type ProgressDoc } from './progress'

// ---------------------------------------------------------------------------
// GitHub Gist sync: keeps ProgressDoc backed up to (and synced across
// devices via) a single private gist containing one JSON file. This is a
// deliberately simple "last-writer-wins per section" sync, not a CRDT - see
// mergeDocs() in progress.ts for the exact merge semantics.
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'cubeclimb.gh.token'
const GIST_ID_KEY = 'cubeclimb.gh.gistId'
const GIST_FILENAME = 'cubeclimb-progress.json'
const GIST_DESCRIPTION = 'CubeClimb progress (auto-synced - do not rename the file)'
const DEBOUNCE_MS = 2000
const RETRY_MS = 30000
const POLL_MS = 60000

export type SyncStatus = 'off' | 'loading' | 'saved' | 'saving' | 'offline' | 'expired' | 'error'

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

// --- token storage -----------------------------------------------------

export function getToken(): string | null {
  if (!hasLocalStorage()) return null
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // ignore - storage may be unavailable (private browsing, quota, etc.)
  }
}

export function clearToken(): void {
  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(GIST_ID_KEY)
    } catch {
      // ignore
    }
  }
  stop()
  setStatus('off')
}

function getCachedGistId(): string | null {
  if (!hasLocalStorage()) return null
  try {
    return localStorage.getItem(GIST_ID_KEY)
  } catch {
    return null
  }
}

function setCachedGistId(id: string): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(GIST_ID_KEY, id)
  } catch {
    // ignore
  }
}

// --- status observable ---------------------------------------------------

let status: SyncStatus = 'off'
const statusListeners = new Set<() => void>()

function setStatus(next: SyncStatus): void {
  if (status === next) return
  status = next
  for (const listener of statusListeners) listener()
}

export function getStatus(): SyncStatus {
  return status
}

export function subscribeStatus(cb: () => void): () => void {
  statusListeners.add(cb)
  return () => statusListeners.delete(cb)
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeStatus, getStatus, getStatus)
}

// --- sync engine -----------------------------------------------------------

let gistId: string | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeStore: (() => void) | null = null
let started = false
// True while we're writing a remote-originated change into the local store,
// so the store-change listener that triggers uploads can tell "this change
// came from the server" apart from "this change came from the user" and
// avoid immediately re-uploading what was just downloaded (an echo loop).
let applyingRemote = false
let lastSyncedJson: string | null = null
let lastKnownRemoteUpdatedAt: string | null = null

interface GistFile {
  content?: string
  truncated?: boolean
}
interface GistSummary {
  id: string
  files: Record<string, GistFile>
}
interface GistDetail extends GistSummary {
  updated_at: string
}

async function githubFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken()
  if (!token) throw new Error('CubeClimb: no GitHub token set')
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      ...(init?.headers ?? {}),
    },
  })
}

async function findOrCreateGist(): Promise<string> {
  const cached = getCachedGistId()
  if (cached) return cached

  const listRes = await githubFetch('/gists?per_page=100')
  if (listRes.status === 401) {
    setStatus('expired')
    throw new Error('CubeClimb: GitHub token expired or invalid')
  }
  if (!listRes.ok) throw new Error(`CubeClimb: failed to list gists (${listRes.status})`)
  const gists = (await listRes.json()) as GistSummary[]
  const existing = gists.find((g) => Object.prototype.hasOwnProperty.call(g.files, GIST_FILENAME))
  if (existing) {
    setCachedGistId(existing.id)
    return existing.id
  }

  const createRes = await githubFetch('/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILENAME]: { content: exportJson() } },
    }),
  })
  if (createRes.status === 401) {
    setStatus('expired')
    throw new Error('CubeClimb: GitHub token expired or invalid')
  }
  if (!createRes.ok) throw new Error(`CubeClimb: failed to create gist (${createRes.status})`)
  const created = (await createRes.json()) as GistSummary
  setCachedGistId(created.id)
  return created.id
}

async function fetchGistContent(id: string): Promise<{ content: string; updatedAt: string }> {
  const res = await githubFetch(`/gists/${id}`)
  if (res.status === 401) {
    setStatus('expired')
    throw new Error('CubeClimb: GitHub token expired or invalid')
  }
  if (!res.ok) throw new Error(`CubeClimb: failed to fetch gist (${res.status})`)
  const data = (await res.json()) as GistDetail
  return { content: data.files[GIST_FILENAME]?.content ?? '', updatedAt: data.updated_at }
}

async function pushToGist(content: string): Promise<void> {
  if (!gistId) return
  setStatus('saving')
  const res = await githubFetch(`/gists/${gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [GIST_FILENAME]: { content } } }),
  })
  if (res.status === 401) {
    setStatus('expired')
    throw new Error('CubeClimb: GitHub token expired or invalid')
  }
  if (!res.ok) throw new Error(`CubeClimb: failed to save gist (${res.status})`)
  const data = (await res.json()) as GistDetail
  lastSyncedJson = content
  lastKnownRemoteUpdatedAt = data.updated_at
  setStatus('saved')
}

/**
 * Merges remote content into the local store. Returns true if, after the
 * merge, the local doc holds something the remote doesn't have yet (e.g. the
 * remote file was empty, or the merge kept a section from local because it
 * was newer) - callers use this to push the merged doc back up, which
 * matters in particular when this is running as part of a retry after a
 * failed upload: without it, the edit that failed to push would only ever
 * get merged back into `local` and never actually reach the gist.
 */
function applyRemoteContent(remoteJson: string): boolean {
  if (!remoteJson) {
    lastSyncedJson = exportJson()
    return true
  }
  let remoteDoc: ProgressDoc
  try {
    remoteDoc = JSON.parse(remoteJson) as ProgressDoc
  } catch {
    return false
  }
  applyingRemote = true
  try {
    const merged = mergeDocs(getDoc(), remoteDoc)
    importJson(JSON.stringify(merged))
    lastSyncedJson = exportJson()
  } finally {
    applyingRemote = false
  }
  return lastSyncedJson !== remoteJson
}

function scheduleUpload(): void {
  // This change was us applying a download, not a local edit - don't
  // immediately turn around and re-upload it.
  if (applyingRemote) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const content = exportJson()
    if (content === lastSyncedJson) return
    pushToGist(content).catch(() => {
      if (status !== 'expired') scheduleRetry()
    })
  }, DEBOUNCE_MS)
}

function scheduleRetry(): void {
  setStatus('offline')
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    void trySync()
  }, RETRY_MS)
}

/** Pushes the current doc immediately (bypassing the debounce) after a merge revealed the remote is behind. */
function pushMergedResult(): void {
  pushToGist(exportJson()).catch(() => {
    if (status !== 'expired') scheduleRetry()
  })
}

async function trySync(): Promise<void> {
  try {
    if (!gistId) gistId = await findOrCreateGist()
    const remote = await fetchGistContent(gistId)
    lastKnownRemoteUpdatedAt = remote.updatedAt
    const needsPush = applyRemoteContent(remote.content)
    if (!unsubscribeStore) {
      unsubscribeStore = subscribe(scheduleUpload)
    }
    setStatus('saved')
    // Important on a retry after a failed push: the edit that failed to
    // upload was just merged back into the local doc above, but merging
    // alone never re-sends it - without this it would silently never reach
    // the gist until the user happened to make another edit.
    if (needsPush) pushMergedResult()
  } catch {
    if (status !== 'expired') scheduleRetry()
  }
}

async function pollForRemoteChanges(): Promise<void> {
  if (!gistId || document.visibilityState !== 'visible') return
  try {
    const res = await githubFetch(`/gists/${gistId}`)
    if (res.status === 401) {
      setStatus('expired')
      return
    }
    if (!res.ok) return
    const data = (await res.json()) as GistDetail
    if (data.updated_at !== lastKnownRemoteUpdatedAt) {
      const remote = await fetchGistContent(gistId)
      lastKnownRemoteUpdatedAt = remote.updatedAt
      if (applyRemoteContent(remote.content)) pushMergedResult()
    }
  } catch {
    // A missed poll is harmless; the next 60s tick (or a local edit) tries again.
  }
}

/** Starts syncing. No-op if there's no token yet, or if already started. */
export function start(): void {
  if (started) return
  if (!getToken()) {
    setStatus('off')
    return
  }
  started = true
  setStatus('loading')
  void trySync()

  if (typeof document !== 'undefined') {
    pollTimer = setInterval(() => {
      void pollForRemoteChanges()
    }, POLL_MS)
  }
}

/** Stops syncing and clears all in-memory sync state (token is left alone). */
export function stop(): void {
  started = false
  if (debounceTimer) clearTimeout(debounceTimer)
  if (retryTimer) clearTimeout(retryTimer)
  if (pollTimer) clearInterval(pollTimer)
  debounceTimer = null
  retryTimer = null
  pollTimer = null
  if (unsubscribeStore) {
    unsubscribeStore()
    unsubscribeStore = null
  }
  gistId = null
  lastSyncedJson = null
  lastKnownRemoteUpdatedAt = null
}

// Where the automatic progress backups live: IndexedDB, not localStorage.
//
// Why (2026-10-15 sync incident): Safari gives the whole app about 2.6 million
// characters of localStorage. Nora's progress doc reached 1.04 million, and
// ONE pretty-printed backup of it was 1.8 million - so after any new build
// (which always takes a backup) saving the doc itself started failing
// silently. A reload then brought back an old saved copy, and sync pushed
// that copy's old sections over newer ones. Backups now sit in IndexedDB
// (a far larger budget) as one record per kid, so localStorage only ever
// holds the live doc.
//
// The API stays synchronous for progress.ts: an in-memory list is the source
// of truth for the session, filled from IndexedDB in the background and
// written back after every change. With no IndexedDB (tests, very old
// browsers) the caller falls back to localStorage, exactly as before.

export interface StoredBackup {
  savedAt: number
  buildId: string
  json: string
}

const DB_NAME = 'cubeclimb.backups'
const STORE_NAME = 'lists'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

/** True when this browser can hold the backups in IndexedDB. */
export function backupDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

/** Every backup stored for `key` (one list per kid), oldest first. Empty on any failure. */
export async function loadBackupList(key: string): Promise<StoredBackup[]> {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as StoredBackup[]) : [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

/** Replaces the stored list for `key`. Resolves false if it could not be written. */
export async function saveBackupList(key: string, list: StoredBackup[]): Promise<boolean> {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(list, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    })
  } catch {
    return false
  }
}

/** Two lists of backups as one, deduplicated by savedAt + buildId, oldest first, newest `max` kept. */
export function combineBackups(a: StoredBackup[], b: StoredBackup[], max: number): StoredBackup[] {
  const seen = new Set<string>()
  const out: StoredBackup[] = []
  for (const entry of [...a, ...b].sort((x, y) => x.savedAt - y.savedAt)) {
    const id = `${entry.savedAt}|${entry.buildId}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push(entry)
  }
  return out.slice(-max)
}

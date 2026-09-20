// Raw IndexedDB store for piano-take chroma fingerprints (see
// src/audio/takeAnalysis.ts's Fingerprint), keyed by take id. Used by
// src/store/coach.ts to find a piece's best-so-far reference take and to
// compare a new take against it (compareToReference). This is local-only,
// per-device, per-kid data - never synced - so a fingerprint is only ever as
// good as whatever takes were analysed on this device. Mirrors the shape of
// src/store/recordings.ts (open-on-first-use IDBFactory wrapper, an explicit
// factory param for tests).

import { kidKey } from './kid'
import type { Fingerprint } from '../audio/takeAnalysis'

export interface StoredFingerprint {
  takeId: string
  /** null for a free-play take (no piece to compare it against). */
  pieceId: string | null
  blockSec: Fingerprint['blockSec']
  blocks: Fingerprint['blocks']
  data: Float32Array | number[]
  at: number
}

export interface AnalysisStore {
  putFingerprint(fp: StoredFingerprint): Promise<void>
  getFingerprint(takeId: string): Promise<StoredFingerprint | null>
  /** Every stored fingerprint for one piece, oldest first. */
  fingerprintsForPiece(pieceId: string): Promise<StoredFingerprint[]>
}

const DB_NAME = 'cubeclimb.analysis'
const STORE_NAME = 'fingerprints'
const PIECE_INDEX = 'pieceId'
const DB_VERSION = 1
const MAX_PER_PIECE = 40

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function promisifyTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

class IndexedDbAnalysisStore implements AnalysisStore {
  private readonly factory: IDBFactory
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(factory: IDBFactory) {
    this.factory = factory
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        // Resolved at open time (not module load) so this device's current
        // kid decides which database it opens - same rule as recordings.ts.
        const request = this.factory.open(kidKey(DB_NAME), DB_VERSION)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'takeId' })
            store.createIndex(PIECE_INDEX, 'pieceId')
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }
    return this.dbPromise
  }

  async putFingerprint(fp: StoredFingerprint): Promise<void> {
    const db = await this.openDb()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(fp)
    await promisifyTx(tx)
    if (fp.pieceId) await this.pruneToNewest(fp.pieceId)
  }

  async getFingerprint(takeId: string): Promise<StoredFingerprint | null> {
    const db = await this.openDb()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const record = await promisifyRequest<StoredFingerprint | undefined>(tx.objectStore(STORE_NAME).get(takeId))
    return record ?? null
  }

  async fingerprintsForPiece(pieceId: string): Promise<StoredFingerprint[]> {
    const db = await this.openDb()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const records = await promisifyRequest<StoredFingerprint[]>(
      tx.objectStore(STORE_NAME).index(PIECE_INDEX).getAll(pieceId),
    )
    return records.sort((a, b) => a.at - b.at)
  }

  /** Keeps only the 40 most recent fingerprints for `pieceId`, deleting any older ones. */
  private async pruneToNewest(pieceId: string): Promise<void> {
    const db = await this.openDb()
    const readTx = db.transaction(STORE_NAME, 'readonly')
    const records = await promisifyRequest<StoredFingerprint[]>(
      readTx.objectStore(STORE_NAME).index(PIECE_INDEX).getAll(pieceId),
    )
    if (records.length <= MAX_PER_PIECE) return
    const staleIds = records
      .slice()
      .sort((a, b) => b.at - a.at) // newest first
      .slice(MAX_PER_PIECE)
      .map((r) => r.takeId)
    const writeTx = db.transaction(STORE_NAME, 'readwrite')
    const store = writeTx.objectStore(STORE_NAME)
    for (const id of staleIds) store.delete(id)
    await promisifyTx(writeTx)
  }
}

/** A store that quietly does nothing, for platforms without IndexedDB. */
function createNoopAnalysisStore(): AnalysisStore {
  return {
    async putFingerprint(_fp: StoredFingerprint): Promise<void> {},
    async getFingerprint(_takeId: string): Promise<StoredFingerprint | null> {
      return null
    },
    async fingerprintsForPiece(_pieceId: string): Promise<StoredFingerprint[]> {
      return []
    },
  }
}

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

export function openAnalysisStore(factory?: IDBFactory): AnalysisStore {
  const resolvedFactory = factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined)
  if (!resolvedFactory) {
    throw new Error('IndexedDB is not available')
  }
  return new IndexedDbAnalysisStore(resolvedFactory)
}

let defaultStore: AnalysisStore | null = null

export function getAnalysisStore(): AnalysisStore {
  if (!defaultStore) {
    defaultStore = isIndexedDbAvailable() ? openAnalysisStore() : createNoopAnalysisStore()
  }
  return defaultStore
}

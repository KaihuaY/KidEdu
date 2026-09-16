// Which kid this device belongs to. Each kid has her own progress document,
// recordings database and per-device UI state; the kid is chosen once, by
// the secret word typed at the Gate (or `&kid=` on the setup link), and
// stored here. Reading it is synchronous and cheap because every store
// needs it at module load.
//
// Storage-key rule: Nora's keys keep the exact names they had before the
// app knew about kids (`cubeclimb.progress`, `cubeclimb.recordings`, the
// gist file `cubeclimb-progress.json`, ...), so an existing device carries
// on with zero migration. Any other kid gets the same base name with
// `.<kidId>` appended. Never change this rule without a data migration.

export type KidId = 'nora' | 'amelia'

export const DEFAULT_KID: KidId = 'nora'

/** Friendly display name for each kid id, e.g. for the header and defaults.settings.kidName. */
export const KID_NAMES: Record<KidId, string> = {
  nora: 'Nora',
  amelia: 'Amelia',
}

const KID_KEY = 'cubeclimb.kid'
const UNLOCKED_KEY = 'cubeclimb.unlocked'

export function isKidId(value: unknown): value is KidId {
  return value === 'nora' || value === 'amelia'
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

/** The kid this device belongs to; `nora` when nothing was ever chosen (every pre-kid device). */
export function getKid(): KidId {
  if (!hasLocalStorage()) return DEFAULT_KID
  try {
    const raw = localStorage.getItem(KID_KEY)
    return isKidId(raw) ? raw : DEFAULT_KID
  } catch {
    return DEFAULT_KID
  }
}

/** Assigns this device to a kid. Callers reload the page afterwards so every store re-reads its keys. */
export function setKid(id: KidId): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(KID_KEY, id)
  } catch {
    // Storage disabled: the device just stays on the default kid.
  }
}

/** Forgets the device's kid (used by "Lock this device now"). */
export function clearKid(): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.removeItem(KID_KEY)
  } catch {
    // ignore
  }
}

/** Friendly display name for `id` (defaults to the current device's kid). */
export function kidDisplayName(id: KidId = getKid()): string {
  return KID_NAMES[id]
}

/** Re-locks the device: forgets both the unlock flag and which kid it belongs to. */
export function lockDevice(): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.removeItem(UNLOCKED_KEY)
  } catch {
    // ignore
  }
  clearKid()
}

/**
 * Per-kid storage key: `base` unchanged for Nora, `${base}.${kid}` for anyone
 * else. Works for localStorage/sessionStorage keys, IndexedDB names and the
 * gist file stem alike.
 */
export function kidKey(base: string, kid: KidId = getKid()): string {
  return kid === DEFAULT_KID ? base : `${base}.${kid}`
}

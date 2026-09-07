import { useSyncExternalStore } from 'react'

// Which profile (kid/parent) is currently driving the UI. Kept separate from
// ProgressDoc (src/store/progress.ts) since it's local device UI state, not
// data that should ever sync across devices via the gist - but it does
// persist in localStorage so the app reopens on whichever profile it was
// last left on, as every screen needs to know "whose progress am I showing".

export type ProfileId = 'kid' | 'parent'

const STORAGE_KEY = 'cubeclimb.activeProfile'

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function readInitial(): ProfileId {
  if (hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === 'kid' || raw === 'parent') return raw
    } catch {
      // fall through to default
    }
  }
  return 'kid'
}

let active: ProfileId = readInitial()
const listeners = new Set<() => void>()

export function getActiveProfile(): ProfileId {
  return active
}

export function setActiveProfile(next: ProfileId): void {
  if (active === next) return
  active = next
  if (hasLocalStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore - just won't survive a reload
    }
  }
  for (const listener of listeners) listener()
}

export function toggleActiveProfile(): void {
  setActiveProfile(active === 'kid' ? 'parent' : 'kid')
}

export function subscribeActiveProfile(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useActiveProfile(): ProfileId {
  return useSyncExternalStore(subscribeActiveProfile, getActiveProfile, getActiveProfile)
}

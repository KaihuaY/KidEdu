// Light/Dark, per device - not per kid, never synced. Unlike kid.ts this
// never uses kidKey() and never touches cubeclimb.progress or any other
// synced key: it is purely a local display preference for whichever device
// is being looked at (a parent's phone vs. the kid's tablet might disagree,
// and that's fine). Read via getTheme()/applyTheme() as early as possible
// (see index.html's inline script and main.tsx) so there's no light-mode
// flash before React mounts.

import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'cubeclimb.theme'

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

/** The device's theme; 'light' when nothing was ever chosen or storage is unavailable/garbage. */
export function getTheme(): Theme {
  if (!hasLocalStorage()) return 'light'
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Applies `t` to the document so CSS's `:root[data-theme="dark"]` block takes over. No-op without a `document` (node/tests). */
export function applyTheme(t: Theme): void {
  if (typeof document === 'undefined') return
  if (t === 'dark') {
    document.documentElement.dataset.theme = 'dark'
  } else {
    delete document.documentElement.dataset.theme
  }
}

const listeners = new Set<() => void>()

/** Persists `t`, applies it to the document, and notifies useTheme() subscribers. */
export function setTheme(t: Theme): void {
  if (hasLocalStorage()) {
    try {
      localStorage.setItem(KEY, t)
    } catch {
      // Storage disabled: the device just falls back to reading 'light' each time.
    }
  }
  applyTheme(t)
  for (const listener of listeners) listener()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, getTheme)
}

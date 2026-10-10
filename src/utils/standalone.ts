/**
 * True when the app runs as an installed Home Screen app rather than in a
 * browser tab. Matters for sync setup: on iOS the installed app and Safari
 * keep SEPARATE storage, so a setup link opened in Safari never reaches the
 * installed app - the sync key has to be pasted inside the app instead.
 */
export function isStandaloneApp(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const nav = window.navigator as Navigator & { standalone?: boolean }
    if (nav.standalone === true) return true
    return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  } catch {
    return false
  }
}

/** "just now", "3 min ago", "2 hours ago", "5 days ago". */
export function agoLabel(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms)
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

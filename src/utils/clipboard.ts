// Clipboard + share helpers for moving the family sync key between iPads.
// All best-effort: every call resolves to a boolean/string and never throws,
// because iOS only grants these inside a tap and may still refuse.

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export async function readClipboardText(): Promise<string> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return ''
    return (await navigator.clipboard.readText()) ?? ''
  } catch {
    return ''
  }
}

/** Opens the native share sheet with `text` + `url`; falls back to copying the url. */
export async function shareText(text: string, url: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: 'Practice', text, url })
      return true
    }
  } catch {
    // user cancelled or unsupported - fall through to copy
  }
  return copyText(url)
}

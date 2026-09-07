// The "secret word" that unlocks CubeClimb on a new device.
// Stored as a SHA-256 hex digest so the plain word never sits in the source.
//
// change with: node scripts/hash-password.mjs <new word>
export const FAMILY_PASSWORD_SHA256 = 'd73d3e7a7e1d181671a57ff8583f070a1100a5e92ba6494eaf846242af8021b7'

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Checks a guessed secret word against FAMILY_PASSWORD_SHA256.
 * Never throws - if crypto.subtle is unavailable (very old browser, non-secure
 * context, etc.) it simply returns false instead of locking the app up.
 */
export async function checkSecret(word: string): Promise<boolean> {
  try {
    const normalized = word.trim().toLowerCase()
    if (!normalized) return false
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return false
    const data = new TextEncoder().encode(normalized)
    const digest = await subtle.digest('SHA-256', data)
    return toHex(digest) === FAMILY_PASSWORD_SHA256
  } catch {
    return false
  }
}

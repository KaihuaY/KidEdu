// The "secret word" that unlocks CubeClimb on a new device. Each kid has her
// own word; the device is assigned to whichever kid's word was typed.
// Stored as SHA-256 hex digests so the plain words never sit in the source.
//
// change with: node scripts/hash-password.mjs <new word>
import type { KidId } from '../store/kid'

export interface KidSecret {
  id: KidId
  name: string
  secretSha256: string
}

export const KIDS: KidSecret[] = [
  { id: 'nora', name: 'Nora', secretSha256: 'd73d3e7a7e1d181671a57ff8583f070a1100a5e92ba6494eaf846242af8021b7' },
  { id: 'amelia', name: 'Amelia', secretSha256: '525eca1d5089dbdcbb6700d910c5e0bc23fbaa23ee026c0e224c2b45490e5f29' },
]

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Checks a guessed secret word against every kid's secretSha256, returning
 * the matching kid's id, or null if it matches nobody. Never throws - if
 * crypto.subtle is unavailable (very old browser, non-secure context, etc.)
 * it simply returns null instead of locking the app up.
 */
export async function checkSecret(word: string): Promise<KidId | null> {
  try {
    const normalized = word.trim().toLowerCase()
    if (!normalized) return null
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return null
    const data = new TextEncoder().encode(normalized)
    const digest = await subtle.digest('SHA-256', data)
    const hex = toHex(digest)
    const match = KIDS.find((k) => k.secretSha256 === hex)
    return match ? match.id : null
  } catch {
    return null
  }
}

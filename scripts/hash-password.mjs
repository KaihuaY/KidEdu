#!/usr/bin/env node
// Prints the SHA-256 hex digest of a secret word, for CubeClimb's lock screen.
//
// Usage: node scripts/hash-password.mjs <new word>

import { createHash } from 'node:crypto'

const word = (process.argv[2] ?? '').trim().toLowerCase()

if (!word) {
  console.error('Usage: node scripts/hash-password.mjs <new word>')
  process.exit(1)
}

const hash = createHash('sha256').update(word).digest('hex')

console.log(hash)
console.log(`Paste this as FAMILY_PASSWORD_SHA256 in src/content/access.ts, then push.`)

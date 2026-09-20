// "Nothing was lost" check between a backup of a kid's progress document and
// a later version of it (the live gist file, or the app's own export).
//
//   node scripts/verify-progress.mjs <backup.json> <later.json>
//
// Passes only when the later document is a superset of the backup: every
// take still there with the same facts, counters not lower, settings intact.
// Allowed differences: additive fields (ai, journeys, new takes/cards/...),
// and the documented doc diet (per-take `onsets` dropped once `ai.metrics`
// exists, `waveform` dropped on takes older than 14 days).
// Exit code 0 = OK, 1 = something is missing (details printed).

import { readFileSync } from 'node:fs'

const [backupPath, laterPath] = process.argv.slice(2)
if (!backupPath || !laterPath) {
  console.error('usage: node scripts/verify-progress.mjs <backup.json> <later.json>')
  process.exit(2)
}
const a = JSON.parse(readFileSync(backupPath, 'utf8'))
const b = JSON.parse(readFileSync(laterPath, 'utf8'))
const problems = []
const notes = []
const fail = (msg) => problems.push(msg)

function notLower(label, before, after) {
  if ((after ?? 0) < (before ?? 0)) fail(`${label} went down: ${before} -> ${after}`)
}
function sameJson(label, x, y) {
  if (JSON.stringify(x) !== JSON.stringify(y)) fail(`${label} changed`)
}
function idsKept(label, before = [], after = [], key = 'id') {
  const have = new Set(after.map((x) => x[key]))
  const missing = before.filter((x) => !have.has(x[key]))
  if (missing.length) fail(`${label}: ${missing.length} missing (${missing.slice(0, 3).map((x) => x[key]).join(', ')}...)`)
}

// --- piano takes -----------------------------------------------------------
const later = new Map((b.piano?.takes ?? []).map((t) => [t.id, t]))
const TAKE_FACTS = ['day', 'pieceId', 'isNote', 'startedAt', 'durationSec', 'activeSec', 'selfRating', 'goalHit', 'repetitions', 'mimeType', 'sizeBytes', 'deviceId']
let dietOnsets = 0
let dietWaveform = 0
for (const t of a.piano?.takes ?? []) {
  const n = later.get(t.id)
  if (!n) {
    fail(`take ${t.id} (${t.day}) is gone`)
    continue
  }
  for (const k of TAKE_FACTS) if (JSON.stringify(t[k]) !== JSON.stringify(n[k])) fail(`take ${t.id}: ${k} changed ${JSON.stringify(t[k])} -> ${JSON.stringify(n[k])}`)
  if (t.upload?.driveFileId && n.upload?.driveFileId !== t.upload.driveFileId) fail(`take ${t.id}: Drive link lost`)
  if (t.onsets && !n.onsets) {
    if (n.ai?.metrics) dietOnsets++
    else fail(`take ${t.id}: onsets dropped without ai.metrics`)
  }
  if (t.waveform && !n.waveform) dietWaveform++
}
notes.push(`doc diet: onsets dropped on ${dietOnsets} takes, waveform on ${dietWaveform}`)
for (const [day, d] of Object.entries(a.piano?.days ?? {})) {
  const n = b.piano?.days?.[day]
  if (!n) fail(`piano day ${day} is gone`)
  else for (const k of ['goalReachedAt', 'parentStars', 'parentRatedAt']) if (d[k] !== undefined && n[k] !== d[k]) fail(`piano day ${day}: ${k} changed`)
}
notLower('piano streak best', a.piano?.streak?.best, b.piano?.streak?.best)

// --- profile, rewards, collection, notes, settings --------------------------
const ka = a.profiles?.kid ?? {}
const kb = b.profiles?.kid ?? {}
notLower('xp', ka.xp, kb.xp)
notLower('cube streak best', ka.streak?.best, kb.streak?.best)
notLower('sessions', ka.sessions?.length, kb.sessions?.length)
for (const [holdId, hold] of Object.entries(ka.holds ?? {})) {
  for (const [mid, m] of Object.entries(hold.missions ?? {})) {
    if (m.completedAt && !kb.holds?.[holdId]?.missions?.[mid]?.completedAt) fail(`mission ${holdId}/${mid} lost its completion`)
  }
  if (hold.masteredAt && !kb.holds?.[holdId]?.masteredAt) fail(`hold ${holdId} lost mastery`)
}
// Tokens are spendable: compare tokens + boxes opened, which can only grow.
const spent = (d) => (d.rewards?.boxHistory ?? []).length
const tokenSum = (k) => (k.tokens?.gold ?? 0) + (k.tokens?.silver ?? 0) + (k.tokens?.bronze ?? 0)
notLower('tokens + boxes opened', tokenSum(ka) + spent(a), tokenSum(kb) + spent(b))
idsKept('tickets', a.rewards?.tickets, b.rewards?.tickets)
idsKept('badges', a.rewards?.badges, b.rewards?.badges)
notLower('stickers', a.rewards?.stickers?.length, b.rewards?.stickers?.length)
idsKept('custom stickers', a.rewards?.customStickers, b.rewards?.customStickers)
idsKept('collection cards', a.collection?.items, b.collection?.items)
idsKept('bracelets', a.collection?.bracelets, b.collection?.bracelets)
const beadsAndPlaced = (d) => Object.values(d.collection?.beads ?? {}).reduce((x, y) => x + y, 0) + (d.collection?.bracelets ?? []).reduce((n, br) => n + br.beads.filter(Boolean).length, 0)
notLower('beads (tray + on bracelets)', beadsAndPlaced(a), beadsAndPlaced(b))
idsKept('notes', a.notes?.items, b.notes?.items)
notLower('solves', a.solveLog?.solves?.length, b.solveLog?.solves?.length)
idsKept('piano pieces', a.settings?.pianoPieces, b.settings?.pianoPieces)
for (const k of ['kidName', 'pin', 'goalMinutes', 'driveUpload', 'prizePools', 'ticketChance', 'recordingKeepDays']) sameJson(`settings.${k}`, a.settings?.[k], b.settings?.[k])

// --- report ----------------------------------------------------------------
const count = (d) => ({ takes: d.piano?.takes?.length ?? 0, withAi: (d.piano?.takes ?? []).filter((t) => t.ai?.metrics).length, journeys: Object.keys(d.piano?.journeys ?? {}).length, bytes: JSON.stringify(d).length })
console.log('backup:', JSON.stringify(count(a)))
console.log('later: ', JSON.stringify(count(b)))
for (const n of notes) console.log('note:', n)
if (problems.length) {
  console.log(`FAIL - ${problems.length} problem(s):`)
  for (const p of problems.slice(0, 40)) console.log(' -', p)
  process.exit(1)
}
console.log('OK - the later document keeps everything in the backup')

// Phase 2 of the Drive backfill: merge the measured metrics from
// backfill-analysis.mjs (results.json) into the LIVE progress document in
// the sync gist - safely.
//
//   GH_TOKEN=... node scripts/backfill-apply.mjs <outDir with results.json> [--kid nora] [--dry]
//
// Safety net (each step must pass or nothing is written / it is rolled back):
//   1. fetch the live file and save a timestamped backup next to results.json and in BACKUP_DIR
//   2. build the new document in memory (adds take.ai.metrics, drops take.onsets)
//   3. verify-progress.mjs backup -> new document must say OK          (before writing)
//   4. PATCH only this kid's file
//   5. re-fetch, verify-progress.mjs backup -> live must say OK        (after writing)
//      on failure: PATCH the backup back and exit 1
// Idempotent: takes that already have ai.metrics are left alone, so it can be re-run.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const outDir = args.find((a) => !a.startsWith('--'))
const dry = args.includes('--dry')
const kid = args.includes('--kid') ? args[args.indexOf('--kid') + 1] : 'nora'
const token = process.env.GH_TOKEN
if (!outDir || !token) {
  console.error('usage: GH_TOKEN=... node scripts/backfill-apply.mjs <outDir> [--kid nora] [--dry]')
  process.exit(2)
}
const BACKUP_DIR = process.env.BACKUP_DIR ?? 'D:/AI/KidEdu/backups'
const fileName = kid === 'nora' ? 'cubeclimb-progress.json' : `cubeclimb-progress.${kid}.json`
const here = dirname(fileURLToPath(import.meta.url))
const MIN_MATCH = 0.5 // below this the take was probably other music: keep only matchToBest

const gh = (path, init = {}) => fetch('https://api.github.com' + path, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(init.headers ?? {}) } })

async function fetchLive() {
  const gists = await (await gh('/gists?per_page=100')).json()
  const gist = gists.find((g) => Object.prototype.hasOwnProperty.call(g.files, fileName))
  if (!gist) throw new Error('gist file not found: ' + fileName)
  const detail = await (await gh('/gists/' + gist.id)).json()
  const file = detail.files[fileName]
  const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content
  JSON.parse(content)
  return { gistId: gist.id, content }
}

function verify(backupPath, laterPath) {
  try {
    const out = execFileSync(process.execPath, [join(here, 'verify-progress.mjs'), backupPath, laterPath], { encoding: 'utf8' })
    console.log(out.trim().split('\n').map((l) => '    ' + l).join('\n'))
    return true
  } catch (err) {
    console.log(String(err.stdout ?? err.message))
    return false
  }
}

const { results } = JSON.parse(readFileSync(join(outDir, 'results.json'), 'utf8'))
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const live = await fetchLive()
mkdirSync(BACKUP_DIR, { recursive: true })
const backupPath = join(BACKUP_DIR, `${fileName.replace(/\.json$/, '')}-${stamp}-pre-backfill.json`)
writeFileSync(backupPath, live.content)
writeFileSync(join(outDir, `pre-backfill-${stamp}.json`), live.content)
console.log('1. backup saved:', backupPath, `(${live.content.length} bytes)`)

const doc = JSON.parse(live.content)
const now = Date.now()
let added = 0
let skipped = 0
let unknown = 0
for (const take of doc.piano.takes) {
  const r = results[take.id]
  if (take.isNote) continue
  if (!r?.metrics) {
    unknown++
    continue
  }
  if (take.ai?.metrics) {
    skipped++
    continue
  }
  const metrics = { ...r.metrics }
  const c = r.compare
  if (c) {
    metrics.matchToBest = c.matchToBest
    if (c.matchToBest >= MIN_MATCH) {
      metrics.coverage = c.coverage
      metrics.stumbles = c.stumbles
      metrics.paceVsBest = c.pace
    }
  }
  take.ai = { ...(take.ai ?? {}), metrics, at: now }
  delete take.onsets
  added++
}
doc.piano.updatedAt = now
const nextContent = JSON.stringify(doc)
const nextPath = join(outDir, `post-backfill-${stamp}.json`)
writeFileSync(nextPath, nextContent)
console.log(`2. new document built: metrics added to ${added} takes, ${skipped} already had them, ${unknown} takes not in results (newer than the analysis); ${live.content.length} -> ${nextContent.length} bytes`)

console.log('3. verify before writing:')
if (!verify(backupPath, nextPath)) {
  console.error('ABORT: the new document would lose something. Nothing was written.')
  process.exit(1)
}
if (dry) {
  console.log('dry run: stopping before the write')
  process.exit(0)
}

const res = await gh('/gists/' + live.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [fileName]: { content: nextContent } } }) })
if (!res.ok) {
  console.error('ABORT: PATCH failed', res.status, await res.text())
  process.exit(1)
}
console.log('4. written to the gist')

const after = await fetchLive()
const afterPath = join(outDir, `live-after-${stamp}.json`)
writeFileSync(afterPath, after.content)
console.log('5. verify after writing:')
if (!verify(backupPath, afterPath)) {
  console.error('ROLLING BACK: restoring the backup')
  const back = await gh('/gists/' + live.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [fileName]: { content: live.content } } }) })
  console.error(back.ok ? 'backup restored' : 'RESTORE FAILED - restore manually from ' + backupPath)
  process.exit(1)
}
console.log('done')

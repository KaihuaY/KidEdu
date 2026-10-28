// Full backup of every kid progress file in the private sync gist, with a
// manifest entry per file (size, sha256, an inventory of what it holds).
//
// Usage (PowerShell):  $env:GH_TOKEN = (gh auth token); node scripts/backup-gist.mjs <label>
// Writes to D:/AI/KidEdu/backups (override with BACKUP_DIR). The token is read
// from the environment only and never written anywhere.
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'

const label = process.argv[2] ?? 'manual'
const token = process.env.GH_TOKEN
if (!token) throw new Error('GH_TOKEN missing - run: $env:GH_TOKEN = (gh auth token)')
const outDir = process.env.BACKUP_DIR ?? 'D:/AI/KidEdu/backups'
mkdirSync(outDir, { recursive: true })

const gh = (path) => fetch('https://api.github.com' + path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' })
const FILE = /^cubeclimb-progress(?:\.[a-z]+)?\.json$/
const gists = await (await gh('/gists?per_page=100')).json()
const gist = gists.find((g) => Object.keys(g.files).some((n) => FILE.test(n)))
if (!gist) throw new Error('no progress gist found')
const detail = await (await gh('/gists/' + gist.id)).json()

export function inventory(d) {
  const kid = d.profiles?.kid ?? {}
  const missions = Object.values(kid.holds ?? {}).reduce((n, h) => n + Object.values(h.missions ?? {}).filter((m) => m.completedAt).length, 0)
  const takes = d.piano?.takes ?? []
  return {
    kidName: d.settings?.kidName,
    takes: takes.length,
    practiceTakes: takes.filter((t) => !t.isNote).length,
    uploaded: takes.filter((t) => t.upload?.status === 'done').length,
    pianoDays: Object.keys(d.piano?.days ?? {}).length,
    pianoStreak: d.piano?.streak?.current ?? 0,
    cubeStreak: kid.streak?.current ?? 0,
    xp: kid.xp ?? 0,
    tokens: kid.tokens ?? {},
    missionsDone: missions,
    sessions: (kid.sessions ?? []).length,
    stickers: (d.rewards?.stickers ?? []).length,
    tickets: (d.rewards?.tickets ?? []).length,
    badges: (d.rewards?.badges ?? []).length,
    cards: (d.collection?.items ?? []).length,
    beads: Object.values(d.collection?.beads ?? {}).reduce((n, v) => n + v, 0),
    bracelets: (d.collection?.bracelets ?? []).length,
    notes: (d.notes?.items ?? []).length,
    pieces: (d.settings?.pianoPieces ?? []).length,
    solves: (d.solveLog?.solves ?? []).length,
  }
}

const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const lines = [`\n## ${day} ${label} (gist ${gist.id}, updated ${detail.updated_at})\n`]
for (const [name, file] of Object.entries(detail.files)) {
  if (!FILE.test(name)) continue
  let text = file.content
  let note = ''
  if (file.truncated && file.raw_url) {
    text = await (await fetch(file.raw_url, { cache: 'no-store' })).text()
    note = ' (was truncated, raw fetched)'
  }
  const doc = JSON.parse(text)
  let base = `${name.replace(/\.json$/, '')}-${day}-${label}.json`
  for (let i = 2; existsSync(`${outDir}/${base}`); i++) base = `${name.replace(/\.json$/, '')}-${day}-${label}-${i}.json`
  writeFileSync(`${outDir}/${base}`, text)
  const sha = createHash('sha256').update(text).digest('hex')
  const inv = inventory(doc)
  lines.push(`- \`${base}\` · ${text.length} bytes · sha256 \`${sha}\``)
  lines.push(`  - ${JSON.stringify(inv)}`)
  console.log(`${name} -> ${base} ${text.length} bytes${note}`)
  console.log(JSON.stringify(inv))
}
appendFileSync(`${outDir}/MANIFEST.md`, lines.join('\n') + '\n')
console.log('manifest updated')

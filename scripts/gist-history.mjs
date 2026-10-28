// Walks every revision of the sync gist and prints, per kid file, a line of
// counts whenever the file changes - flagging any count that went DOWN and any
// section whose updatedAt went BACKWARDS (an old copy overwrote a newer one).
//
// Usage (PowerShell): $env:GH_TOKEN = (gh auth token); node scripts/gist-history.mjs [since ISO date] [--all]
//   --all prints every change, otherwise only drops and rollbacks.
// Revisions are cached in HISTORY_CACHE (default: %TEMP%/kidedu-gist-revs).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const token = process.env.GH_TOKEN
if (!token) throw new Error('GH_TOKEN missing - run: $env:GH_TOKEN = (gh auth token)')
const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
const since = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}/.test(a)) ?? '2026-10-01'
const all = process.argv.includes('--all')
const cache = process.env.HISTORY_CACHE ?? `${tmpdir()}/kidedu-gist-revs`
mkdirSync(cache, { recursive: true })
const SECTIONS = ['settings', 'profiles', 'rewards', 'solveLog', 'piano', 'notes', 'collection', 'teacherNotes']
const t = (x) => new Date(x).toLocaleString('en-CA', { timeZone: 'America/Toronto', hour12: false }).replace(',', '')

const gists = await (await fetch('https://api.github.com/gists?per_page=100', { headers: h })).json()
const gist = gists.find((g) => Object.keys(g.files).some((n) => /cubeclimb-progress/.test(n)))
let commits = []
for (let page = 1; page <= 20; page++) {
  const batch = await (await fetch(`https://api.github.com/gists/${gist.id}/commits?per_page=100&page=${page}`, { headers: h })).json()
  if (!Array.isArray(batch) || batch.length === 0) break
  commits = commits.concat(batch)
  if (batch[batch.length - 1].committed_at < since) break
}
commits = commits.filter((c) => c.committed_at >= since).reverse()
console.log(`gist ${gist.id}: ${commits.length} revisions since ${since}`)

async function revisionFiles(version) {
  const path = `${cache}/${version}.json`
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  const v = await (await fetch(`https://api.github.com/gists/${gist.id}/${version}`, { headers: h })).json()
  const out = {}
  for (const [name, f] of Object.entries(v.files ?? {})) {
    if (!/^cubeclimb-progress/.test(name)) continue
    out[name] = f.truncated && f.raw_url ? await (await fetch(f.raw_url)).text() : f.content
  }
  writeFileSync(path, JSON.stringify(out))
  return out
}

const metrics = (d) => {
  const k = d.profiles?.kid ?? {}
  const tk = k.tokens ?? {}
  return {
    xp: k.xp ?? 0, gold: tk.gold ?? 0, silver: tk.silver ?? 0, bronze: tk.bronze ?? 0,
    takes: d.piano?.takes?.length ?? 0, days: Object.keys(d.piano?.days ?? {}).length,
    boxes: d.rewards?.boxHistory?.length ?? 0, tickets: d.rewards?.tickets?.length ?? 0, badges: d.rewards?.badges?.length ?? 0,
    cards: d.collection?.items?.length ?? 0, bracelets: d.collection?.bracelets?.length ?? 0, songs: d.settings?.pianoPieces?.length ?? 0,
  }
}
const NEVER_DOWN = ['xp', 'takes', 'days', 'boxes', 'tickets', 'badges', 'cards', 'bracelets']
const prev = {}
const lastText = {}
for (const c of commits) {
  const files = await revisionFiles(c.version)
  for (const [name, text] of Object.entries(files)) {
    if (!text || text === lastText[name]) continue
    lastText[name] = text
    let d
    try { d = JSON.parse(text) } catch { console.log(t(c.committed_at), name, 'UNPARSABLE'); continue }
    const kid = name.replace('cubeclimb-progress', '').replace('.json', '') || '.nora'
    const m = metrics(d)
    const p = prev[name]
    const drops = p ? NEVER_DOWN.filter((k) => m[k] < p.m[k]).map((k) => `${k} ${p.m[k]}->${m[k]}`) : []
    const back = p ? SECTIONS.filter((s) => d[s]?.updatedAt && p.d[s]?.updatedAt && d[s].updatedAt < p.d[s].updatedAt).map((s) => `${s} back to ${t(d[s].updatedAt)}`) : []
    if (all || drops.length || back.length) {
      console.log(`${t(c.committed_at)} ${kid.padEnd(7)} v${c.version.slice(0, 7)} ${JSON.stringify(m)}${drops.length ? '  <<< DROP ' + drops.join(', ') : ''}${back.length ? '  <<< ROLLBACK ' + back.join(', ') : ''}`)
    }
    prev[name] = { m, d }
  }
}
for (const [name, p] of Object.entries(prev)) console.log('latest', name, JSON.stringify(p.m))

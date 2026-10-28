// Repairs a kid's gist file after one or more ROLLBACKS (an old copy of the
// doc pushed over a newer one). Read-only unless --write.
//
// Usage (PowerShell):
//   $env:GH_TOKEN = (gh auth token); node scripts/repair-rollback.mjs <since ISO> [--kid amelia] [--write]
//
// A rollback is a revision where a section's updatedAt goes BACKWARDS, or XP
// drops (XP never goes down in normal use). The repaired doc is the current
// file plus:
//   - rewards: union of every box / ticket / badge / sticker that existed just
//     before any rollback (stickers keyed id + wonAt: ids are sticker kinds);
//   - collection: the last good state (just before the first collection
//     rollback), every box opened after it replayed on top (card +1, beads),
//     plus bracelets started after the rollback, their beads taken off the tray;
//   - XP and tokens: what each profile rollback took away, given back;
//   - settings: a field equal to the old copy the rollback restored is a
//     rollback artifact (the good value comes back); anything else is a real
//     later edit and stays. Songs: the current list stands, songs lost and
//     never added back return;
//   - notes and teacher notes: union.
// Every repaired section is stamped "now" so every device takes it as newest.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const token = process.env.GH_TOKEN
if (!token) throw new Error('GH_TOKEN missing - run: $env:GH_TOKEN = (gh auth token)')
const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
const SINCE = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}/.test(a))
if (!SINCE) throw new Error('usage: repair-rollback.mjs <since ISO date> [--kid amelia] [--write]')
const kidArg = process.argv.indexOf('--kid')
const FILE = kidArg > 0 ? `cubeclimb-progress.${process.argv[kidArg + 1]}.json` : 'cubeclimb-progress.json'
const WRITE = process.argv.includes('--write')
const cache = process.env.HISTORY_CACHE ?? `${tmpdir()}/kidedu-gist-revs`
mkdirSync(cache, { recursive: true })
const SECTIONS = ['settings', 'profiles', 'rewards', 'solveLog', 'piano', 'notes', 'collection', 'teacherNotes']
const t = (x) => new Date(x).toLocaleString('en-CA', { timeZone: 'America/Toronto', hour12: false }).replace(',', '')

const gists = await (await fetch('https://api.github.com/gists?per_page=100', { headers: h })).json()
const GIST = gists.find((g) => Object.keys(g.files).some((n) => /cubeclimb-progress/.test(n))).id
let commits = []
for (let p = 1; p <= 20; p++) {
  const b = await (await fetch(`https://api.github.com/gists/${GIST}/commits?per_page=100&page=${p}`, { headers: h })).json()
  if (!Array.isArray(b) || !b.length) break
  commits.push(...b)
  if (b[b.length - 1].committed_at < SINCE) break
}
const latestVersion = commits[0].version
commits = commits.filter((c) => c.committed_at >= SINCE).reverse()

async function fileAt(version) {
  const path = `${cache}/${version}.json`
  let files
  if (existsSync(path)) files = JSON.parse(readFileSync(path, 'utf8'))
  else {
    const v = await (await fetch(`https://api.github.com/gists/${GIST}/${version}`, { headers: h })).json()
    files = {}
    for (const [name, f] of Object.entries(v.files ?? {})) {
      if (!/^cubeclimb-progress/.test(name)) continue
      files[name] = f.truncated && f.raw_url ? await (await fetch(f.raw_url)).text() : f.content
    }
    writeFileSync(path, JSON.stringify(files))
  }
  return files[FILE] ?? null
}

const states = []
let lastText = null
for (const c of commits) {
  const text = await fileAt(c.version)
  if (!text || text === lastText) continue
  lastText = text
  states.push({ at: c.committed_at, version: c.version, doc: JSON.parse(text) })
}
console.log(`${FILE}: ${commits.length} revisions since ${t(SINCE)}, ${states.length} distinct states`)

const rollbacks = []
for (let i = 1; i < states.length; i++) {
  const prev = states[i - 1].doc
  const cur = states[i].doc
  const back = SECTIONS.filter((s) => prev[s] && cur[s] && cur[s].updatedAt < prev[s].updatedAt)
  if (cur.profiles.kid.xp < prev.profiles.kid.xp && !back.includes('profiles')) back.push('profiles')
  if (back.length) rollbacks.push({ back, prev, cur, at: states[i].at })
}
for (const r of rollbacks) {
  console.log(`ROLLBACK ${t(r.at)} [${r.back.join(',')}] xp ${r.prev.profiles.kid.xp}->${r.cur.profiles.kid.xp} boxes ${r.prev.rewards.boxHistory.length}->${r.cur.rewards.boxHistory.length} cards ${r.prev.collection.items.length}->${r.cur.collection.items.length} bracelets ${r.prev.collection.bracelets.length}->${r.cur.collection.bracelets.length}`)
}
const current = states[states.length - 1].doc
if (!rollbacks.length) {
  console.log('no rollbacks found - nothing to repair')
  process.exit(0)
}

const out = JSON.parse(JSON.stringify(current))
const sources = [...rollbacks.map((r) => r.prev), current]
const unionBy = (key, lists, prefer = (a) => a) => {
  const m = new Map()
  for (const list of lists) for (const x of list ?? []) { const k = key(x); m.set(k, m.has(k) ? prefer(m.get(k), x) : x) }
  return [...m.values()]
}

// XP and tokens
let xpBack = 0
const tokBack = { gold: 0, silver: 0, bronze: 0 }
for (const r of rollbacks) {
  if (!r.back.includes('profiles')) continue
  xpBack += r.prev.profiles.kid.xp - r.cur.profiles.kid.xp
  for (const k of Object.keys(tokBack)) tokBack[k] += (r.prev.profiles.kid.tokens[k] ?? 0) - (r.cur.profiles.kid.tokens[k] ?? 0)
}
out.profiles.kid.xp = current.profiles.kid.xp + xpBack
for (const k of Object.keys(tokBack)) out.profiles.kid.tokens[k] = Math.max(0, (current.profiles.kid.tokens[k] ?? 0) + tokBack[k])

// rewards
const boxKey = (b) => `${b.openedAt}|${b.result}`
out.rewards.boxHistory = unionBy(boxKey, sources.map((d) => d.rewards.boxHistory)).sort((a, b) => a.openedAt - b.openedAt)
out.rewards.tickets = unionBy((x) => x.id, sources.map((d) => d.rewards.tickets), (a, b) => (a.redeemedAt ? a : b.redeemedAt ? b : a)).sort((a, b) => a.wonAt - b.wonAt)
out.rewards.badges = unionBy((x) => x.id, sources.map((d) => d.rewards.badges), (a, b) => (a.earnedAt <= b.earnedAt ? a : b))
out.rewards.stickers = unionBy((x) => `${x.id}|${x.wonAt}`, sources.map((d) => d.rewards.stickers)).sort((a, b) => a.wonAt - b.wonAt)
out.rewards.customStickers = unionBy((x) => x.id, sources.map((d) => d.rewards.customStickers))

// collection
const firstCollectionRollback = rollbacks.find((r) => r.back.includes('collection'))
if (firstCollectionRollback) {
  const good = firstCollectionRollback.prev
  const rolledTo = firstCollectionRollback.cur
  const goodBoxKeys = new Set(good.rewards.boxHistory.map(boxKey))
  const lastGoodBox = Math.max(0, ...good.rewards.boxHistory.map((b) => b.openedAt))
  const laterBoxes = out.rewards.boxHistory.filter((b) => !goodBoxKeys.has(boxKey(b)) && b.openedAt > lastGoodBox)
  const items = new Map(good.collection.items.map((i) => [i.id, { ...i }]))
  const beads = { ...good.collection.beads }
  for (const b of laterBoxes) {
    if (b.itemId) {
      const it = items.get(b.itemId)
      if (it) it.count += 1
      else items.set(b.itemId, { id: b.itemId, count: 1, firstAt: b.openedAt })
    }
    for (const id of b.beadIds ?? []) beads[id] = (beads[id] ?? 0) + 1
  }
  // bracelets started after the rollback are real; their beads came off the tray
  const known = new Set([...good.collection.bracelets, ...rolledTo.collection.bracelets].map((b) => b.id))
  const newBracelets = current.collection.bracelets.filter((b) => !known.has(b.id))
  let shortfall = 0
  for (const br of newBracelets) for (const id of br.beads) {
    if (!id) continue
    if ((beads[id] ?? 0) > 0) beads[id] -= 1
    else shortfall += 1
  }
  for (const k of Object.keys(beads)) if (beads[k] <= 0) delete beads[k]
  out.collection = { ...good.collection, items: [...items.values()], beads, bracelets: [...good.collection.bracelets, ...newBracelets] }
  console.log(`collection: good state ${t(good.collection.updatedAt)} + ${laterBoxes.length} later boxes; new bracelets since: ${newBracelets.map((b) => `"${b.name}"`).join(', ') || 'none'}; bead shortfall ${shortfall}`)
}

// settings
const settingsRollbacks = rollbacks.filter((r) => r.back.includes('settings'))
if (settingsRollbacks.length) {
  const rolledTo = settingsRollbacks[0].cur.settings
  const versions = [current.settings, ...settingsRollbacks.slice(1).map((r) => r.prev.settings).reverse(), settingsRollbacks[0].prev.settings]
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const merged = { ...current.settings }
  for (const key of new Set(versions.flatMap((v) => Object.keys(v)))) {
    if (key === 'pianoPieces' || key === 'updatedAt') continue
    for (const v of versions) if (!eq(v[key], rolledTo[key])) { merged[key] = v[key]; break }
  }
  const names = new Set(current.settings.pianoPieces.map((p) => p.name.trim().toLowerCase()))
  const rolledIds = new Set(rolledTo.pianoPieces.map((p) => p.id))
  const lost = []
  for (const v of versions.slice(1)) for (const p of v.pianoPieces) {
    if (current.settings.pianoPieces.some((c) => c.id === p.id) || rolledIds.has(p.id)) continue
    if (names.has(p.name.trim().toLowerCase()) || lost.some((l) => l.id === p.id)) continue
    lost.push(p)
  }
  merged.pianoPieces = [...current.settings.pianoPieces, ...lost]
  const changed = Object.keys(merged).filter((k) => k !== 'pianoPieces' && !eq(merged[k], current.settings[k]))
  console.log(`settings: fields given back: ${changed.join(', ') || 'none'}; songs given back: ${lost.map((p) => p.name.trim()).join(', ') || 'none'}`)
  for (const k of changed) console.log(`   ${k}: ${JSON.stringify(current.settings[k]).slice(0, 160)} -> ${JSON.stringify(merged[k]).slice(0, 160)}`)
  out.settings = merged
}

out.teacherNotes.items = unionBy((x) => x.id, sources.map((d) => d.teacherNotes?.items), (a, b) => (JSON.stringify(b).length >= JSON.stringify(a).length ? b : a))
out.notes.items = unionBy((x) => x.id, sources.map((d) => d.notes?.items), (a, b) => (b.dismissedAt || b.seenAt ? b : a))

const now = Date.now()
for (const s of ['settings', 'profiles', 'rewards', 'collection', 'teacherNotes', 'notes']) out[s].updatedAt = now

const sum = (d) => ({ xp: d.profiles.kid.xp, tokens: d.profiles.kid.tokens, boxes: d.rewards.boxHistory.length, tickets: d.rewards.tickets.length, badges: d.rewards.badges?.length, stickers: d.rewards.stickers.length, cards: d.collection.items.length, cardCount: d.collection.items.reduce((n, i) => n + i.count, 0), beads: Object.values(d.collection.beads).reduce((n, v) => n + v, 0), bracelets: d.collection.bracelets.length, teacherNotes: d.teacherNotes.items.length, notes: d.notes.items.length, takes: d.piano.takes.length, songs: d.settings.pianoPieces.length })
console.log('\ncurrent :', JSON.stringify(sum(current)))
console.log('repaired:', JSON.stringify(sum(out)))
console.log(`given back: XP +${xpBack}, tokens ${JSON.stringify(tokBack)}`)
const boxCounts = {}
for (const b of out.rewards.boxHistory) if (b.itemId) boxCounts[b.itemId] = (boxCounts[b.itemId] ?? 0) + 1
const mismatched = out.collection.items.filter((i) => (boxCounts[i.id] ?? 0) !== i.count).map((i) => `${i.id} ${i.count}/${boxCounts[i.id] ?? 0}`)
console.log('card counts that differ from box history:', mismatched.join(', ') || 'none')

const outPath = `${tmpdir()}/kidedu-repaired-${FILE}`
writeFileSync(outPath, JSON.stringify(out))
console.log('repaired doc:', outPath)

if (WRITE) {
  if (states[states.length - 1].version !== latestVersion && (await fileAt(latestVersion)) !== lastText) throw new Error('the gist changed while planning - run again')
  const res = await fetch(`https://api.github.com/gists/${GIST}`, { method: 'PATCH', headers: h, body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(out) } } }) })
  console.log('PATCH', res.status)
}

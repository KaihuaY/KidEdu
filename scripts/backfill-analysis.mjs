// Backfill: measure every past take from the Google Drive archive with the
// SAME analysis code the app runs (src/audio/takeAnalysis.ts, imported from
// the Vite dev server inside headless Chrome, which also does the AAC/Opus
// decoding). Phase 1 (this file's default) is read-only: it downloads audio,
// analyses it and writes a results file + report. Phase 2 (--apply) merges
// the results into the live gist document after taking a fresh backup.
//
// Usage (from the repo root, with `npx vite --port 5173` running):
//   node scripts/backfill-analysis.mjs <progress.json> <outDir>            # analyse
//   GH_TOKEN=... node scripts/backfill-analysis.mjs --apply <outDir>        # write to the gist
//
// Playwright is resolved from PLAYWRIGHT_DIR (a folder with node_modules/playwright).

import { pathToFileURL } from 'node:url'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PLAYWRIGHT_ENTRY = pathToFileURL(join(resolve(process.env.PLAYWRIGHT_DIR ?? '.'), 'node_modules/playwright/index.mjs')).href
const BASE = process.env.APP_URL ?? 'http://localhost:5173/'

function pieceName(doc, id) {
  return doc.settings.pianoPieces.find((p) => p.id === id)?.name?.trim() ?? (id ? id.slice(0, 6) : 'free play')
}

async function download(url, file) {
  if (existsSync(file)) return
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) throw new Error('http ' + res.status)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 2000 || buf.subarray(0, 15).toString().includes('<!DOCTYPE')) throw new Error('not audio')
      writeFileSync(file, buf)
      return
    } catch (err) {
      if (attempt === 2) throw err
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    }
  }
}

async function analyse(docPath, outDir) {
  const { chromium } = await import(PLAYWRIGHT_ENTRY)
  const doc = JSON.parse(readFileSync(docPath, 'utf8'))
  const audioDir = join(outDir, 'audio')
  mkdirSync(audioDir, { recursive: true })
  const takes = doc.piano.takes.filter((t) => !t.isNote && t.upload?.driveUrl)
  console.log('takes to analyse:', takes.length)

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage()
  await page.route('**/__audio/*', async (route) => {
    const id = decodeURIComponent(route.request().url().split('/__audio/')[1])
    await route.fulfill({ body: readFileSync(join(audioDir, id)), contentType: 'application/octet-stream' })
  })
  await page.goto(BASE)
  // The dev server may hot-reload the page while other work edits the repo, so no state lives
  // in the page: every call re-imports the module and fingerprints are kept here in Node.
  const fps = {}
  const toFp = (f) => ({ blockSec: f.blockSec, blocks: f.blocks, data: Array.from(f.data) })
  void toFp

  const results = {}
  let done = 0
  for (const take of takes) {
    const file = `${take.id}.bin`
    try {
      await download(take.upload.driveUrl, join(audioDir, file))
      const r = await page.evaluate(async ({ file, id }) => {
        const buf = await (await fetch('/__audio/' + encodeURIComponent(file))).arrayBuffer()
        const ctx = new AudioContext()
        try {
          const audio = await ctx.decodeAudioData(buf)
          const ta = await import('/src/audio/takeAnalysis.ts')
          const out = ta.analyzeTake(audio.getChannelData(0), audio.sampleRate)
          return { metrics: out.metrics, onsets: out.onsetsMs.length, blocks: out.fingerprint.blocks, durationSec: audio.duration, fp: { blockSec: out.fingerprint.blockSec, blocks: out.fingerprint.blocks, data: Array.from(out.fingerprint.data) } }
        } finally {
          await ctx.close()
        }
      }, { file, id: take.id })
      fps[take.id] = r.fp
      delete r.fp
      results[take.id] = r
    } catch (err) {
      results[take.id] = { error: String(err.message ?? err) }
    }
    done++
    if (done % 10 === 0) console.log(`  ${done}/${takes.length}`)
  }

  // Per piece: pick a reference, then align every take of the piece to it.
  const byPiece = {}
  for (const t of takes) if (t.pieceId && results[t.id]?.metrics) (byPiece[t.pieceId] ??= []).push(t)
  const references = {}
  for (const [pieceId, list] of Object.entries(byPiece)) {
    if (list.length < 2) continue
    // A reference must be a COMPLETE performance: keep takes at least 80 % as long as the
    // 75th-percentile playing time, then prefer the fewest long pauses, then the most recent.
    const played = list.map((t) => results[t.id].metrics.playedSec).sort((a, b) => a - b)
    const p75 = played[Math.min(played.length - 1, Math.round((played.length - 1) * 0.75))]
    const complete = list.filter((t) => results[t.id].metrics.playedSec >= 0.8 * p75)
    const ref = [...complete].sort((a, b) => results[a.id].metrics.hesitations - results[b.id].metrics.hesitations || b.startedAt - a.startedAt)[0]
    references[pieceId] = ref.id
    const cmp = await page.evaluate(async ({ refId, ids, fps }) => {
      const ta = await import('/src/audio/takeAnalysis.ts')
      const fp = (id) => ({ ...fps[id], data: Float32Array.from(fps[id].data) })
      const out = {}
      for (const id of ids) out[id] = ta.compareToReference(fp(id), fp(refId)) ?? null
      return out
    }, { refId: ref.id, ids: list.map((t) => t.id), fps: Object.fromEntries(list.map((t) => [t.id, fps[t.id]])) })
    for (const [id, c] of Object.entries(cmp)) if (c) results[id].compare = c
  }

  // Go/no-go: can the fingerprints tell her pieces apart? Leave-one-out nearest neighbour.
  const labelled = takes.filter((t) => t.pieceId && (results[t.id]?.blocks ?? 0) >= 16 && (byPiece[t.pieceId]?.length ?? 0) >= 2)
  const ident = await page.evaluate(async ({ items, fps }) => {
    const ta = await import('/src/audio/takeAnalysis.ts')
    const cache = {}
    const fp = (id) => (cache[id] ??= { ...fps[id], data: Float32Array.from(fps[id].data) })
    let correct = 0
    const misses = []
    for (const a of items) {
      let best = -1
      let bestPiece = null
      for (const b of items) {
        if (a.id === b.id) continue
        const c1 = ta.compareToReference(fp(a.id), fp(b.id))
        const c2 = ta.compareToReference(fp(b.id), fp(a.id))
        const s = Math.max(c1 ? c1.matchToBest * Math.sqrt(c1.coverage) : 0, c2 ? c2.matchToBest * Math.sqrt(c2.coverage) : 0)
        if (s > best) {
          best = s
          bestPiece = b.pieceId
        }
      }
      if (bestPiece === a.pieceId) correct++
      else misses.push({ id: a.id, was: a.pieceId, guessed: bestPiece, score: Math.round(best * 100) / 100 })
    }
    return { total: items.length, correct, misses }
  }, { items: labelled.map((t) => ({ id: t.id, pieceId: t.pieceId })), fps: Object.fromEntries(labelled.map((t) => [t.id, fps[t.id]])) })
  await browser.close()

  const accuracy = ident.total ? ident.correct / ident.total : 0
  writeFileSync(join(outDir, 'results.json'), JSON.stringify({ at: Date.now(), source: docPath, references, ident: { ...ident, accuracy }, results }, null, 1))

  // Human-readable report.
  const lines = [`# Backfill analysis report`, ``, `Takes analysed: ${Object.values(results).filter((r) => r.metrics).length} of ${takes.length} · errors: ${Object.values(results).filter((r) => r.error).length}`, `Piece identification (leave-one-out): ${ident.correct}/${ident.total} = ${(accuracy * 100).toFixed(0)} %`, ``]
  for (const [pieceId, list] of Object.entries(byPiece)) {
    lines.push(`## ${pieceName(doc, pieceId)} (${list.length} takes, reference ${references[pieceId]?.slice(0, 8) ?? '-'})`, ``, `| day | played s | bpm | drift | steady | pauses | longest | range dB | coverage | match | pace | stumbles |`, `|---|---|---|---|---|---|---|---|---|---|---|---|`)
    for (const t of list.sort((a, b) => a.startedAt - b.startedAt)) {
      const m = results[t.id].metrics
      const c = results[t.id].compare
      lines.push(`| ${t.day} | ${m.playedSec} | ${m.tempoBpm ?? '-'} | ${m.tempoDrift ?? '-'} | ${m.steadiness ?? '-'} | ${m.hesitations} | ${m.longestPauseSec} | ${m.dynamicRangeDb} | ${c?.coverage ?? '-'} | ${c?.matchToBest ?? '-'} | ${c?.pace ?? '-'} | ${c?.stumbles?.join(' ') ?? ''} |`)
    }
    lines.push(``)
  }
  if (ident.misses.length) lines.push(`## Identification misses`, ``, ...ident.misses.map((m) => `- ${m.id.slice(0, 8)}: was ${pieceName(doc, m.was)}, guessed ${pieceName(doc, m.guessed)} (${m.score})`))
  writeFileSync(join(outDir, 'report.md'), lines.join('\n'))
  console.log(`accuracy ${(accuracy * 100).toFixed(0)} % · report: ${join(outDir, 'report.md')}`)
}

const args = process.argv.slice(2)
if (args[0] === '--apply') {
  console.error('apply phase is implemented separately (see scripts/backfill-apply.mjs)')
  process.exit(2)
} else {
  await analyse(args[0], args[1])
}

#!/usr/bin/env node
// Finds candidate photos on Wikimedia Commons for a collection card.
//
// Usage: node scripts/find-commons.mjs "atlantic puffin" [--limit 8]
//
// Prints, for each candidate, the exact "File:" title (paste it into
// scripts/collection-sources/<set>.json), mime, size, licence, artist and
// whether it passes the same free-licence check scripts/fetch-collection.mjs
// uses AND is a JPEG at least 800 px wide. Passing candidates come first.
//
// No dependencies - Node 20+ only.

const USER_AGENT = 'KidEdu-collection/1.0 (yukh27@gmail.com)'

// Same allowlist as scripts/fetch-collection.mjs (keep in sync).
const FREE_LICENCE_RE = /^(pd|cc0|cc-by(-sa)?-\d)/i

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const args = process.argv.slice(2)
let limit = 8
const words = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit') limit = Math.max(1, Number(args[++i]) || 8)
  else words.push(args[i])
}
const query = words.join(' ').trim()
if (!query) {
  console.error('Usage: node scripts/find-commons.mjs "atlantic puffin" [--limit 8]')
  process.exit(2)
}

const url =
  'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6' +
  `&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&gsrlimit=${limit}` +
  '&prop=imageinfo&iiprop=extmetadata|size|mime|url' +
  '&iiextmetadatafilter=LicenseShortName|License|Artist&format=json&formatversion=2'

let data
for (let attempt = 0; ; attempt++) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
  if ((res.status === 429 || res.status === 503) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    continue
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status} for ${url}`)
    process.exit(1)
  }
  data = await res.json()
  break
}

const rows = (data?.query?.pages ?? []).map((p) => {
  const info = p.imageinfo?.[0] ?? {}
  const meta = info.extmetadata ?? {}
  const code = meta.License?.value ?? ''
  const licence = meta.LicenseShortName?.value || code || 'Unknown'
  const free = FREE_LICENCE_RE.test(code)
  const isJpeg = info.mime === 'image/jpeg'
  const wide = (info.width ?? 0) >= 800
  return {
    title: p.title,
    index: p.index ?? 0,
    mime: info.mime ?? '?',
    width: info.width ?? 0,
    height: info.height ?? 0,
    licence,
    artist: stripHtml(meta.Artist?.value) || 'Unknown',
    free,
    pass: free && isJpeg && wide,
  }
})
rows.sort((a, b) => Number(b.pass) - Number(a.pass) || a.index - b.index)

if (rows.length === 0) {
  console.log(`No results for "${query}".`)
} else {
  for (const r of rows) {
    console.log(`${r.pass ? '[PASS]' : '[fail]'} ${r.title}`)
    console.log(`        ${r.mime}  ${r.width}x${r.height}  licence: ${r.licence}${r.free ? '' : '  (not free)'}`)
    console.log(`        artist: ${r.artist.slice(0, 100)}`)
  }
  console.log(`\n${rows.filter((r) => r.pass).length} of ${rows.length} pass (free licence, JPEG, width >= 800).`)
}

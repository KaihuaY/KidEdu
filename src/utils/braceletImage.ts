// Turns a finished bracelet into a shareable picture: a standalone SVG card
// (explicit colours, no CSS variables, so it renders the same anywhere), then
// a PNG, then the iPad share sheet (or a download when sharing files is
// unavailable). Nothing here throws.

import { findBead, type BeadDef } from '../content/beads'
import { heartPath, slotPositions, starPoints, strandPath } from '../content/braceletGeometry'
import type { Bracelet } from '../store/progress'

export interface BraceletImageOptions {
  kidName: string
  date: string
}

const W = 800
const H = 600
const CARD_BG = '#fff7e6'
const STRAND = '#b8b2a7'
const EMPTY_SLOT = '#e3dccd'
const INK = '#3b2a14'
const SOFT_INK = '#7a6a52'
const CENTRE = '#fff7e6'
const OUTLINE = '#00000022'

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function beadSvg(bead: BeadDef, cx: number, cy: number, r: number): string {
  switch (bead.shape) {
    case 'star':
      return `<polygon points="${starPoints(cx, cy, r, r * 0.45)}" fill="${bead.colour}" stroke="${OUTLINE}"/>`
    case 'heart':
      return `<path d="${heartPath(cx, cy, r)}" fill="${bead.colour}" stroke="${OUTLINE}"/>`
    case 'flower': {
      const petals = [0, 1, 2, 3, 4]
        .map((i) => {
          const a = ((2 * Math.PI) / 5) * i - Math.PI / 2
          return `<circle cx="${cx + r * 0.5 * Math.cos(a)}" cy="${cy + r * 0.5 * Math.sin(a)}" r="${r * 0.55}" fill="${bead.colour}"/>`
        })
        .join('')
      return `${petals}<circle cx="${cx}" cy="${cy}" r="${r * 0.32}" fill="${CENTRE}"/>`
    }
    case 'letter':
      return (
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bead.colour}" stroke="${OUTLINE}"/>` +
        `<text x="${cx}" y="${cy + r * 0.08}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="${r * 1.15}" font-weight="800" fill="${INK}">${esc(bead.letter ?? '')}</text>`
      )
    case 'round':
    default:
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bead.colour}" stroke="${OUTLINE}"/>`
  }
}

/** A standalone 800x600 SVG document for the bracelet card. */
export function braceletCardSvg(bracelet: Bracelet, opts: BraceletImageOptions): string {
  const sw = 640
  const sh = 400
  const ox = (W - sw) / 2
  const oy = 120
  const positions = slotPositions(bracelet.beads.length, sw, sh)
  const beads = bracelet.beads
    .map((id, i) => {
      const bead = id ? findBead(id) : undefined
      const p = positions[i]
      if (!bead) return `<circle cx="${p.x}" cy="${p.y}" r="7" fill="${EMPTY_SLOT}"/>`
      return `<g class="bead">${beadSvg(bead, p.x, p.y, 26)}</g>`
    })
    .join('')
  const font = 'font-family="Arial, Helvetica, sans-serif"'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" rx="32" fill="${CARD_BG}"/>` +
    `<text x="${W / 2}" y="86" text-anchor="middle" ${font} font-size="48" font-weight="800" fill="${INK}">${esc(bracelet.name)}</text>` +
    `<g transform="translate(${ox} ${oy})">` +
    `<path d="${strandPath(sw, sh)}" stroke="${STRAND}" stroke-width="6" fill="none" stroke-linecap="round"/>` +
    beads +
    `</g>` +
    `<text x="${W / 2}" y="560" text-anchor="middle" ${font} font-size="28" fill="${SOFT_INK}">${esc(`Made by ${opts.kidName} · ${opts.date}`)} 📿</text>` +
    `</svg>`
  )
}

/** Renders the card to a PNG blob (2x for sharpness). */
export function braceletCardPng(bracelet: Bracelet, opts: BraceletImageOptions): Promise<Blob> {
  const svg = braceletCardSvg(bracelet, opts)
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = W * 2
        canvas.height = H * 2
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no canvas')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no blob'))), 'image/png')
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error('image failed'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

function safeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'my'
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'failed' | 'needs-tap'

/** The bracelet card as a PNG file, ready to hand to the share sheet. */
export async function braceletCardFile(bracelet: Bracelet, opts: BraceletImageOptions): Promise<File> {
  const blob = await braceletCardPng(bracelet, opts)
  return new File([blob], `${safeName(bracelet.name)}-bracelet.png`, { type: 'image/png' })
}

/**
 * Shares an already-made picture (share sheet, or a download where files
 * cannot be shared). iPad Safari only opens the share sheet straight after a
 * tap; if making the picture took that moment, it refuses with
 * NotAllowedError and this returns 'needs-tap' - the caller keeps the file
 * and the next tap shares it at once. Never throws.
 */
export async function shareBraceletFile(file: File, bracelet: Bracelet, opts: BraceletImageOptions): Promise<ShareResult> {
  try {
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: bracelet.name, text: `${opts.kidName} made a bracelet called "${bracelet.name}"! 📿` })
        return 'shared'
      } catch (e) {
        const name = (e as { name?: string })?.name
        if (name === 'AbortError') return 'cancelled'
        if (name === 'NotAllowedError') return 'needs-tap'
        return 'failed'
      }
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}

/** Makes the picture and shares it in one go. Never throws. */
export async function shareBraceletImage(bracelet: Bracelet, opts: BraceletImageOptions): Promise<ShareResult> {
  try {
    return await shareBraceletFile(await braceletCardFile(bracelet, opts), bracelet, opts)
  } catch {
    return 'failed'
  }
}

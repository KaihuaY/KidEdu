/**
 * Camera-scan colour reading, pure logic (no DOM). `CameraScan.tsx` grabs
 * video frames and canvas pixels; everything here just turns 9 sampled RGB
 * patches per face into facelet letters.
 *
 * ---------------------------------------------------------------------
 * Photo order vs. facelet order (the part worth double-checking on paper
 * before trusting a camera)
 * ---------------------------------------------------------------------
 *
 * `src/engine/cube.ts`'s header defines each face's 9-facelet reading order
 * as "row by row, left to right, as seen from that face with the standard
 * viewing orientation (U is drawn with B at the top of the picture, D with F
 * at the top, and R/F/L/B with U at the top)". That is an *orientation*
 * description - it says nothing about how you physically got the cube into
 * that orientation - so the only question for each of the six holding poses
 * below is: "when Nora holds the cube like this and the camera looks at the
 * named face, is B at the top of the picture (for U) / F at the top (for D) /
 * U at the top (for R, F, L, B)?"
 *
 * Reference pose: F facing the camera, U on top (this is also the app's
 * canonical "solver's frame", see src/content/colors.ts). A rear/environment
 * camera is not mirrored - the sensor sees the scene exactly as an outside
 * observer standing at the camera would, which is exactly the vantage point
 * the facelet convention assumes. So in the reference pose the photo already
 * *is* the canonical "seen from F, U at top" view: photo row/col order maps
 * 1:1 onto facelet indices 18-26.
 *
 *   - R/B/L ("turn the cube so X faces the camera, keep yellow on top"):
 *     these are pure spins about the vertical (U-D) axis. U never moves, so
 *     "U at the top of the picture" holds throughout, and whichever face now
 *     points at the camera is by definition being viewed "from that face,
 *     with U on top" - the canonical view. Photo order = facelet order for
 *     R, F, B, L, with no permutation needed. Verified against
 *     src/engine/cube.ts's own move tables: applying the engine's `y` (a
 *     vertical-axis whole-cube spin, the same physical motion as "turn to
 *     face R") to SOLVED puts the old R-content at the F (camera-facing)
 *     slot, `y2` puts old B there, and `y'` puts old L there - i.e. exactly
 *     the R/B/L holding instructions below, confirmed by running
 *     `applyAlg(SOLVED, 'y' | 'y2' | "y'")` and reading facelet 22 (F's
 *     centre slot).
 *
 *   - U ("tip the cube toward the camera, green ends up at the bottom"):
 *     tipping the top toward the camera is a quarter turn about the
 *     horizontal L-R axis (the engine's `x`-family rotations), which leaves
 *     L/R untouched and swings U to face the camera. Running
 *     `applyAlg(SOLVED, "x'")` confirms old-U content lands at the F
 *     (camera-facing) slot, old-F lands at D (down, out of frame - "green at
 *     the bottom" describes the hidden edge, not a visible row), and old-B
 *     lands at U (up) - i.e. B is now "the top of the picture" seen from the
 *     U face, which is exactly the header's canonical U convention. So photo
 *     order = facelet order for U too, no permutation.
 *
 *   - D ("tip the cube away, white faces the camera, green ends up at the
 *     top"): the opposite quarter turn (`x`). `applyAlg(SOLVED, 'x')`
 *     confirms old-D lands at F (camera-facing), old-F lands at U (up - "F at
 *     the top of the picture", matching the header's canonical D
 *     convention), old-B lands at D (down). Photo order = facelet order for
 *     D too.
 *
 * Net result: for every face in SCAN_ORDER, with the cube held exactly as
 * instructed, `photoToFacelets` is the identity permutation. It is still
 * written as an explicit function (not skipped) so a future pose change only
 * has to edit the permutation table here, not every call site.
 */

import { CENTER_INDICES } from './pieces'
import { FACE_ORDER, facePositions, type Face } from './cube'
import { CUBE_COLORS } from '../content/colors'

export type { Face }

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Lab {
  L: number
  a: number
  b: number
}

export interface FaceCapture {
  face: Face
  /** 9 samples, reading order as photographed (top-left to bottom-right). */
  samples: Rgb[]
}

/** A sticker classified below this confidence is left '?' for Nora to fix by hand. */
export const LOW_CONFIDENCE_THRESHOLD = 0.35

/** Order faces are photographed, and the order CameraScan walks through them. */
export const SCAN_ORDER: Face[] = ['F', 'R', 'B', 'L', 'U', 'D']

/* ------------------------------------------------------------------ *
 * Colour maths
 * ------------------------------------------------------------------ */

function srgbToLinear(channel255: number): number {
  const c = channel255 / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

// sRGB (D65) -> XYZ, and the D65 white point, both from the standard matrix.
const WHITE_X = 0.95047
const WHITE_Y = 1
const WHITE_Z = 1.08883

function labF(t: number): number {
  const delta = 6 / 29
  return t > delta * delta * delta ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29
}

export function rgbToLab(c: Rgb): Lab {
  const r = srgbToLinear(c.r)
  const g = srgbToLinear(c.g)
  const b = srgbToLinear(c.b)

  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b

  const fx = labF(x / WHITE_X)
  const fy = labF(y / WHITE_Y)
  const fz = labF(z / WHITE_Z)

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

/** CIE76 colour difference - a plain Euclidean distance in Lab space. */
export function deltaE(a: Lab, b: Lab): number {
  const dl = a.L - b.L
  const da = a.a - b.a
  const db = a.b - b.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

function chroma(lab: Lab): number {
  return Math.sqrt(lab.a * lab.a + lab.b * lab.b)
}

/** Hue angle on the a*-b* wheel, in degrees, 0-360. */
function hueDeg(lab: Lab): number {
  const deg = (Math.atan2(lab.b, lab.a) * 180) / Math.PI
  return deg < 0 ? deg + 360 : deg
}

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

/* ------------------------------------------------------------------ *
 * Reference colours and classification
 * ------------------------------------------------------------------ */

/**
 * Reference colour per face letter: the centre sticker actually photographed
 * for a captured face (real lighting, real camera), falling back to the
 * fixed CUBE_COLORS hex for any face not captured yet.
 */
export function referenceColors(captures: FaceCapture[]): Record<Face, Rgb> {
  const byFace = new Map<Face, FaceCapture>()
  for (const capture of captures) byFace.set(capture.face, capture)

  const refs = {} as Record<Face, Rgb>
  for (const face of FACE_ORDER) {
    const capture = byFace.get(face)
    // The centre sticker sits at reading-order index 4 regardless of any
    // photo/facelet permutation (see the file header - there is none here,
    // but this stays true even if a future pose needed one, since a face's
    // own centre is always the middle cell of its own 3x3 photo).
    refs[face] = capture ? capture.samples[4] : hexToRgb(CUBE_COLORS[face].hex)
  }
  return refs
}

/**
 * Nearest reference colour by CIE76 deltaE, with two hard pairs resolved by
 * a dedicated rule before falling back to nearest-neighbour:
 *   - white (D) vs yellow (U): separated by chroma - white is close to grey,
 *     yellow carries real chroma on the yellow/blue axis.
 *   - red (L) vs orange (R): separated by hue angle - orange sits at a
 *     higher hue angle than red on the a*-b* wheel.
 * `confidence` is 0..1, where 1 means the winner is far ahead of the runner
 * up and 0 means it was a coin flip.
 */
export function classifySticker(sample: Rgb, refs: Record<Face, Rgb>): { face: Face; confidence: number } {
  const sampleLab = rgbToLab(sample)
  const refLabs = {} as Record<Face, Lab>
  for (const face of FACE_ORDER) refLabs[face] = rgbToLab(refs[face])

  const ranked = FACE_ORDER.map((face) => ({ face, d: deltaE(sampleLab, refLabs[face]) })).sort(
    (a, b) => a.d - b.d,
  )

  let winner = ranked[0].face
  // Base confidence: how far the nearest reference is ahead of the runner up.
  let confidence = clamp01((ranked[1].d - ranked[0].d) / (ranked[1].d + 1e-6))

  // For the two hard pairs, the deltaE ranking above is not trustworthy (a
  // washed-out yellow can sit numerically closer to white than to a
  // strongly-saturated yellow reference), so both the face *and* the
  // confidence are recomputed from the dedicated rule below, along a single
  // scalar axis (chroma, or hue angle) where the two references are cleanly
  // separated regardless of overall deltaE.
  function applyHardPairRule(a: Face, b: Face, decide: () => { face: Face; confidence: number }): void {
    const top2 = new Set([ranked[0].face, ranked[1].face])
    if (!top2.has(a) || !top2.has(b)) return
    const result = decide()
    winner = result.face
    confidence = result.confidence
  }

  applyHardPairRule('D', 'U', () => {
    // White stickers stay close to the neutral axis (chroma near 0) even
    // under warm/cool lighting; yellow carries real chroma even when the
    // exposure washes it out pale. The reference yellow itself is usually
    // strongly saturated (a real yellow sticker), so splitting exactly
    // halfway between the two reference chromas sets the bar too high for a
    // washed-out yellow - use a threshold closer to the white end instead.
    const whiteChroma = chroma(refLabs.D)
    const yellowChroma = chroma(refLabs.U)
    const threshold = whiteChroma + (yellowChroma - whiteChroma) * 0.25
    const spread = Math.max(yellowChroma - whiteChroma, 1e-6)
    const sampleChroma = chroma(sampleLab)
    const face: Face = sampleChroma < threshold ? 'D' : 'U'
    return { face, confidence: clamp01(Math.abs(sampleChroma - threshold) / (spread * 0.5)) }
  })

  applyHardPairRule('L', 'R', () => {
    // Red and orange have similar chroma; the hue angle (where on the
    // a*-b* wheel the colour sits) is what tells them apart.
    const redHue = hueDeg(refLabs.L)
    const orangeHue = hueDeg(refLabs.R)
    const mid = (redHue + orangeHue) / 2
    const spread = Math.max(Math.abs(orangeHue - redHue), 1e-6)
    const sampleHue = hueDeg(sampleLab)
    const face: Face = sampleHue < mid ? 'L' : 'R'
    return { face, confidence: clamp01(Math.abs(sampleHue - mid) / (spread * 0.5)) }
  })

  return { face: winner, confidence }
}

/**
 * Reorders the 9 photographed samples of `face` into the engine's facelet
 * reading order for that face. As derived in the file header, every one of
 * the six holding poses in SCAN_ORDER already produces a photo whose
 * top-left-to-bottom-right order matches the facelet reading order exactly,
 * so this is the identity permutation - kept as an explicit function/table so
 * a future change to the holding poses only has to edit this one place.
 */
const PHOTO_TO_FACELET_PERMUTATION: Record<Face, number[]> = {
  U: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  R: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  F: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  D: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  L: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  B: [0, 1, 2, 3, 4, 5, 6, 7, 8],
}

export function photoToFacelets(face: Face, samples: Rgb[]): Rgb[] {
  const order = PHOTO_TO_FACELET_PERMUTATION[face]
  return order.map((photoIndex) => samples[photoIndex])
}

/**
 * Assemble the 54-char facelet string from whatever faces have been
 * captured so far. Faces not captured stay '?' (except their centre, which
 * is always known - centres never move). Stickers classified below
 * `LOW_CONFIDENCE_THRESHOLD` become '?' too, so Nora fixes them by hand.
 */
export function faceletsFromCaptures(captures: FaceCapture[]): { facelets: string; lowConfidence: number[] } {
  const chars: string[] = new Array(54).fill('?')
  FACE_ORDER.forEach((face, i) => {
    chars[CENTER_INDICES[i]] = face
  })

  const refs = referenceColors(captures)
  const lowConfidence: number[] = []

  for (const capture of captures) {
    const ordered = photoToFacelets(capture.face, capture.samples)
    const positions = facePositions(capture.face)
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue // centre - already set, and known by definition
      const { face: guess, confidence } = classifySticker(ordered[i], refs)
      if (confidence < LOW_CONFIDENCE_THRESHOLD) {
        chars[positions[i]] = '?'
        lowConfidence.push(positions[i])
      } else {
        chars[positions[i]] = guess
      }
    }
  }

  return { facelets: chars.join(''), lowConfidence }
}

/**
 * Average colour of a square patch centred at (cx, cy) in an RGBA buffer
 * (e.g. ImageData.data), shared by CameraScan's canvas sampling.
 */
export function averagePatch(data: Uint8ClampedArray, width: number, cx: number, cy: number, half: number): Rgb {
  const height = Math.floor(data.length / (width * 4))
  const x0 = Math.max(0, Math.floor(cx - half))
  const x1 = Math.min(width - 1, Math.ceil(cx + half))
  const y0 = Math.max(0, Math.floor(cy - half))
  const y1 = Math.min(height - 1, Math.ceil(cy + half))

  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      count++
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0 }
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) }
}

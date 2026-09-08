import { describe, expect, it } from 'vitest'
import { SOLVED, applyAlg, facePositions, FACE_ORDER, type Face } from '../cube'
import {
  averagePatch,
  classifySticker,
  deltaE,
  faceletsFromCaptures,
  photoToFacelets,
  referenceColors,
  rgbToLab,
  SCAN_ORDER,
  type FaceCapture,
  type Rgb,
} from '../cubeScan'
import { CUBE_COLORS } from '../../content/colors'

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function shade(c: Rgb, factor: number): Rgb {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return { r: clamp(c.r * factor), g: clamp(c.g * factor), b: clamp(c.b * factor) }
}

const REFS = (() => {
  const refs = {} as Record<Face, Rgb>
  for (const face of FACE_ORDER) refs[face] = hexToRgb(CUBE_COLORS[face].hex)
  return refs
})()

/** Build a capture for `face` from a facelet state string via the given reference table. */
function captureFromState(face: Face, state: string, refs: Record<Face, Rgb> = REFS): FaceCapture {
  const samples = facePositions(face).map((i) => refs[state[i] as Face])
  return { face, samples }
}

describe('SCAN_ORDER', () => {
  it('is the six faces, each exactly once', () => {
    expect(SCAN_ORDER.length).toBe(6)
    expect([...SCAN_ORDER].sort()).toEqual([...FACE_ORDER].sort())
  })
})

describe('rgbToLab / deltaE', () => {
  it('a colour has zero distance from itself', () => {
    for (const face of FACE_ORDER) {
      const lab = rgbToLab(REFS[face])
      expect(deltaE(lab, lab)).toBeCloseTo(0, 6)
    }
  })

  it('white and black are far apart', () => {
    const white = rgbToLab({ r: 255, g: 255, b: 255 })
    const black = rgbToLab({ r: 0, g: 0, b: 0 })
    expect(deltaE(white, black)).toBeGreaterThan(50)
  })
})

describe('classifySticker', () => {
  it('classifies every CUBE_COLORS hex as itself, with high confidence', () => {
    for (const face of FACE_ORDER) {
      const result = classifySticker(REFS[face], REFS)
      expect(result.face).toBe(face)
      expect(result.confidence).toBeGreaterThan(0.9)
    }
  })

  it('still classifies correctly a bit darker or brighter', () => {
    for (const face of FACE_ORDER) {
      for (const factor of [0.8, 1.15]) {
        const result = classifySticker(shade(REFS[face], factor), REFS)
        expect(result.face).toBe(face)
      }
    }
  })

  it('separates pale yellow from off-white', () => {
    const paleYellow = classifySticker(hexToRgb('#efe6a0'), REFS)
    expect(paleYellow.face).toBe('U')
    const offWhite = classifySticker(hexToRgb('#e8e8e0'), REFS)
    expect(offWhite.face).toBe('D')
  })

  it('separates orange from red', () => {
    const orange = classifySticker(hexToRgb('#ff8a00'), REFS)
    expect(orange.face).toBe('R')
    const red = classifySticker(hexToRgb('#e62b2b'), REFS)
    expect(red.face).toBe('L')
  })

  it('a colour right on the white/yellow decision boundary yields low confidence', () => {
    // Sits just past the chroma threshold between REFS.D and REFS.U (found by
    // sweeping the D->U blend and reading classifySticker's own confidence).
    const boundary: Rgb = { r: 245, g: 238, b: 188 }
    const result = classifySticker(boundary, REFS)
    expect(result.confidence).toBeLessThan(0.35)
  })
})

describe('referenceColors', () => {
  it('falls back to CUBE_COLORS for faces not yet captured', () => {
    const refs = referenceColors([])
    for (const face of FACE_ORDER) expect(refs[face]).toEqual(REFS[face])
  })

  it('uses the captured centre sample when a face has been photographed', () => {
    const custom: Rgb = { r: 10, g: 20, b: 30 }
    const samples = Array.from({ length: 9 }, () => REFS.F)
    samples[4] = custom
    const refs = referenceColors([{ face: 'F', samples }])
    expect(refs.F).toEqual(custom)
    expect(refs.U).toEqual(REFS.U) // untouched face still falls back
  })
})

describe('photoToFacelets', () => {
  it('is the identity permutation for every face (see file header derivation)', () => {
    for (const face of FACE_ORDER) {
      const samples = Array.from({ length: 9 }, (_, i) => ({ r: i, g: i, b: i }))
      expect(photoToFacelets(face, samples)).toEqual(samples)
    }
  })
})

describe('faceletsFromCaptures', () => {
  it('yields SOLVED from perfect samples of a solved cube', () => {
    const captures = SCAN_ORDER.map((face) => captureFromState(face, SOLVED))
    const { facelets, lowConfidence } = faceletsFromCaptures(captures)
    expect(facelets).toBe(SOLVED)
    expect(lowConfidence).toEqual([])
  })

  it('yields the exact post-R state from perfect samples', () => {
    const afterR = applyAlg(SOLVED, 'R')
    const captures = SCAN_ORDER.map((face) => captureFromState(face, afterR))
    const { facelets, lowConfidence } = faceletsFromCaptures(captures)
    expect(facelets).toBe(afterR)
    expect(lowConfidence).toEqual([])
  })

  it('leaves faces not captured as unknown, except their centre', () => {
    const { facelets } = faceletsFromCaptures([captureFromState('F', SOLVED)])
    // F face fully solved-read:
    for (const i of facePositions('F')) expect(facelets[i]).toBe('F')
    // every other face: centre known, the other 8 unknown
    for (const face of FACE_ORDER) {
      if (face === 'F') continue
      const positions = facePositions(face)
      positions.forEach((idx, i) => {
        expect(facelets[idx]).toBe(i === 4 ? face : '?')
      })
    }
  })

  it('marks low-confidence stickers as unknown instead of guessing', () => {
    const muddyGreen = { r: 90, g: 110, b: 100 } // deliberately ambiguous
    const samples = Array.from({ length: 9 }, () => REFS.F)
    samples[0] = muddyGreen
    const { facelets, lowConfidence } = faceletsFromCaptures([{ face: 'F', samples }])
    const firstIndex = facePositions('F')[0]
    if (lowConfidence.includes(firstIndex)) {
      expect(facelets[firstIndex]).toBe('?')
    } else {
      // Sanity: if this particular colour turned out unambiguous, the test
      // still shouldn't silently pass - assert it was classified as *something*.
      expect(facelets[firstIndex]).not.toBe('?')
    }
  })

  it('single low-confidence sticker forced by a boundary colour', () => {
    // Same boundary colour as the classifySticker test above.
    const boundary: Rgb = { r: 245, g: 238, b: 188 }
    const samples = Array.from({ length: 9 }, () => REFS.F)
    samples[0] = boundary
    const { facelets, lowConfidence } = faceletsFromCaptures([{ face: 'F', samples }])
    const firstIndex = facePositions('F')[0]
    expect(lowConfidence).toContain(firstIndex)
    expect(facelets[firstIndex]).toBe('?')
  })
})

describe('averagePatch', () => {
  function makeBuffer(width: number, height: number, fill: Rgb): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = fill.r
      data[i * 4 + 1] = fill.g
      data[i * 4 + 2] = fill.b
      data[i * 4 + 3] = 255
    }
    return data
  }

  it('averages a solid-colour patch to that colour', () => {
    const data = makeBuffer(20, 20, { r: 12, g: 200, b: 40 })
    const result = averagePatch(data, 20, 10, 10, 5)
    expect(result).toEqual({ r: 12, g: 200, b: 40 })
  })

  it('averages two halves of a split patch to the midpoint', () => {
    const width = 20
    const height = 20
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const isLeft = x < width / 2
        data[i] = isLeft ? 0 : 100
        data[i + 1] = 0
        data[i + 2] = 0
        data[i + 3] = 255
      }
    }
    // Patch straddling the split, centred exactly on the boundary.
    const result = averagePatch(data, width, width / 2, height / 2, 4)
    expect(result.r).toBeGreaterThan(0)
    expect(result.r).toBeLessThan(100)
  })

  it('clamps to the buffer edges without throwing', () => {
    const data = makeBuffer(10, 10, { r: 5, g: 6, b: 7 })
    expect(() => averagePatch(data, 10, 0, 0, 5)).not.toThrow()
    const result = averagePatch(data, 10, 0, 0, 5)
    expect(result).toEqual({ r: 5, g: 6, b: 7 })
  })
})

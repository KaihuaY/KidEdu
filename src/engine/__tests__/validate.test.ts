import { describe, expect, it } from 'vitest'
import { SOLVED, applyAlg, randomScramble } from '../cube'
import { validateFacelets } from '../validate'
import { mulberry32 } from './rng'

/** Replace single stickers, keeping the string 54 long. */
function paint(state: string, changes: Record<number, string>): string {
  const chars = state.split('')
  for (const key of Object.keys(changes)) chars[Number(key)] = changes[Number(key)]
  return chars.join('')
}

describe('validateFacelets', () => {
  it('accepts a solved cube', () => {
    expect(validateFacelets(SOLVED)).toEqual({ ok: true })
  })

  it('accepts every scrambled cube', () => {
    const rng = mulberry32(4242)
    for (let i = 0; i < 50; i++) {
      const state = applyAlg(SOLVED, randomScramble(25, rng))
      const result = validateFacelets(state)
      expect(result.ok, result.ok ? '' : result.message).toBe(true)
    }
  })

  it('rejects a cube typed in the wrong orientation (the centres moved)', () => {
    const result = validateFacelets(applyAlg(SOLVED, 'y'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('centers')
  })

  it('complains about the wrong number of stickers', () => {
    const result = validateFacelets('UUU')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('length')
      expect(result.message).toContain('54')
    }
  })

  it('complains about unknown letters', () => {
    const result = validateFacelets(paint(SOLVED, { 0: '?' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('length')
      expect(result.facelets).toEqual([0])
    }
  })

  it('counts the colours: 10 yellow stickers is too many', () => {
    // R1 painted yellow -> 10 yellow, 8 orange.
    const result = validateFacelets(paint(SOLVED, { 9: 'U' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('counts')
      expect(result.message).toContain('yellow')
      expect(result.facelets).toHaveLength(10)
    }
  })

  it('insists on the centres', () => {
    // Swap the green and orange centres (counts stay right).
    const result = validateFacelets(paint(SOLVED, { 22: 'R', 13: 'F' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('centers')
      expect(result.message).toContain('orange')
    }
  })

  it('spots a corner with two yellow stickers', () => {
    // URF becomes yellow-yellow-green, and U1 turns orange to keep the counts.
    const result = validateFacelets(paint(SOLVED, { 9: 'U', 0: 'R' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('badPiece')
      expect(result.facelets).toEqual([8, 9, 20])
      expect(result.message).toContain('yellow-yellow-green')
    }
  })

  it('spots the same edge entered twice', () => {
    // Make the UF slot show yellow-orange, just like the UR slot already does
    // (the green-orange edge gives up its orange sticker so the counts add up).
    const result = validateFacelets(paint(SOLVED, { 19: 'R', 12: 'F' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('duplicatePiece')
      expect(result.message).toContain('yellow-orange')
    }
  })

  it('spots a twisted corner', () => {
    // Rotate the three stickers of the white-green-orange corner in place.
    const result = validateFacelets(paint(SOLVED, { 29: 'R', 26: 'D', 15: 'F' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('cornerTwist')
      expect(result.message).toBe(
        'The white-green-orange corner looks twisted. Check that corner again — turn its colours around one step.',
      )
      expect(result.facelets).toEqual([29, 26, 15])
    }
  })

  it('spots a flipped edge', () => {
    // Swap the two stickers of the white-green edge.
    const result = validateFacelets(paint(SOLVED, { 28: 'F', 25: 'D' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('edgeFlip')
      expect(result.message).toContain('white-green edge looks flipped')
      expect(result.facelets).toEqual([28, 25])
    }
  })

  it('spots two swapped edges', () => {
    // The yellow-green and yellow-orange edges trade places.
    const result = validateFacelets(paint(SOLVED, { 19: 'R', 10: 'F', 7: 'U', 5: 'U' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('parity')
  })

  it('spots two swapped corners', () => {
    // URF and UFL trade places (still a legal looking pair of pieces).
    const result = validateFacelets(
      paint(SOLVED, { 8: 'U', 9: 'F', 20: 'L', 6: 'U', 18: 'R', 38: 'F' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('parity')
  })
})

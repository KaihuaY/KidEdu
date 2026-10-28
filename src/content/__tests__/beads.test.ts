import { describe, expect, it } from 'vitest'
import { BEADS, findBead, randomBeadIds } from '../beads'

describe('letter beads', () => {
  it('has all 26 letters A-Z, unique bead ids, and only rolls known beads', () => {
    const letters = BEADS.filter((b) => b.shape === 'letter')
    expect(letters.map((b) => b.letter).sort().join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    expect(new Set(letters.map((b) => b.id)).size).toBe(26)
    expect(new Set(BEADS.map((b) => b.id)).size).toBe(BEADS.length)
    for (const l of letters) expect(l.id).toBe(`letter-${l.letter!.toLowerCase()}`)
    for (const id of randomBeadIds(500)) expect(findBead(id)).toBeDefined()
  })
})

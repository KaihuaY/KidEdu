import { describe, expect, it } from 'vitest'
import { MOVE_NAMES } from '../../engine/cube'
import { describeMove, everyMoveIsDescribed } from '../moveNames'

const BARE_TOKENS = ['R', 'L', 'U', 'D', 'F', 'B', 'M', 'E', 'S', 'X', 'Y', 'Z']

describe('describeMove', () => {
  it('covers every move token the engine accepts with a non-empty name', () => {
    expect(everyMoveIsDescribed()).toBe(true)
    for (const move of MOVE_NAMES) {
      const described = describeMove(move)
      expect(described.name.length, move).toBeGreaterThan(0)
    }
  })

  it('never shows a bare notation letter/token as its own word', () => {
    for (const move of MOVE_NAMES) {
      const described = describeMove(move)
      const text = `${described.name} ${described.detail ?? ''}`
      for (const token of BARE_TOKENS) {
        const re = new RegExp(`\\b${token}\\b`)
        expect(re.test(text), `${move}: "${text}" contains bare ${token}`).toBe(false)
      }
      // Nor the exact move token itself (e.g. "R'", "U2") as a standalone word.
      const tokenRe = new RegExp(`(^|\\s)${move}($|\\s)`)
      expect(tokenRe.test(text), `${move}: "${text}" contains the raw token`).toBe(false)
    }
  })

  it('says which way each basic face move goes', () => {
    expect(describeMove('R').name).toBe('Right side UP')
    expect(describeMove("R'").name).toBe('Right side DOWN')
    expect(describeMove('U').name).toBe('Top layer LEFT')
    expect(describeMove("U'").name).toBe('Top layer RIGHT')
    expect(describeMove('L').name).toBe('Left side DOWN')
    expect(describeMove("L'").name).toBe('Left side UP')
    expect(describeMove('D').name).toBe('Bottom layer RIGHT')
    expect(describeMove("D'").name).toBe('Bottom layer LEFT')
    expect(describeMove('F').name).toContain('Front side RIGHT')
    expect(describeMove("F'").name).toContain('Front side LEFT')
  })

  it('marks doubles as TWICE and rotations as whole-cube moves', () => {
    expect(describeMove('R2').name).toContain('TWICE')
    expect(describeMove('x').name).toContain('WHOLE cube')
    expect(describeMove('y').name).toContain('WHOLE cube')
    expect(describeMove('z').name).toContain('WHOLE cube')
  })

  it('wide-turn aliases (Rw etc.) describe the same move as their lowercase form', () => {
    expect(describeMove('Rw')).toEqual(describeMove('r'))
    expect(describeMove("Rw'")).toEqual(describeMove("r'"))
    expect(describeMove('Rw2')).toEqual(describeMove('r2'))
  })
})

import { describe, expect, it } from 'vitest'
import { MOVE_NAMES, SOLVED, applyAlg, isSolved, parseAlg } from '../cube'
import { KID_MOVE_NAMES, NAMED_ALGS, describeMove, everyMoveHasAName, namedAlg } from '../notation'

describe('kid move names', () => {
  it('covers every move the engine accepts', () => {
    for (const move of MOVE_NAMES) {
      expect(KID_MOVE_NAMES[move], `missing kid name for ${move}`).toBeTruthy()
    }
    expect(everyMoveHasAName()).toBe(true)
  })

  it('says which way each face goes', () => {
    expect(KID_MOVE_NAMES.R).toBe('Right side UP')
    expect(KID_MOVE_NAMES["R'"]).toBe('Right side DOWN')
    expect(KID_MOVE_NAMES.L).toBe('Left side DOWN')
    expect(KID_MOVE_NAMES["L'"]).toBe('Left side UP')
    expect(KID_MOVE_NAMES.U).toBe('Top layer LEFT')
    expect(KID_MOVE_NAMES["U'"]).toBe('Top layer RIGHT')
    expect(KID_MOVE_NAMES.U2).toBe('Top layer twice')
    expect(KID_MOVE_NAMES.D).toBe('Bottom layer RIGHT')
    expect(KID_MOVE_NAMES.F).toContain('Front turn RIGHT')
    expect(KID_MOVE_NAMES.x).toContain('whole cube')
    expect(KID_MOVE_NAMES.y).toContain('whole cube')
    expect(KID_MOVE_NAMES.z).toContain('whole cube')
  })

  it('describeMove falls back politely', () => {
    expect(describeMove('R')).toBe('Right side UP')
    expect(describeMove('Rw2')).toBe(KID_MOVE_NAMES.r2)
    expect(describeMove('wobble')).toBe('Turn wobble')
  })
})

describe('named algorithms', () => {
  it('has the seven tricks with unique ids', () => {
    const ids = NAMED_ALGS.map((a) => a.id)
    expect(ids).toEqual([
      'elevator',
      'goRight',
      'goLeft',
      'yellowCross',
      'fish',
      'cornerCycle',
      'cornerTwist',
    ])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every trick is a playable algorithm with a hint', () => {
    for (const trick of NAMED_ALGS) {
      expect(parseAlg(trick.alg).length).toBeGreaterThan(3)
      expect(trick.kidName.length).toBeGreaterThan(2)
      expect(trick.hint.length).toBeGreaterThan(10)
      // a trick never leaves the cube solved (it always does something)
      expect(isSolved(applyAlg(SOLVED, trick.alg))).toBe(false)
    }
  })

  it('spells out the tricks Nora learns', () => {
    expect(namedAlg('elevator')?.alg).toBe("R U R' U'")
    expect(namedAlg('goRight')?.alg).toBe("U R U' R' U' F' U F")
    expect(namedAlg('goLeft')?.alg).toBe("U' L' U L U F U' F'")
    expect(namedAlg('yellowCross')?.alg).toBe("F R U R' U' F'")
    expect(namedAlg('fish')?.alg).toBe("R U R' U R U2 R'")
    expect(namedAlg('cornerCycle')?.alg).toBe("U R U' L' U R' U' L")
    expect(namedAlg('cornerTwist')?.alg).toBe("R' D' R D")
    expect(namedAlg('nope')).toBeUndefined()
  })

  it('the elevator comes back to the start after six rides', () => {
    let state = SOLVED
    for (let i = 0; i < 6; i++) state = applyAlg(state, "R U R' U'")
    expect(state).toBe(SOLVED)
  })
})

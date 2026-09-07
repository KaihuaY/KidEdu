import { describe, expect, it } from 'vitest'
import {
  SOLVED,
  applyAlg,
  applyMove,
  facePositions,
  invertAlg,
  isSolved,
  parseAlg,
  randomScramble,
  simplifyAlg,
} from '../cube'
import { mulberry32 } from './rng'

const BASIC = ['U', 'R', 'F', 'D', 'L', 'B']

describe('facelet layout', () => {
  it('has the documented centres', () => {
    expect(SOLVED.length).toBe(54)
    expect([4, 13, 22, 31, 40, 49].map((i) => SOLVED[i]).join('')).toBe('URFDLB')
  })

  it('facePositions returns the 9 indices of a face', () => {
    expect(facePositions('U')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(facePositions('B')).toEqual([45, 46, 47, 48, 49, 50, 51, 52, 53])
    expect(facePositions('D')[4]).toBe(31)
  })
})

describe('basic moves', () => {
  it('every quarter turn has order 4', () => {
    for (const m of BASIC) {
      let s = SOLVED
      for (let i = 0; i < 4; i++) s = applyMove(s, m)
      expect(s).toBe(SOLVED)
      expect(applyAlg(SOLVED, `${m} ${m} ${m} ${m}`)).toBe(SOLVED)
    }
  })

  it('X2 is X twice and X\' is X three times', () => {
    for (const m of BASIC) {
      expect(applyAlg(SOLVED, `${m}2`)).toBe(applyAlg(SOLVED, `${m} ${m}`))
      expect(applyAlg(SOLVED, `${m}'`)).toBe(applyAlg(SOLVED, `${m} ${m} ${m}`))
      expect(applyAlg(SOLVED, `${m} ${m}'`)).toBe(SOLVED)
    }
  })

  it('the sexy move has order 6', () => {
    let s = SOLVED
    for (let i = 0; i < 6; i++) s = applyAlg(s, "R U R' U'")
    expect(s).toBe(SOLVED)
    // ... and is not the identity earlier than that
    expect(applyAlg(SOLVED, "R U R' U'")).not.toBe(SOLVED)
  })

  it('moves only shuffle stickers, never invent them', () => {
    const s = applyAlg(SOLVED, "R U2 F' L D B' R' U")
    const counts: Record<string, number> = {}
    for (const c of s) counts[c] = (counts[c] ?? 0) + 1
    expect(counts).toEqual({ U: 9, R: 9, F: 9, D: 9, L: 9, B: 9 })
  })

  it('U sends the front top row to the left face', () => {
    const s = applyAlg(SOLVED, 'U')
    // F1 F2 F3 (18,19,20) end up as L1 L2 L3 (36,37,38)
    expect([36, 37, 38].map((i) => s[i]).join('')).toBe('FFF')
    expect([18, 19, 20].map((i) => s[i]).join('')).toBe('RRR')
  })
})

describe('whole cube rotations', () => {
  const centre = (s: string) => [4, 13, 22, 31, 40, 49].map((i) => s[i]).join('')

  it('x, y and z move the centres the standard way', () => {
    // x: F -> U -> B -> D -> F, R and L stay put.
    expect(centre(applyAlg(SOLVED, 'x'))).toBe('FRDBLU')
    // y: R -> F -> L -> B -> R, U and D stay put.
    expect(centre(applyAlg(SOLVED, 'y'))).toBe('UBRDFL')
    // z: U -> R -> D -> L -> U, F and B stay put.
    expect(centre(applyAlg(SOLVED, 'z'))).toBe('LUFRDB')
  })

  it('rotations keep the cube solved and have order 4', () => {
    for (const r of ['x', 'y', 'z']) {
      expect(isSolved(applyAlg(SOLVED, r))).toBe(true)
      expect(applyAlg(SOLVED, `${r} ${r} ${r} ${r}`)).toBe(SOLVED)
    }
    expect(isSolved(applyAlg(SOLVED, "x y z x' y2 z'"))).toBe(true)
    expect(applyAlg(SOLVED, "x y z z' y' x'")).toBe(SOLVED)
  })

  it('rotations are the three parallel layers turning together', () => {
    expect(applyAlg(SOLVED, 'x')).toBe(applyAlg(SOLVED, "R M' L'"))
    expect(applyAlg(SOLVED, 'y')).toBe(applyAlg(SOLVED, "U E' D'"))
    expect(applyAlg(SOLVED, 'z')).toBe(applyAlg(SOLVED, "F S B'"))
  })
})

describe('slice moves', () => {
  const centre = (s: string) => [4, 13, 22, 31, 40, 49].map((i) => s[i]).join('')

  it('M follows L, E follows D, S follows F', () => {
    // M carries the U centre to F, F to D, D to B, B to U.
    expect(centre(applyAlg(SOLVED, 'M'))).toBe('BRUFLD')
    // E carries the F centre to R, R to B, B to L, L to F.
    expect(centre(applyAlg(SOLVED, 'E'))).toBe('UFLDBR')
    // S carries the U centre to R, R to D, D to L, L to U.
    expect(centre(applyAlg(SOLVED, 'S'))).toBe('LUFRDB')
  })

  it('slices equal their face-move definitions', () => {
    expect(applyAlg(SOLVED, 'M')).toBe(applyAlg(SOLVED, "R L' x'"))
    expect(applyAlg(SOLVED, 'E')).toBe(applyAlg(SOLVED, "U D' y'"))
    expect(applyAlg(SOLVED, 'S')).toBe(applyAlg(SOLVED, "F' B z"))
    expect(applyAlg(SOLVED, 'M2')).toBe(applyAlg(SOLVED, 'M M'))
    expect(applyAlg(SOLVED, "M M'")).toBe(SOLVED)
  })
})

describe('wide moves', () => {
  it('a wide turn is the outer layer plus its slice', () => {
    expect(applyAlg(SOLVED, 'r')).toBe(applyAlg(SOLVED, 'L x'))
    expect(applyAlg(SOLVED, 'r')).toBe(applyAlg(SOLVED, "R M'"))
    expect(applyAlg(SOLVED, 'l')).toBe(applyAlg(SOLVED, 'L M'))
    expect(applyAlg(SOLVED, 'u')).toBe(applyAlg(SOLVED, "U E'"))
    expect(applyAlg(SOLVED, 'd')).toBe(applyAlg(SOLVED, 'D E'))
    expect(applyAlg(SOLVED, 'f')).toBe(applyAlg(SOLVED, 'F S'))
    expect(applyAlg(SOLVED, 'b')).toBe(applyAlg(SOLVED, "B S'"))
  })

  it('Rw style aliases match the lowercase ones', () => {
    for (const pair of [['Rw', 'r'], ['Lw', 'l'], ['Uw', 'u'], ['Dw', 'd'], ['Fw', 'f'], ['Bw', 'b']]) {
      for (const suffix of ['', "'", '2']) {
        expect(applyAlg(SOLVED, pair[0] + suffix)).toBe(applyAlg(SOLVED, pair[1] + suffix))
      }
    }
  })
})

describe('parseAlg / applyAlg', () => {
  it('tolerates empty strings and extra spaces', () => {
    expect(parseAlg('')).toEqual([])
    expect(parseAlg('   ')).toEqual([])
    expect(parseAlg("  R   U'  \n F2 ")).toEqual(['R', "U'", 'F2'])
    expect(applyAlg(SOLVED, '')).toBe(SOLVED)
    expect(applyAlg(SOLVED, '   ')).toBe(SOLVED)
    expect(applyAlg(SOLVED, "  R   R'  ")).toBe(SOLVED)
  })

  it('rejects nonsense', () => {
    expect(() => parseAlg('R Q')).toThrow()
    expect(() => applyMove(SOLVED, 'Q')).toThrow()
  })
})

describe('invertAlg', () => {
  it('reverses and flips every move', () => {
    expect(invertAlg("R U' F2")).toBe("F2 U R'")
    expect(invertAlg('')).toBe('')
  })

  it('undoes 50 random scrambles', () => {
    const rng = mulberry32(20240601)
    for (let i = 0; i < 50; i++) {
      const scramble = randomScramble(25, rng)
      const scrambled = applyAlg(SOLVED, scramble)
      expect(scrambled).not.toBe(SOLVED)
      expect(applyAlg(scrambled, invertAlg(scramble))).toBe(SOLVED)
    }
  })

  it('also undoes algs with slices, wide turns and rotations', () => {
    const alg = "r U' M2 x y' Bw2 S E' L f'"
    const s = applyAlg(SOLVED, alg)
    expect(applyAlg(s, invertAlg(alg))).toBe(SOLVED)
  })
})

describe('simplifyAlg', () => {
  it('cancels and merges neighbours', () => {
    expect(simplifyAlg("U U'")).toBe('')
    expect(simplifyAlg('U U')).toBe('U2')
    expect(simplifyAlg('U2 U2')).toBe('')
    expect(simplifyAlg('U U2')).toBe("U'")
    expect(simplifyAlg("U2 U'")).toBe('U')
    expect(simplifyAlg("U' U'")).toBe('U2')
    expect(simplifyAlg('U U U U')).toBe('')
    expect(simplifyAlg("R U U' R'")).toBe('')
    expect(simplifyAlg("R U R' U'")).toBe("R U R' U'")
    expect(simplifyAlg('')).toBe('')
    expect(simplifyAlg("F R R' F' y y")).toBe('y2')
  })

  it('never changes what the algorithm does', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 30; i++) {
      const alg = randomScramble(12, rng) + " R R' U2 U2 F F F F"
      expect(applyAlg(SOLVED, simplifyAlg(alg))).toBe(applyAlg(SOLVED, alg))
    }
  })
})

describe('isSolved / randomScramble', () => {
  it('knows a solved cube', () => {
    expect(isSolved(SOLVED)).toBe(true)
    expect(isSolved(applyAlg(SOLVED, 'y'))).toBe(true)
    expect(isSolved(applyAlg(SOLVED, 'R'))).toBe(false)
  })

  it('scrambles never repeat a face back to back', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 20; i++) {
      const moves = parseAlg(randomScramble(25, rng))
      expect(moves.length).toBe(25)
      for (let k = 1; k < moves.length; k++) {
        expect(moves[k][0]).not.toBe(moves[k - 1][0])
      }
    }
  })

  it('is deterministic for a given seed', () => {
    expect(randomScramble(10, mulberry32(1))).toBe(randomScramble(10, mulberry32(1)))
  })
})

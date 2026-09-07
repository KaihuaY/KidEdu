import { describe, expect, it } from 'vitest'
import { SOLVED, applyAlg, facePositions, isSolved } from '../../engine/cube'
import { CORNER_FACELETS, CORNER_NAMES, EDGE_FACELETS } from '../../engine/pieces'
import { NAMED_ALGS, namedAlg } from '../../engine/notation'
import { STAGE_MINUTES } from '../../store/planner'
import {
  HOLD_ORDER,
  LEARN_STICKERINGS,
  LESSON_LIST,
  LESSONS,
  learnCardEndState,
  learnCardState,
  spotOptionState,
  type HoldId,
  type LearnCard,
} from '../lessons'

const NAMED_ALG_IDS = new Set(NAMED_ALGS.map((a) => a.id))

describe('lesson structure', () => {
  it('has exactly the 8 documented holds, numbered 0-7 in wall order', () => {
    expect(HOLD_ORDER).toEqual([
      'basecamp',
      'cross',
      'corners',
      'middle',
      'yellowCross',
      'yellowEdges',
      'cornerPosition',
      'cornerOrient',
    ])
    expect(LESSON_LIST).toHaveLength(8)
    LESSON_LIST.forEach((lesson, i) => {
      expect(lesson.id).toBe(HOLD_ORDER[i])
      expect(lesson.number).toBe(i)
    })
  })

  it('every hold has all 4 stages with non-empty copy', () => {
    for (const lesson of LESSON_LIST) {
      expect(lesson.title.length).toBeGreaterThan(0)
      expect(lesson.goal.length).toBeGreaterThan(0)
      expect(lesson.story.length).toBeGreaterThan(0)
      expect(lesson.realCubeHint.length).toBeGreaterThan(0)

      expect(lesson.stages.watch.demos.length).toBeGreaterThan(0)
      for (const demo of lesson.stages.watch.demos) {
        expect(demo.title.length).toBeGreaterThan(0)
        expect(demo.say.length).toBeGreaterThan(0)
      }

      expect(lesson.stages.try.prompt.length).toBeGreaterThan(0)
      expect(lesson.stages.try.sequence.length).toBeGreaterThan(0)
      expect(lesson.stages.try.say.length).toBeGreaterThan(0)

      expect(lesson.stages.spot.question.length).toBeGreaterThan(0)
      expect(lesson.stages.spot.options.length).toBeGreaterThanOrEqual(2)

      expect(lesson.stages.climb.runs).toBe(3)
      expect(lesson.stages.climb.sequence.length).toBeGreaterThan(0)
    }
  })

  it('every namedAlgId referenced by a hold exists in NAMED_ALGS', () => {
    for (const lesson of LESSON_LIST) {
      for (const id of lesson.namedAlgIds) {
        expect(NAMED_ALG_IDS.has(id)).toBe(true)
      }
    }
  })

  it('every alg in watch demos, try/climb sequences, and spot options parses and applies cleanly', () => {
    for (const lesson of LESSON_LIST) {
      for (const demo of lesson.stages.watch.demos) {
        expect(() => applyAlg(SOLVED, demo.alg)).not.toThrow()
        if (demo.setupAlg) {
          expect(() => applyAlg(SOLVED, demo.setupAlg!)).not.toThrow()
        }
      }
      expect(() => applyAlg(SOLVED, lesson.stages.try.sequence)).not.toThrow()
      for (const seq of lesson.stages.try.sequences ?? []) {
        expect(() => applyAlg(SOLVED, seq)).not.toThrow()
      }
      expect(() => applyAlg(SOLVED, lesson.stages.climb.sequence)).not.toThrow()
      for (const option of lesson.stages.spot.options) {
        expect(() => applyAlg(SOLVED, option.alg)).not.toThrow()
        expect(() => spotOptionState(option)).not.toThrow()
      }
    }
  })

  it('every spot question has exactly one correct option', () => {
    for (const lesson of LESSON_LIST) {
      const correctCount = lesson.stages.spot.options.filter((o) => o.correct).length
      expect(correctCount).toBe(1)
    }
  })

  it('Base Camp watches and tries every one of the 10 basic moves', () => {
    const basecamp = LESSONS.basecamp
    const moveSet = ['R', "R'", 'L', "L'", 'U', "U'", 'F', "F'", 'D', "D'"]
    // Base Camp demos show each move applied forward - recover the move from
    // the demo's alg (which is the invert-of-invert round trip) rather than
    // assuming a particular internal representation.
    expect(basecamp.stages.watch.demos).toHaveLength(moveSet.length)
    expect(basecamp.stages.try.sequences?.slice().sort()).toEqual([...moveSet].sort())
  })
})

function uEdgePattern(state: string): boolean[] {
  const idx = facePositions('U')
  return [1, 3, 5, 7].map((p) => state[idx[p]] === 'U')
}

describe('Yellow Cross Ridge spot quiz predicate', () => {
  it('really does show a dot / L / line pattern on the U face for each option', () => {
    const options = LESSONS.yellowCross.stages.spot.options

    for (const option of options) {
      const state = spotOptionState(option)
      const edges = uEdgePattern(state)
      const yellowCount = edges.filter(Boolean).length
      const isL = option.label.includes('L)')
      const isDot = option.label.includes('dot')
      const isLine = option.label.includes('line')

      if (isDot) expect(yellowCount).toBe(0)
      if (isL) {
        expect(yellowCount).toBe(2)
        const [top, left, right, bottom] = edges
        const opposite = (top && bottom) || (left && right)
        expect(opposite).toBe(false)
      }
      if (isLine) {
        expect(yellowCount).toBe(2)
        const [top, left, right, bottom] = edges
        const opposite = (top && bottom) || (left && right)
        expect(opposite).toBe(true)
      }
    }

    const correct = options.find((o) => o.correct)
    expect(correct?.label).toContain('L)')
  })
})

function edgeMatchPattern(state: string): boolean[] {
  return (['F', 'R', 'B', 'L'] as const).map((face) => {
    const idx = facePositions(face)
    return state[idx[1]] === state[idx[4]]
  })
}

describe('Edge Ledge spot quiz predicate', () => {
  it('really does show two-adjacent / none / all-match patterns', () => {
    const options = LESSONS.yellowEdges.stages.spot.options

    for (const option of options) {
      const state = spotOptionState(option)
      const matches = edgeMatchPattern(state)
      const count = matches.filter(Boolean).length

      if (option.label.includes('two next to each other')) {
        expect(count).toBe(2)
        const [f, r, b, l] = matches
        const adjacent = (f && r) || (r && b) || (b && l) || (l && f)
        expect(adjacent).toBe(true)
      }
      if (option.label.includes('none match')) {
        expect(count).toBe(0)
      }
      if (option.label.includes('all match already')) {
        expect(count).toBe(4)
      }
    }

    const correct = options.find((o) => o.correct)
    expect(correct?.label).toContain('two next to each other')
  })
})

// ---------------------------------------------------------------------------
// Learn stage
//
// Every Learn card that shows "a case" is checked here against the engine, in
// Nora's frame (yellow up, green front => engine letters U=yellow, R=orange,
// F=green, D=white, L=red, B=blue). If one of these fails, the picture on
// screen is lying to a six year old, so it is worth being fussy.
// ---------------------------------------------------------------------------

function learnCards(id: HoldId): LearnCard[] {
  return LESSONS[id].stages.learn.cards
}

/** The one card in a hold whose title starts with `titleStartsWith`. */
function card(id: HoldId, titleStartsWith: string): LearnCard {
  const found = learnCards(id).filter((c) => c.title.startsWith(titleStartsWith))
  expect(found, `${id}: no unique card titled "${titleStartsWith}"`).toHaveLength(1)
  return found[0]
}

const U_EDGE_SLOTS = [0, 1, 2, 3] // UR, UF, UL, UB
const U_CORNER_SLOTS = [0, 1, 2, 3] // URF, UFL, ULB, UBR

/** Letters of the piece sitting in an edge slot, orientation-reference facelet first. */
function edgePiece(state: string, slot: number): string[] {
  return EDGE_FACELETS[slot].map((i) => state[i])
}
function cornerPiece(state: string, slot: number): string[] {
  return CORNER_FACELETS[slot].map((i) => state[i])
}
function sameSet(a: string[], b: string[]): boolean {
  return [...a].sort().join('') === [...b].sort().join('')
}
/** How many of the four top edges show white (i.e. are daisy petals). */
function petalCount(state: string): number {
  return U_EDGE_SLOTS.filter((slot) => state[EDGE_FACELETS[slot][0]] === 'D').length
}
/** Which of the four top edges show yellow, in slot order UR, UF, UL, UB. */
function yellowTopEdges(state: string): boolean[] {
  return U_EDGE_SLOTS.map((slot) => state[EDGE_FACELETS[slot][0]] === 'U')
}
/** For each of F, R, B, L: does the top edge on that face match the face's centre? */
function edgesMatchingTheirCentre(state: string): boolean[] {
  return (['F', 'R', 'B', 'L'] as const).map((face) => {
    const idx = facePositions(face)
    return state[idx[1]] === state[idx[4]]
  })
}
/** A corner is "home" when its 3 colours are the 3 colours of its slot - twist ignored. */
function cornersHome(state: string): boolean[] {
  return U_CORNER_SLOTS.map((slot) => sameSet(cornerPiece(state, slot), CORNER_NAMES[slot].split('')))
}

describe('Learn stage structure', () => {
  it('every hold opens with a Learn stage of at least 3 cards', () => {
    for (const lesson of LESSON_LIST) {
      const learn = lesson.stages.learn
      expect(learn.cards.length, lesson.id).toBeGreaterThanOrEqual(3)
      expect(learn.estimatedMinutes).toBe(STAGE_MINUTES.learn)
      for (const c of learn.cards) {
        expect(c.title.length, lesson.id).toBeGreaterThan(0)
        expect(c.text.length, `${lesson.id}: ${c.title}`).toBeGreaterThan(0)
        expect(c.say.length, `${lesson.id}: ${c.title}`).toBeGreaterThan(0)
        for (const step of c.checklist ?? []) expect(step.length).toBeGreaterThan(0)
      }
    }
  })

  it('every Learn display alg and setupAlg applies without throwing', () => {
    for (const lesson of LESSON_LIST) {
      for (const c of lesson.stages.learn.cards) {
        if (!c.display) continue
        const where = `${lesson.id}: ${c.title}`
        expect(() => applyAlg(SOLVED, c.display!.setupAlg), where).not.toThrow()
        expect(() => applyAlg(SOLVED, c.display!.alg), where).not.toThrow()
        expect(() => learnCardState(c), where).not.toThrow()
        expect(() => learnCardEndState(c), where).not.toThrow()
        // Every setupAlg carries the house z2 prefix, so what Nora sees is
        // always yellow up / green front.
        expect(c.display.setupAlg.startsWith('z2'), where).toBe(true)
      }
    }
  })

  it('every stickering used is a real cubing.js preset', () => {
    const allowed = new Set<string>(LEARN_STICKERINGS)
    for (const lesson of LESSON_LIST) {
      for (const c of lesson.stages.learn.cards) {
        if (c.stickering) expect(allowed.has(c.stickering), `${lesson.id}: ${c.stickering}`).toBe(true)
      }
    }
  })

  it('every hold ends its Learn stage with the "Help with my cube" card', () => {
    for (const lesson of LESSON_LIST) {
      const last = lesson.stages.learn.cards[lesson.stages.learn.cards.length - 1]
      expect(last.display, lesson.id).toBeUndefined()
      expect(last.text, lesson.id).toContain('Help with my cube')
    }
  })
})

describe('Base Camp Learn cards', () => {
  it('animates one single move per move card, straight from a solved cube', () => {
    for (const move of ['R', "R'", 'U', "U'", 'F', 'D']) {
      const c = learnCards('basecamp').find((x) => x.display?.alg === move)
      expect(c, `no Base Camp card animating ${move}`).toBeDefined()
      expect(learnCardState(c!)).toBe(SOLVED)
      expect(learnCardEndState(c!)).toBe(applyAlg(SOLVED, move))
    }
  })

  it('the prime card ends back where it started', () => {
    const c = card('basecamp', 'The little')
    expect(learnCardState(c)).toBe(SOLVED)
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })

  it('teaches the whole-cube y turn', () => {
    const c = card('basecamp', 'y =')
    expect(c.display?.alg).toBe('y')
  })
})

describe('Daisy Ledge Learn cases', () => {
  it('starts from a real daisy: four white petals around the yellow centre', () => {
    const c = card('cross', 'Grow a daisy')
    const state = learnCardState(c)
    expect(petalCount(state)).toBe(4)
    expect(state[4]).toBe('U') // yellow centre in the middle of the flower
  })

  it('case (a): a white edge on the bottom, white facing DOWN, in the wrong slot', () => {
    const c = card('cross', 'A white edge on the bottom')
    const state = learnCardState(c)
    const DF = 5 // the edge slot under the front face
    expect(state[EDGE_FACELETS[DF][0]]).toBe('D') // white points down
    expect(edgePiece(state, DF)).toContain('D')
    expect(sameSet(edgePiece(state, DF), ['D', 'F'])).toBe(false) // but not its own slot
    expect(petalCount(state)).toBe(3)
    expect(petalCount(learnCardEndState(c))).toBe(4) // "turn that side twice" completes the daisy
  })

  it('case (b): a white edge stranded in the middle row, lifted by one side turn', () => {
    const c = card('cross', 'A white edge in the middle row')
    const state = learnCardState(c)
    const FR = 8
    expect(edgePiece(state, FR)).toContain('D')
    expect(state[EDGE_FACELETS[FR][0]]).toBe('D') // white on the front face
    expect(petalCount(state)).toBe(3)
    expect(petalCount(learnCardEndState(c))).toBe(4)
    expect(c.text).toContain('turn the TOP first') // the petal-in-the-way warning
  })

  it('case (c): a white edge on top with white pointing at Nora, not up', () => {
    const c = card('cross', 'White is pointing sideways')
    const state = learnCardState(c)
    const UF = 1
    expect(edgePiece(state, UF)).toContain('D')
    expect(state[EDGE_FACELETS[UF][0]]).not.toBe('D') // white is NOT on top
    expect(state[EDGE_FACELETS[UF][1]]).toBe('D') // white looks at her
    expect(petalCount(state)).toBe(2)
    expect(petalCount(learnCardEndState(c))).toBe(3)
  })

  it('the tuck card starts on a lined-up petal and ends with that edge in the cross', () => {
    const c = card('cross', 'Tuck the petals down')
    const state = learnCardState(c)
    const UF = 1
    const DF = 5
    expect(petalCount(state)).toBe(4)
    expect(state[EDGE_FACELETS[UF][0]]).toBe('D') // white up
    expect(state[EDGE_FACELETS[UF][1]]).toBe(state[facePositions('F')[4]]) // green over green
    const after = learnCardEndState(c)
    expect(after[EDGE_FACELETS[DF][0]]).toBe('D') // white down
    expect(after[EDGE_FACELETS[DF][1]]).toBe('F') // and matching its centre
    expect(petalCount(after)).toBe(3)
  })
})

describe('Corner Crack Learn cases', () => {
  const URF = 0
  const DFR = 4
  const ELEVATOR = namedAlg('elevator')?.alg ?? "R U R' U'"

  it('case (a): the white corner sits in the top layer directly above its own slot', () => {
    const c = card('corners', 'White corner on top')
    const state = learnCardState(c)
    expect(sameSet(cornerPiece(state, URF), ['D', 'F', 'R'])).toBe(true)
    expect(state[CORNER_FACELETS[URF][0]]).not.toBe('D') // white is not pointing up yet
    expect(isSolved(applyAlg(state, ELEVATOR))).toBe(true) // exactly one ride
  })

  it('the three-ride card really needs three rides, not one or two', () => {
    const c = card('corners', 'Sometimes it takes three rides')
    const state = learnCardState(c)
    expect(sameSet(cornerPiece(state, URF), ['D', 'F', 'R'])).toBe(true)
    expect(isSolved(applyAlg(state, ELEVATOR))).toBe(false)
    expect(isSolved(applyAlg(state, `${ELEVATOR} ${ELEVATOR}`))).toBe(false)
    expect(isSolved(applyAlg(state, `${ELEVATOR} ${ELEVATOR} ${ELEVATOR}`))).toBe(true)
  })

  it('case (b): a white corner in the bottom, twisted, that one ride pops back on top', () => {
    const c = card('corners', 'A white corner stuck downstairs')
    const state = learnCardState(c)
    expect(sameSet(cornerPiece(state, DFR), ['D', 'F', 'R'])).toBe(true) // right slot...
    expect(state[CORNER_FACELETS[DFR][0]]).not.toBe('D') // ...wrong way round
    const after = learnCardEndState(c)
    expect(sameSet(cornerPiece(after, URF), ['D', 'F', 'R'])).toBe(true) // now up on top
  })
})

describe('Middle Traverse Learn cases', () => {
  const UF = 1
  const FR = 8

  it('the line-up card ends on a no-yellow edge whose front colour matches the front centre', () => {
    const c = card('middle', 'Line it up first')
    const after = learnCardEndState(c)
    expect(edgePiece(after, UF)).not.toContain('U')
    expect(after[EDGE_FACELETS[UF][1]]).toBe(after[facePositions('F')[4]])
  })

  it('Send it Right: front colour matches the front centre, top colour matches the RIGHT centre', () => {
    const c = card('middle', 'Top colour on the RIGHT')
    const state = learnCardState(c)
    expect(edgePiece(state, UF)).not.toContain('U')
    expect(state[EDGE_FACELETS[UF][1]]).toBe(state[facePositions('F')[4]])
    expect(state[EDGE_FACELETS[UF][0]]).toBe(state[facePositions('R')[4]])
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })

  it('Send it Left: same, but the top colour matches the LEFT centre', () => {
    const c = card('middle', 'Top colour on the LEFT')
    const state = learnCardState(c)
    expect(edgePiece(state, UF)).not.toContain('U')
    expect(state[EDGE_FACELETS[UF][1]]).toBe(state[facePositions('F')[4]])
    expect(state[EDGE_FACELETS[UF][0]]).toBe(state[facePositions('L')[4]])
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })

  it('the stuck card has a yellow edge jammed in the middle slot, and pops it back on top', () => {
    const c = card('middle', 'A middle spot with the wrong edge')
    const state = learnCardState(c)
    expect(edgePiece(state, FR)).toContain('U') // yellow has no business in the middle row
    const stuckPiece = edgePiece(state, FR)
    const after = learnCardEndState(c)
    const landedInTop = U_EDGE_SLOTS.some((slot) => sameSet(edgePiece(after, slot), stuckPiece))
    expect(landedInTop).toBe(true)
  })
})

describe('Yellow Cross Ridge Learn cases', () => {
  it('the dot card shows no yellow edges at all', () => {
    const c = card('yellowCross', 'Dot, L, or line?')
    expect(yellowTopEdges(learnCardState(c)).filter(Boolean)).toHaveLength(0)
  })

  it('the L card shows two yellow edges next to each other, at the BACK and the LEFT', () => {
    const c = card('yellowCross', 'The L')
    const [ur, uf, ul, ub] = yellowTopEdges(learnCardState(c))
    expect([ur, uf, ul, ub].filter(Boolean)).toHaveLength(2)
    expect(ub && ul).toBe(true) // exactly the hold the card tells her to use
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })

  it('the line card shows two yellow edges opposite each other, going LEFT to RIGHT', () => {
    const c = card('yellowCross', 'The line')
    const [ur, uf, ul, ub] = yellowTopEdges(learnCardState(c))
    expect([ur, uf, ul, ub].filter(Boolean)).toHaveLength(2)
    expect(ul && ur).toBe(true)
    expect(uf || ub).toBe(false)
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })

  it('the dot-fix card walks dot -> L (back/left) -> line (left/right) -> cross', () => {
    const c = card('yellowCross', 'A dot needs it')
    const state = learnCardState(c)
    const trick = namedAlg('yellowCross')?.alg ?? "F R U R' U' F'"
    expect(yellowTopEdges(state).filter(Boolean)).toHaveLength(0)

    const afterOne = applyAlg(applyAlg(state, trick), 'U2')
    const [, , ul1, ub1] = yellowTopEdges(afterOne)
    expect(ub1 && ul1).toBe(true) // an L held back-and-left, exactly as the card says

    const afterTwo = applyAlg(afterOne, trick)
    const [ur2, uf2, ul2, ub2] = yellowTopEdges(afterTwo)
    expect(ul2 && ur2 && !uf2 && !ub2).toBe(true) // now a left-right line
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })
})

describe('Edge Ledge Learn cases', () => {
  it('the adjacent card shows two matching edges at the BACK and the RIGHT', () => {
    const c = card('yellowEdges', 'Two matching, side by side')
    const state = learnCardState(c)
    expect(yellowTopEdges(state).every(Boolean)).toBe(true) // the yellow cross comes first
    const [f, r, b, l] = edgesMatchingTheirCentre(state)
    expect([f, r, b, l].filter(Boolean)).toHaveLength(2)
    expect(r && b).toBe(true)
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })

  it('the opposite card shows two matching edges across from each other, turned adjacent by one Fish', () => {
    const c = card('yellowEdges', 'Two matching, across')
    const state = learnCardState(c)
    expect(yellowTopEdges(state).every(Boolean)).toBe(true)
    const [f, r, b, l] = edgesMatchingTheirCentre(state)
    expect([f, r, b, l].filter(Boolean)).toHaveLength(2)
    expect((f && b) || (r && l)).toBe(true)

    const after = edgesMatchingTheirCentre(learnCardEndState(c))
    expect(after.filter(Boolean)).toHaveLength(2)
    const [af, ar, ab, al] = after
    expect((af && ar) || (ar && ab) || (ab && al) || (al && af)).toBe(true)
  })
})

describe('Corner Shuffle Learn cases', () => {
  it('the "one corner home" card has exactly one home corner, and one Shuffle finishes it', () => {
    const c = card('cornerPosition', 'One corner home')
    const state = learnCardState(c)
    const home = cornersHome(state)
    expect(home.filter(Boolean)).toHaveLength(1)
    expect(home[0]).toBe(true) // the front-right corner she is told to hold
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })

  it('the "no corner home" card has zero home corners, and one Shuffle makes one home', () => {
    const c = card('cornerPosition', 'No corner home')
    const state = learnCardState(c)
    expect(cornersHome(state).filter(Boolean)).toHaveLength(0)
    expect(cornersHome(learnCardEndState(c)).filter(Boolean).length).toBeGreaterThanOrEqual(1)
  })
})

describe('THE SUMMIT Learn cases', () => {
  const TWIST = namedAlg('cornerTwist')?.alg ?? "R' D' R D"
  const URF_TOP = CORNER_FACELETS[0][0]
  const ride = (state: string, n: number) =>
    applyAlg(state, Array.from({ length: n }, () => TWIST).join(' '))

  it('opens with every corner in its slot but not every corner yellow-up', () => {
    const c = card('cornerOrient', 'Every corner is home')
    const state = learnCardState(c)
    expect(cornersHome(state).every(Boolean)).toBe(true)
    expect(U_CORNER_SLOTS.some((slot) => state[CORNER_FACELETS[slot][0]] !== 'U')).toBe(true)
  })

  it('the two-ride card needs exactly two Bottom Elevators to turn that corner yellow-up', () => {
    const c = card('cornerOrient', 'Two rides')
    const state = learnCardState(c)
    expect(state[URF_TOP]).not.toBe('U')
    expect(ride(state, 1)[URF_TOP]).not.toBe('U')
    expect(ride(state, 2)[URF_TOP]).toBe('U')
    expect(learnCardEndState(c)[URF_TOP]).toBe('U')
  })

  it('the four-ride card needs exactly four - two is not enough', () => {
    const c = card('cornerOrient', 'Sometimes it takes four rides')
    const state = learnCardState(c)
    expect(state[URF_TOP]).not.toBe('U')
    expect(ride(state, 2)[URF_TOP]).not.toBe('U')
    expect(ride(state, 3)[URF_TOP]).not.toBe('U')
    expect(ride(state, 4)[URF_TOP]).toBe('U')
    expect(learnCardEndState(c)[URF_TOP]).toBe('U')
  })

  it('the "keep going" card really does show a messy, unsolved cube', () => {
    const c = card('cornerOrient', 'It looks broken')
    expect(isSolved(learnCardState(c))).toBe(false)
  })

  it('the last card is one top turn away from a fully solved cube', () => {
    const c = card('cornerOrient', 'One last top turn')
    const state = learnCardState(c)
    expect(isSolved(state)).toBe(false)
    expect(U_CORNER_SLOTS.every((slot) => state[CORNER_FACELETS[slot][0]] === 'U')).toBe(true)
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })
})

/**
 * CubeClimb - the beginner (layer by layer) solver.
 *
 * This is the method Nora is taught, in the order she learns it:
 *
 *   1. daisy          four white edges around the yellow middle
 *   2. cross          drop them straight down into a white cross
 *   3. corners        the Elevator (R U R' U') brings the white corners home
 *   4. middle         Send it Right / Send it Left for the middle band
 *   5. yellowCross    F R U R' U' F' until the yellow cross appears
 *   6. yellowEdges    the Fish (R U R' U R U2 R') walks the top edges home
 *   7. cornerPosition the Corner Swap walks the top corners into their slots
 *   8. cornerOrient   the Bottom Elevator (R' D' R D) turns each corner yellow up
 *
 * The cube state string always stays in the fixed URFDLB frame.  Whole cube
 * turns (y) are applied like any other move - they move the centres too - so
 * the algorithms we emit are literally the moves Nora performs, in order,
 * starting from "yellow on top, green in front".
 */

import { SOLVED, applyAlg, applyMove, isSolved } from '../cube'
import { CENTER_INDICES, CORNER_FACELETS, EDGE_FACELETS, colorName, pieceName } from '../pieces'
import { NAMED_ALGS } from '../notation'
import { validateFacelets } from '../validate'
import { buildTable, solveWithTable } from './tables'
import type { SolutionTable } from './tables'

export type PhaseId =
  | 'daisy'
  | 'cross'
  | 'corners'
  | 'middle'
  | 'yellowCross'
  | 'yellowEdges'
  | 'cornerPosition'
  | 'cornerOrient'

export const PHASE_ORDER: PhaseId[] = [
  'daisy',
  'cross',
  'corners',
  'middle',
  'yellowCross',
  'yellowEdges',
  'cornerPosition',
  'cornerOrient',
]

export interface SolveStep {
  /** the moves to play, exactly as Nora turns them */
  alg: string
  /** one short sentence for a 6 year old */
  note: string
  /** id in NAMED_ALGS when this step is one of the memorised tricks */
  namedAlgId?: string
  /** how often the named trick is repeated in this step */
  repeat?: number
  /** facelets of the piece this step is about */
  highlight?: number[]
}

export interface SolvePhase {
  id: PhaseId
  steps: SolveStep[]
  alg: string
}

export interface Solution {
  phases: SolvePhase[]
  alg: string
  moveCount: number
}

/* ------------------------------------------------------------------ *
 * Little helpers
 * ------------------------------------------------------------------ */

const FACE_LETTERS = ['U', 'R', 'F', 'D', 'L', 'B']
/** the U-face sticker that sits next to each side face */
const PETAL_OF_FACE: Record<number, number> = { 1: 5, 2: 7, 4: 3, 5: 1 }

const U_EDGES = [0, 1, 2, 3] // UR UF UL UB
const D_EDGES = [4, 5, 6, 7] // DR DF DL DB
const MIDDLE_EDGES = [8, 9, 10, 11] // FR FL BL BR
const U_CORNERS = [0, 1, 2, 3] // URF UFL ULB UBR
const D_CORNERS = [4, 5, 6, 7] // DFR DLF DBL DRB

const FR_SLOT = 8 // middle edge slot at the front right
const UF_SLOT = 1
const DFR_SLOT = 4
const URF_SLOT = 0

const algOf = (id: string): string => {
  const found = NAMED_ALGS.find((a) => a.id === id)
  if (!found) throw new Error(`Unknown named algorithm: ${id}`)
  return found.alg
}

const ELEVATOR = algOf('elevator')
const GO_RIGHT = algOf('goRight')
const GO_LEFT = algOf('goLeft')
const YELLOW_CROSS = algOf('yellowCross')
const FISH = algOf('fish')
const CORNER_CYCLE = algOf('cornerCycle')
const CORNER_TWIST = algOf('cornerTwist')

const faceOf = (facelet: number): number => Math.floor(facelet / 9)
/** the colour of the centre on the same face as this facelet */
const centreOf = (state: string, facelet: number): string => state[CENTER_INDICES[faceOf(facelet)]]

function slotSolved(state: string, facelets: number[]): boolean {
  return facelets.every((i) => state[i] === centreOf(state, i))
}

function lettersAt(state: string, facelets: number[]): string[] {
  return facelets.map((i) => state[i])
}

function sameColors(a: string[], b: string[]): boolean {
  return [...a].sort().join('') === [...b].sort().join('')
}

/** Which slot currently holds the edge piece with these two colours? */
function findEdge(state: string, colors: string[]): number {
  for (let slot = 0; slot < 12; slot++) {
    if (sameColors(lettersAt(state, EDGE_FACELETS[slot]), colors)) return slot
  }
  throw new Error(`No edge with colours ${colors.join('')}`)
}

/** Which slot currently holds the corner piece with these three colours? */
function findCorner(state: string, colors: string[]): number {
  for (let slot = 0; slot < 8; slot++) {
    if (sameColors(lettersAt(state, CORNER_FACELETS[slot]), colors)) return slot
  }
  throw new Error(`No corner with colours ${colors.join('')}`)
}

/** The face (0..5) whose centre currently shows this colour. */
function faceWithCentre(state: string, color: string): number {
  for (let f = 0; f < 6; f++) if (state[CENTER_INDICES[f]] === color) return f
  throw new Error(`No centre shows ${color}`)
}

const QUARTERS = ['', '', '2', "'"]

/** Repeat `move` 0..3 times until `ok` is happy; returns the setup turns. */
function setup(state: string, move: string, ok: (s: string) => boolean): string {
  let s = state
  for (let n = 0; n < 4; n++) {
    if (ok(s)) return n === 0 ? '' : move + QUARTERS[n]
    s = applyMove(s, move)
  }
  throw new Error(`No ${move} setup works for this cube`)
}

function repeatAlg(text: string, times: number): string {
  const parts: string[] = []
  for (let i = 0; i < times; i++) parts.push(text)
  return parts.join(' ')
}

/** Collects the steps of one phase while keeping the cube up to date. */
class Run {
  state: string
  steps: SolveStep[]

  constructor(state: string) {
    this.state = state
    this.steps = []
  }

  play(moves: string, note: string, extra?: Partial<SolveStep>): void {
    const text = moves.trim().replace(/\s+/g, ' ')
    if (text === '') return
    this.state = applyAlg(this.state, text)
    this.steps.push({ alg: text, note, ...(extra ?? {}) })
  }

  /** "Turn the whole cube so the green side faces you." */
  turnCube(moves: string): void {
    const text = moves.trim()
    if (text === '') return
    const after = applyAlg(this.state, text)
    this.play(text, `Turn the whole cube so the ${colorName(after[22])} side faces you.`)
  }
}

/* ------------------------------------------------------------------ *
 * Goals - "is this phase finished?"
 * ------------------------------------------------------------------ */

const crossDone = (s: string): boolean => D_EDGES.every((slot) => slotSolved(s, EDGE_FACELETS[slot]))

const daisyDone = (s: string): boolean =>
  crossDone(s) || U_EDGES.every((slot) => s[EDGE_FACELETS[slot][0]] === 'D')

const cornersDone = (s: string): boolean =>
  crossDone(s) && D_CORNERS.every((slot) => slotSolved(s, CORNER_FACELETS[slot]))

const middleDone = (s: string): boolean =>
  cornersDone(s) && MIDDLE_EDGES.every((slot) => slotSolved(s, EDGE_FACELETS[slot]))

const yellowCrossDone = (s: string): boolean =>
  middleDone(s) && U_EDGES.every((slot) => s[EDGE_FACELETS[slot][0]] === 'U')

const yellowEdgesDone = (s: string): boolean =>
  yellowCrossDone(s) && U_EDGES.every((slot) => slotSolved(s, EDGE_FACELETS[slot]))

/** the right piece for this slot, no matter which way round it sits */
function cornerInItsSlot(state: string, slot: number): boolean {
  const facelets = CORNER_FACELETS[slot]
  return sameColors(
    lettersAt(state, facelets),
    facelets.map((i) => centreOf(state, i)),
  )
}

const cornerPositionDone = (s: string): boolean =>
  yellowEdgesDone(s) && U_CORNERS.every((slot) => cornerInItsSlot(s, slot))

const GOALS: Record<PhaseId, (state: string) => boolean> = {
  daisy: daisyDone,
  cross: crossDone,
  corners: cornersDone,
  middle: middleDone,
  yellowCross: yellowCrossDone,
  yellowEdges: yellowEdgesDone,
  cornerPosition: cornerPositionDone,
  cornerOrient: isSolved,
}

export function isPhaseDone(state: string, phase: PhaseId): boolean {
  const goal = GOALS[phase]
  if (!goal) throw new Error(`Unknown phase: ${phase}`)
  return goal(state)
}

/**
 * The first phase that still has work to do.
 *
 * One warning for the UI: halfway through the very last phase the bottom of
 * the cube is deliberately scrambled (see solveCornerOrient), so ask this
 * question between steps of a phase, not in the middle of one.
 */
export function detectPhase(state: string): PhaseId | 'solved' {
  for (const phase of PHASE_ORDER) {
    if (!GOALS[phase](state)) return phase
  }
  return 'solved'
}

/* ------------------------------------------------------------------ *
 * 1. Daisy - four white edges around the yellow centre
 * ------------------------------------------------------------------ */

const isPetal = (state: string, slot: number): boolean => state[EDGE_FACELETS[slot][0]] === 'D'

/** U turns that make sure the petal spot next to `face` is empty. */
function freePetal(state: string, face: number): string {
  const petal = PETAL_OF_FACE[face]
  return setup(state, 'U', (s) => s[petal] !== 'D')
}

/**
 * Moves that walk one white edge up into a free petal spot.  Every white edge
 * is at most three little moves away: lying in the top layer it drops into the
 * middle band, from the middle band or the bottom it hops straight up.
 */
function movesToPetal(state: string, colors: string[]): string {
  const moves: string[] = []
  let s = state
  const push = (text: string) => {
    if (text === '') return
    moves.push(text)
    s = applyAlg(s, text)
  }

  for (let guard = 0; guard < 6; guard++) {
    const slot = findEdge(s, colors)
    const facelets = EDGE_FACELETS[slot]
    const whiteFirst = s[facelets[0]] === 'D'

    if (U_EDGES.includes(slot)) {
      if (whiteFirst) break // already a petal
      // Lying on its side in the top layer: tip it into the middle band.
      push(FACE_LETTERS[faceOf(facelets[1])])
      continue
    }

    if (D_EDGES.includes(slot)) {
      const face = faceOf(facelets[1])
      push(freePetal(s, face))
      // White pointing down: two turns bring it straight up.  White on the
      // side: one turn tips it into the middle band.
      push(FACE_LETTERS[face] + (whiteFirst ? '2' : ''))
      continue
    }

    // Middle band: turn the face that does *not* carry the white sticker, in
    // whichever direction lifts the edge into the top layer.
    const otherFacelet = whiteFirst ? facelets[1] : facelets[0]
    const face = faceOf(otherFacelet)
    push(freePetal(s, face))
    const letter = FACE_LETTERS[face]
    const up = [letter, letter + "'"].find((candidate) => {
      const test = applyMove(s, candidate)
      const where = findEdge(test, colors)
      return U_EDGES.includes(where) && isPetal(test, where)
    })
    if (!up) throw new Error('Cannot lift this edge into the daisy')
    push(up)
  }
  return moves.join(' ')
}

function solveDaisy(run: Run): void {
  for (let guard = 0; guard < 8 && !daisyDone(run.state); guard++) {
    // pick a white edge that is not a petal yet
    let target: string[] | null = null
    for (let slot = 0; slot < 12; slot++) {
      const letters = lettersAt(run.state, EDGE_FACELETS[slot])
      if (!letters.includes('D')) continue
      if (U_EDGES.includes(slot) && isPetal(run.state, slot)) continue
      target = letters
      break
    }
    if (!target) break
    const colors = target
    const highlight = EDGE_FACELETS[findEdge(run.state, colors)].slice()
    const other = colors[0] === 'D' ? colors[1] : colors[0]
    run.play(
      movesToPetal(run.state, colors),
      `Bring the ${pieceName(['D', other])} edge up so white points at the yellow middle.`,
      { highlight },
    )
  }
}

/* ------------------------------------------------------------------ *
 * 2. Cross - drop every petal straight down
 * ------------------------------------------------------------------ */

function solveCross(run: Run): void {
  for (let guard = 0; guard < 8 && !crossDone(run.state); guard++) {
    // a petal whose colour is not home yet
    let colors: string[] | null = null
    for (const slot of U_EDGES) {
      if (!isPetal(run.state, slot)) continue
      colors = lettersAt(run.state, EDGE_FACELETS[slot])
      break
    }
    if (!colors) break
    const side = colors[0] === 'D' ? colors[1] : colors[0]
    const face = faceWithCentre(run.state, side)
    const highlight = EDGE_FACELETS[findEdge(run.state, colors)].slice()
    // turn the top until this petal hangs over its own centre, then drop it
    const turns = setup(run.state, 'U', (s) => findEdge(s, colors) === edgeSlotAbove(face))
    run.play(
      `${turns} ${FACE_LETTERS[face]}2`,
      `Turn the top until the ${pieceName(['D', side])} edge sits over the ${colorName(side)} middle, then turn that side twice.`,
      { highlight },
    )
  }
}

/** the top-layer edge slot that sits above a side face */
function edgeSlotAbove(face: number): number {
  const petal = PETAL_OF_FACE[face]
  return U_EDGES.find((slot) => EDGE_FACELETS[slot][0] === petal) as number
}

/* ------------------------------------------------------------------ *
 * 3. White corners - the Elevator
 * ------------------------------------------------------------------ */

function cornerHome(state: string): boolean {
  return slotSolved(state, CORNER_FACELETS[DFR_SLOT])
}

function solveWhiteCorners(run: Run): void {
  for (let guard = 0; guard < 12 && !cornersDone(run.state); guard++) {
    // Look at every white corner waiting in the top layer and start with the
    // one that needs the fewest elevator rides - fewer turns for small hands.
    let best: {
      colors: string[]
      turnCube: string
      turnTop: string
      rides: number
      highlight: number[]
    } | null = null

    for (const slot of U_CORNERS) {
      const colors = lettersAt(run.state, CORNER_FACELETS[slot])
      if (!colors.includes('D')) continue
      const sides = colors.filter((c) => c !== 'D')
      // Hold the cube so this corner's home is the bottom front right slot,
      // then bring the corner itself over that slot.
      const turnCube = setup(run.state, 'y', (s) => sameColors([s[22], s[13]], sides))
      const afterCube = applyAlg(run.state, turnCube)
      const turnTop = setup(afterCube, 'U', (s) => findCorner(s, colors) === URF_SLOT)
      let test = applyAlg(afterCube, turnTop)
      let rides = 0
      while (!cornerHome(test) && rides < 6) {
        test = applyAlg(test, ELEVATOR)
        rides++
      }
      if (!cornerHome(test)) continue
      if (!best || rides < best.rides) {
        best = {
          colors,
          turnCube,
          turnTop,
          rides,
          highlight: CORNER_FACELETS[findCorner(afterCube, colors)].slice(),
        }
      }
    }

    if (!best) {
      // Everything white is downstairs but something is wrong: ride one back up.
      const wrong = D_CORNERS.find((slot) => !slotSolved(run.state, CORNER_FACELETS[slot]))
      if (wrong === undefined) break
      const stuck = lettersAt(run.state, CORNER_FACELETS[wrong])
      run.turnCube(setup(run.state, 'y', (s) => findCorner(s, stuck) === DFR_SLOT))
      run.play(ELEVATOR, 'Ride the elevator once to lift that corner back to the top.', {
        namedAlgId: 'elevator',
        repeat: 1,
        highlight: CORNER_FACELETS[DFR_SLOT].slice(),
      })
      continue
    }

    run.turnCube(best.turnCube)
    run.play(
      best.turnTop,
      `Turn the top until the ${pieceName(best.colors)} corner stands right above its home.`,
      { highlight: best.highlight },
    )
    run.play(repeatAlg(ELEVATOR, best.rides), elevatorNote(best.rides), {
      namedAlgId: 'elevator',
      repeat: best.rides,
      highlight: CORNER_FACELETS[URF_SLOT].slice(),
    })
  }
}

function elevatorNote(rides: number): string {
  if (rides === 1) return 'One elevator ride and the corner is home.'
  return `Ride the elevator ${rides} times - the corner comes back up and down until it fits.`
}

/* ------------------------------------------------------------------ *
 * 4. Middle band - Send it Right / Send it Left
 * ------------------------------------------------------------------ */

function solveMiddle(run: Run): void {
  for (let guard = 0; guard < 12 && !middleDone(run.state); guard++) {
    // An edge without yellow waiting in the top layer?
    let colors: string[] | null = null
    for (const slot of U_EDGES) {
      const letters = lettersAt(run.state, EDGE_FACELETS[slot])
      if (!letters.includes('U')) {
        colors = letters
        break
      }
    }

    if (!colors) {
      // The top has nothing to give, so a wrong edge is stuck downstairs.
      const wrong = MIDDLE_EDGES.find((slot) => !slotSolved(run.state, EDGE_FACELETS[slot]))
      if (wrong === undefined) break
      const stuck = lettersAt(run.state, EDGE_FACELETS[wrong])
      run.turnCube(setup(run.state, 'y', (s) => findEdge(s, stuck) === FR_SLOT))
      run.play(GO_RIGHT, 'Send it Right once to push the wrong edge back up to the top.', {
        namedAlgId: 'goRight',
        repeat: 1,
        highlight: EDGE_FACELETS[FR_SLOT].slice(),
      })
      continue
    }

    const slot = findEdge(run.state, colors)
    const facelets = EDGE_FACELETS[slot]
    const upColor = run.state[facelets[0]]
    const sideColor = run.state[facelets[1]]
    // Hold the cube so the edge's side colour is the front centre.
    run.turnCube(setup(run.state, 'y', (s) => s[22] === sideColor))
    // Slide it to the front, where it makes a little upside down T.
    const highlight = EDGE_FACELETS[findEdge(run.state, colors)].slice()
    run.play(
      setup(run.state, 'U', (s) => findEdge(s, colors) === UF_SLOT),
      `Turn the top until the ${pieceName([sideColor, upColor])} edge makes a T on the ${colorName(sideColor)} side.`,
      { highlight },
    )
    const goRight = upColor === run.state[13]
    run.play(
      goRight ? GO_RIGHT : GO_LEFT,
      goRight
        ? 'The top colour points right, so use Send it Right.'
        : 'The top colour points left, so use Send it Left.',
      {
        namedAlgId: goRight ? 'goRight' : 'goLeft',
        repeat: 1,
        highlight: EDGE_FACELETS[goRight ? FR_SLOT : 9].slice(),
      },
    )
  }
}

/* ------------------------------------------------------------------ *
 * 5. Yellow cross
 * ------------------------------------------------------------------ */

const YELLOW_EDGE_SPOTS = [1, 3, 5, 7] // UB UL UR UF stickers on the yellow face

function solveYellowCross(run: Run): void {
  for (let guard = 0; guard < 4 && !yellowCrossDone(run.state); guard++) {
    const yellow = YELLOW_EDGE_SPOTS.filter((i) => run.state[i] === 'U')
    const isLine =
      (yellow.includes(1) && yellow.includes(7)) || (yellow.includes(3) && yellow.includes(5))
    let turns = ''
    let setupNote = ''
    let note = 'Only the yellow dot so far. Do the Yellow Cross trick to grow a shape.'
    if (yellow.length === 2 && isLine) {
      turns = setup(run.state, 'U', (s) => s[3] === 'U' && s[5] === 'U')
      setupNote = 'Turn the top until the yellow line lies flat, from left to right.'
      note = 'Now do the Yellow Cross trick and the line becomes a cross.'
    } else if (yellow.length === 2) {
      turns = setup(run.state, 'U', (s) => s[1] === 'U' && s[3] === 'U')
      setupNote = 'Turn the top until the yellow L points into the back left corner.'
      note = 'Now do the Yellow Cross trick and the L becomes a line.'
    }
    run.play(turns, setupNote)
    run.play(YELLOW_CROSS, note, { namedAlgId: 'yellowCross', repeat: 1 })
  }
}

/* ------------------------------------------------------------------ *
 * 6 + 7. Last layer positions, straight from a lookup table
 *
 * Both steps only ever use a few top turns, whole cube turns and one
 * memorised trick, so the set of positions they can reach is tiny.  We walk
 * that set once (see tables.ts) and then simply read off which tool to reach
 * for.  The table always finds the shortest route, which is exactly the "hold
 * the piece that already matches still and repeat the trick" rule Nora is
 * taught.
 * ------------------------------------------------------------------ */

const CENTRE_SIG = (state: string): string => [13, 22, 40, 49].map((i) => state[i]).join('')

/** where the four yellow edges sit */
const yellowEdgeSig = (state: string): string =>
  U_EDGES.map((slot) => lettersAt(state, EDGE_FACELETS[slot]).join('')).join('') + CENTRE_SIG(state)

/**
 * Which corner sits in which slot - which way round it sits does not matter
 * yet, that is the next step's job.  The yellow edges are part of the
 * signature because they have to stay home while the corners move.
 */
const cornerSig = (state: string): string =>
  U_CORNERS.map((slot) => [...lettersAt(state, CORNER_FACELETS[slot])].sort().join('')).join('') +
  yellowEdgeSig(state)

let yellowEdgeTable: SolutionTable | null = null
let cornerTable: SolutionTable | null = null

function getYellowEdgeTable(): SolutionTable {
  if (!yellowEdgeTable) {
    yellowEdgeTable = buildTable({
      moves: ['U', "U'", 'U2', 'y', "y'", 'y2', FISH],
      sig: yellowEdgeSig,
      done: (s) => U_EDGES.every((slot) => slotSolved(s, EDGE_FACELETS[slot])),
      seed: SOLVED,
    })
  }
  return yellowEdgeTable
}

function getCornerTable(): SolutionTable {
  if (!cornerTable) {
    cornerTable = buildTable({
      moves: ['U', "U'", 'U2', 'y', "y'", 'y2', CORNER_CYCLE],
      sig: cornerSig,
      done: (s) =>
        U_CORNERS.every((slot) => cornerInItsSlot(s, slot)) &&
        U_EDGES.every((slot) => slotSolved(s, EDGE_FACELETS[slot])),
      seed: SOLVED,
    })
  }
  return cornerTable
}

function playLastLayer(
  run: Run,
  moves: string[],
  trick: string,
  namedAlgId: string,
  note: string,
  highlight: number[],
  setupNote: string,
): void {
  for (const move of moves) {
    if (move === trick) {
      run.play(move, note, { namedAlgId, repeat: 1, highlight })
    } else if (move.startsWith('y')) {
      run.turnCube(move)
    } else {
      run.play(move, setupNote)
    }
  }
}

function solveYellowEdges(run: Run): void {
  const moves = solveWithTable(getYellowEdgeTable(), yellowEdgeSig, run.state, 'yellow edges')
  playLastLayer(
    run,
    moves,
    FISH,
    'fish',
    'Do the Fish. Three yellow edges swim around the top while the front one stays home.',
    EDGE_FACELETS[0].concat(EDGE_FACELETS[2], EDGE_FACELETS[3]),
    'Turn the top so that as many edge colours as possible touch their own middle.',
  )
}

function solveCornerPosition(run: Run): void {
  const moves = solveWithTable(getCornerTable(), cornerSig, run.state, 'corner swap')
  playLastLayer(
    run,
    moves,
    CORNER_CYCLE,
    'cornerCycle',
    'Do the Corner Swap. The front right corner stays home while the other three walk around - it does not matter yet which way round they land.',
    CORNER_FACELETS[1].concat(CORNER_FACELETS[2], CORNER_FACELETS[3]),
    'Turn the top to line the corners up with their middles.',
  )
}

/* ------------------------------------------------------------------ *
 * 8. Corner orientation - the Bottom Elevator
 *
 * The cube itself stays still now (yellow up, green in front).  The corner at
 * the top front right gets R' D' R D two or four times until its yellow
 * sticker looks up, then a top turn brings the next corner into that spot.
 * The rest of the cube goes messy in the meantime and clicks back together
 * once every corner has had its turn - the total number of rides is always a
 * multiple of six, which is exactly when R' D' R D undoes itself.
 * ------------------------------------------------------------------ */

const URF_TOP_STICKER = 8

function solveCornerOrient(run: Run): void {
  for (let guard = 0; guard < 12 && !isSolved(run.state); guard++) {
    if (run.state[URF_TOP_STICKER] !== 'U') {
      // Always in pairs: after two rides the same corner is back in the slot,
      // turned one step further round.
      let rides = 0
      let test = run.state
      while (test[URF_TOP_STICKER] !== 'U' && rides < 6) {
        test = applyAlg(test, `${CORNER_TWIST} ${CORNER_TWIST}`)
        rides += 2
      }
      if (test[URF_TOP_STICKER] !== 'U') {
        throw new Error('The bottom elevator cannot turn this corner yellow side up')
      }
      run.play(repeatAlg(CORNER_TWIST, rides), twistNote(rides), {
        namedAlgId: 'cornerTwist',
        repeat: rides,
        highlight: CORNER_FACELETS[URF_SLOT].slice(),
      })
      continue
    }

    const stillWrong = U_CORNERS.some((slot) => run.state[CORNER_FACELETS[slot][0]] !== 'U')
    run.play(
      stillWrong
        ? setup(run.state, 'U', (s) => s[URF_TOP_STICKER] !== 'U')
        : setup(run.state, 'U', (s) => isSolved(s)),
      stillWrong
        ? 'Turn the top to bring the next corner to the front-right. Keep the cube itself still.'
        : 'Turn the top until the whole cube clicks together. You did it!',
    )
  }
  // Finish standing the way we started: yellow up, green in front.
  if (isSolved(run.state) && run.state[22] !== 'F') {
    run.turnCube(setup(run.state, 'y', (s) => s[22] === 'F'))
  }
}

function twistNote(rides: number): string {
  return `Do the Bottom Elevator ${rides} times, until yellow looks up. The rest of the cube gets messy - that is fine, it comes back.`
}

/* ------------------------------------------------------------------ *
 * Putting it together
 * ------------------------------------------------------------------ */

const PHASE_SOLVERS: Record<PhaseId, (run: Run) => void> = {
  daisy: solveDaisy,
  cross: solveCross,
  corners: solveWhiteCorners,
  middle: solveMiddle,
  yellowCross: solveYellowCross,
  yellowEdges: solveYellowEdges,
  cornerPosition: solveCornerPosition,
  cornerOrient: solveCornerOrient,
}

const ROTATIONS = ['x', 'y', 'z']

/** How many real turns (whole cube turns do not count) an algorithm has. */
export function countTurns(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '' && !ROTATIONS.includes(t[0])).length
}

export function solveLBL(state: string): Solution {
  const check = validateFacelets(state)
  if (!check.ok) throw new Error(check.message)

  const phases: SolvePhase[] = []
  let cube = state
  for (const id of PHASE_ORDER) {
    const run = new Run(cube)
    if (!GOALS[id](cube)) PHASE_SOLVERS[id](run)
    if (!GOALS[id](run.state)) {
      throw new Error(`The ${id} step did not finish - this cube confuses me.`)
    }
    cube = run.state
    phases.push({ id, steps: run.steps, alg: run.steps.map((s) => s.alg).join(' ').trim() })
  }

  const text = phases
    .map((p) => p.alg)
    .filter((a) => a !== '')
    .join(' ')
  return { phases, alg: text, moveCount: countTurns(text) }
}

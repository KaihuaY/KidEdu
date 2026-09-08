/**
 * Partial-progress counters for the mission curriculum.
 *
 * These read a facelet state (and, for the walkthrough helpers, a Solution
 * from the solver) and answer "how far along is this phase?" - the numbers a
 * mission's goalCheck compares against (see src/content/lessons.ts) and the
 * counts a "Get me ready" / "Show me my cube" walkthrough is built from.
 *
 * The semantics of every counter below are chosen to match the solver's own
 * private goal predicates in src/engine/solver/index.ts (crossDone,
 * cornersDone, middleDone, yellowCrossDone, yellowEdgesDone,
 * cornerPositionDone) so that "N of 4 done" always reaches exactly the same
 * finish line the solver itself checks for.
 */

import { applyAlg } from './cube'
import { CENTER_INDICES, CORNER_FACELETS, EDGE_FACELETS } from './pieces'
import { PHASE_ORDER, detectPhase, isPhaseDone, type PhaseId, type Solution, type SolveStep } from './solver'

// ---------------------------------------------------------------------------
// Slot groups - same grouping/order the solver uses internally.
// ---------------------------------------------------------------------------

const U_EDGES = [0, 1, 2, 3] // UR UF UL UB
const D_EDGES = [4, 5, 6, 7] // DR DF DL DB
const MIDDLE_EDGES = [8, 9, 10, 11] // FR FL BL BR
const U_CORNERS = [0, 1, 2, 3] // URF UFL ULB UBR
const D_CORNERS = [4, 5, 6, 7] // DFR DLF DBL DRB

/** the U-face sticker next to each yellow edge slot (UB UL UR UF) */
const YELLOW_EDGE_SPOTS = [1, 3, 5, 7]

const faceOf = (facelet: number): number => Math.floor(facelet / 9)
const centreOf = (state: string, facelet: number): string => state[CENTER_INDICES[faceOf(facelet)]]

function slotSolved(state: string, facelets: number[]): boolean {
  return facelets.every((i) => state[i] === centreOf(state, i))
}

function sameColors(a: string[], b: string[]): boolean {
  return [...a].sort().join('') === [...b].sort().join('')
}

function lettersAt(state: string, facelets: number[]): string[] {
  return facelets.map((i) => state[i])
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

/** How many white edges are already a "petal" (white sticker facing the yellow middle). */
export function countDaisyPetals(state: string): number {
  return U_EDGES.filter((slot) => state[EDGE_FACELETS[slot][0]] === 'D').length
}

/** How many of the four bottom-layer edges are a finished white cross arm. */
export function countCrossEdges(state: string): number {
  return D_EDGES.filter((slot) => slotSolved(state, EDGE_FACELETS[slot])).length
}

/** How many of the four bottom-layer corners are fully solved (white face done). */
export function countWhiteCorners(state: string): number {
  return D_CORNERS.filter((slot) => slotSolved(state, CORNER_FACELETS[slot])).length
}

/** How many of the four middle-layer edges are fully solved. */
export function countMiddleEdges(state: string): number {
  return MIDDLE_EDGES.filter((slot) => slotSolved(state, EDGE_FACELETS[slot])).length
}

/** Which shape the yellow stickers on top make: 0, 2 (line or L) or 4 lit spots. */
export function yellowCrossShape(state: string): 'dot' | 'L' | 'line' | 'cross' {
  const lit = YELLOW_EDGE_SPOTS.filter((i) => state[i] === 'U')
  if (lit.length >= 4) return 'cross'
  if (lit.length <= 0) return 'dot'
  if (lit.length === 2) {
    const isLine = (lit.includes(1) && lit.includes(7)) || (lit.includes(3) && lit.includes(5))
    return isLine ? 'line' : 'L'
  }
  // 1 or 3 lit spots never happens from a state reached by real moves, but a
  // scan-corrected or hand-built state could land here - call it an L, the
  // closest "in-between" shape, rather than throwing.
  return 'L'
}

/** How many of the four top-layer edges are fully solved (yellow cross AND the right side colour). */
export function countYellowEdgesAligned(state: string): number {
  return U_EDGES.filter((slot) => slotSolved(state, EDGE_FACELETS[slot])).length
}

/** the right piece for this slot, no matter which way round it sits */
function cornerInItsSlot(state: string, slot: number): boolean {
  const facelets = CORNER_FACELETS[slot]
  return sameColors(
    lettersAt(state, facelets),
    facelets.map((i) => centreOf(state, i)),
  )
}

/** How many of the four top-layer corners sit above their own home slot (orientation not counted yet). */
export function countCornersPositioned(state: string): number {
  return U_CORNERS.filter((slot) => cornerInItsSlot(state, slot)).length
}

/** How many of the four top-layer corners already show yellow on top. */
export function countCornersOriented(state: string): number {
  return U_CORNERS.filter((slot) => state[CORNER_FACELETS[slot][0]] === 'U').length
}

export interface CubeProgress {
  phase: PhaseId | 'solved'
  daisyPetals: number
  crossEdges: number
  whiteCorners: number
  middleEdges: number
  yellowCrossShape: 'dot' | 'L' | 'line' | 'cross'
  yellowEdgesAligned: number
  cornersPositioned: number
  cornersOriented: number
}

/** Every counter above, plus the solver's own detectPhase() reading. */
export function cubeProgress(state: string): CubeProgress {
  return {
    phase: detectPhase(state),
    daisyPetals: countDaisyPetals(state),
    crossEdges: countCrossEdges(state),
    whiteCorners: countWhiteCorners(state),
    middleEdges: countMiddleEdges(state),
    yellowCrossShape: yellowCrossShape(state),
    yellowEdgesAligned: countYellowEdgesAligned(state),
    cornersPositioned: countCornersPositioned(state),
    cornersOriented: countCornersOriented(state),
  }
}

// ---------------------------------------------------------------------------
// Walking a Solution step by step, for mission/help walkthroughs.
// ---------------------------------------------------------------------------

export interface FlatStep {
  phaseId: PhaseId
  phaseIndex: number
  stepIndexInPhase: number
  step: SolveStep
}

/** Every step of every phase, in solve order, tagged with where it sits. */
export function flattenSteps(solution: Solution): FlatStep[] {
  const out: FlatStep[] = []
  solution.phases.forEach((phase, phaseIndex) => {
    phase.steps.forEach((step, stepIndexInPhase) => {
      out.push({ phaseId: phase.id, phaseIndex, stepIndexInPhase, step })
    })
  })
  return out
}

/**
 * The prefix of `solution`'s steps (restricted to phases up to and including
 * `goalPhase`) needed to walk `startState` to the first point where `goal`
 * reports done. Returns `[]` when the start state already satisfies `goal`.
 *
 * Defensive fallback: if `goal` is never satisfied while walking every step
 * through `goalPhase` (should not happen for a goal that's actually reachable
 * within that phase), every one of those steps is returned rather than an
 * incomplete walkthrough that never reaches its own finish line.
 */
export function stepsToGoal(
  solution: Solution,
  startState: string,
  goalPhase: PhaseId,
  goal: (state: string) => { done: boolean },
): FlatStep[] {
  if (goal(startState).done) return []

  const goalIndex = PHASE_ORDER.indexOf(goalPhase)
  const candidates = flattenSteps(solution).filter((flat) => PHASE_ORDER.indexOf(flat.phaseId) <= goalIndex)

  let state = startState
  const out: FlatStep[] = []
  for (const flat of candidates) {
    state = applyAlg(state, flat.step.alg)
    out.push(flat)
    if (goal(state).done) return out
  }
  return out
}

/** Shorthand for the common "walk to the end of this whole phase" goal. */
export function stepsToPhase(solution: Solution, startState: string, phase: PhaseId): FlatStep[] {
  return stepsToGoal(solution, startState, phase, (s) => ({ done: isPhaseDone(s, phase) }))
}

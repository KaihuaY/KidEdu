import { describe, expect, it } from 'vitest'
import { SOLVED, applyAlg, isSolved, parseAlg, randomScramble } from '../cube'
import { NAMED_ALGS } from '../notation'
import { validateFacelets } from '../validate'
import { PHASE_ORDER, countTurns, detectPhase, isPhaseDone, solveLBL } from '../solver'
import type { SolveStep } from '../solver'
import { mulberry32 } from './rng'

/** Only these turns may appear outside the memorised tricks. */
const SETUP_MOVES = ['U', "U'", 'U2', 'y', "y'", 'y2']

function repeated(text: string, times: number): string {
  const parts: string[] = []
  for (let i = 0; i < times; i++) parts.push(text)
  return parts.join(' ')
}

/** A step is legal from the "corners" phase on when it is a setup turn or a trick. */
function checkStepIsAllowed(step: SolveStep, where: string): void {
  if (step.namedAlgId) {
    const named = NAMED_ALGS.find((a) => a.id === step.namedAlgId)
    expect(named, `${where}: unknown named alg ${step.namedAlgId}`).toBeDefined()
    expect(step.alg, where).toBe(repeated((named as { alg: string }).alg, step.repeat ?? 1))
    return
  }
  for (const move of parseAlg(step.alg)) {
    expect(SETUP_MOVES, `${where}: move ${move}`).toContain(move)
  }
}

describe('solveLBL', () => {
  it('leaves a solved cube alone', () => {
    const solution = solveLBL(SOLVED)
    expect(solution.alg).toBe('')
    expect(solution.moveCount).toBe(0)
    expect(solution.phases.map((p) => p.id)).toEqual(PHASE_ORDER)
    expect(solution.phases.every((p) => p.steps.length === 0)).toBe(true)
    expect(detectPhase(SOLVED)).toBe('solved')
  })

  it('refuses a cube that cannot exist', () => {
    const broken = SOLVED.slice(0, 9) + 'U' + SOLVED.slice(10)
    expect(() => solveLBL(broken)).toThrow()
  })

  it('solves 500 random scrambles', () => {
    const rng = mulberry32(31337)
    const scrambles = 500
    const perPhase: Record<string, number> = {}
    let totalMoves = 0
    let worst = 0
    let mostFish = 0
    let mostSwaps = 0

    for (let i = 0; i < scrambles; i++) {
      const scramble = randomScramble(25, rng)
      const start = applyAlg(SOLVED, scramble)
      const solution = solveLBL(start)
      const label = `scramble #${i} (${scramble})`

      // 1. it really solves the cube
      expect(isSolved(applyAlg(start, solution.alg)), label).toBe(true)

      // 2. phase algs and step algs line up
      expect(solution.phases.map((p) => p.id)).toEqual(PHASE_ORDER)
      expect(solution.alg).toBe(
        solution.phases
          .map((p) => p.alg)
          .filter((a) => a !== '')
          .join(' '),
      )
      for (const phase of solution.phases) {
        expect(phase.alg, `${label} ${phase.id}`).toBe(phase.steps.map((s) => s.alg).join(' ').trim())
      }

      // 3. after each phase, that phase and every earlier one are finished
      let state = start
      for (let p = 0; p < solution.phases.length; p++) {
        const phase = solution.phases[p]
        state = applyAlg(state, phase.alg)
        for (let earlier = 0; earlier <= p; earlier++) {
          expect(
            isPhaseDone(state, PHASE_ORDER[earlier]),
            `${label}: after ${phase.id}, ${PHASE_ORDER[earlier]} should be done`,
          ).toBe(true)
        }
      }
      expect(isSolved(state), label).toBe(true)

      // 4. from the corner phase on, only U turns, cube turns and tricks
      for (let p = 2; p < solution.phases.length; p++) {
        const phase = solution.phases[p]
        for (const step of phase.steps) checkStepIsAllowed(step, `${label} ${phase.id}`)
      }
      // the corner phase only ever uses the elevator
      for (const step of solution.phases[2].steps) {
        if (step.namedAlgId) expect(step.namedAlgId).toBe('elevator')
      }

      // 5. the last layer stays short: at most two goes at each trick, and the
      //    bottom elevator always runs in pairs
      const tricks = (index: number, id: string) =>
        solution.phases[index].steps.filter((step) => step.namedAlgId === id).length
      expect(tricks(5, 'fish'), `${label} yellowEdges`).toBeLessThanOrEqual(2)
      expect(tricks(6, 'cornerCycle'), `${label} cornerPosition`).toBeLessThanOrEqual(2)
      mostFish = Math.max(mostFish, tricks(5, 'fish'))
      mostSwaps = Math.max(mostSwaps, tricks(6, 'cornerCycle'))
      for (const step of solution.phases[7].steps) {
        if (step.namedAlgId === 'cornerTwist') expect([2, 4]).toContain(step.repeat)
      }

      totalMoves += solution.moveCount
      worst = Math.max(worst, solution.moveCount)
      for (const phase of solution.phases) {
        perPhase[phase.id] = (perPhase[phase.id] ?? 0) + countTurns(phase.alg)
      }
    }

    const average = totalMoves / scrambles
    const breakdown = PHASE_ORDER.map(
      (id) => `${id} ${((perPhase[id] ?? 0) / scrambles).toFixed(1)}`,
    ).join(', ')
    console.log(
      `solveLBL: ${scrambles} scrambles solved, average ${average.toFixed(1)} moves, worst ${worst}`,
    )
    console.log(
      `solveLBL per phase: ${breakdown}` +
        ` (at most ${mostFish} Fish and ${mostSwaps} Corner Swaps in one solve)`,
    )
    expect(average).toBeLessThan(200)
  }, 120000)

  it('every step is playable and carries a note', () => {
    const state = applyAlg(SOLVED, randomScramble(25, mulberry32(5150)))
    const solution = solveLBL(state)
    let moves = 0
    for (const phase of solution.phases) {
      for (const step of phase.steps) {
        expect(step.alg.trim()).not.toBe('')
        expect(parseAlg(step.alg).length).toBeGreaterThan(0)
        expect(step.note.length).toBeGreaterThan(5)
        if (step.highlight) {
          for (const facelet of step.highlight) {
            expect(facelet).toBeGreaterThanOrEqual(0)
            expect(facelet).toBeLessThan(54)
          }
        }
        moves += countTurns(step.alg)
      }
    }
    expect(moves).toBe(solution.moveCount)
  })

  it('uses the daisy, the cross and the named tricks', () => {
    const state = applyAlg(SOLVED, randomScramble(25, mulberry32(2024)))
    const solution = solveLBL(state)
    const used = new Set<string>()
    for (const phase of solution.phases) {
      for (const step of phase.steps) if (step.namedAlgId) used.add(step.namedAlgId)
    }
    expect(used.has('elevator')).toBe(true)
    expect(used.has('yellowCross')).toBe(true)
    expect(used.has('fish')).toBe(true)
    expect(used.has('cornerTwist')).toBe(true)
    // the daisy and cross phases only use plain face turns and cube turns
    for (const phase of solution.phases.slice(0, 2)) {
      for (const step of phase.steps) {
        for (const move of parseAlg(step.alg)) {
          expect('URFDLBy').toContain(move[0])
        }
      }
    }
  })
})

/** a solved cube with the yellow-orange-green and yellow-green-red corners
 *  twisted in place (one step each way, so the cube is still legal) */
const TWISTED_CORNERS = (() => {
  const chars = SOLVED.split('')
  chars[8] = 'F'
  chars[9] = 'U'
  chars[20] = 'R'
  chars[6] = 'F'
  chars[18] = 'L'
  chars[38] = 'U'
  return chars.join('')
})()

describe('detectPhase / isPhaseDone', () => {
  it('finds the first unfinished phase', () => {
    // one F2 drops a white edge out of the cross, so the daisy is the first job
    expect(detectPhase(applyAlg(SOLVED, 'F2'))).toBe('daisy')
    // the elevator keeps the white cross but throws two white corners out
    expect(detectPhase(applyAlg(SOLVED, "R U R' U'"))).toBe('corners')
    // an OLL algorithm only disturbs the last layer, so the cross, corners and
    // middle band are still finished and the yellow cross is the next job
    const yellowCrossState = applyAlg(SOLVED, "F R U R' U' F'")
    expect(detectPhase(yellowCrossState)).toBe('yellowCross')
    expect(isPhaseDone(yellowCrossState, 'middle')).toBe(true)
    expect(isPhaseDone(yellowCrossState, 'yellowCross')).toBe(false)

    // the fish keeps the yellow cross but sends three top edges walking
    const yellowEdgeState = applyAlg(SOLVED, "R U R' U R U2 R'")
    expect(detectPhase(yellowEdgeState)).toBe('yellowEdges')
    expect(isPhaseDone(yellowEdgeState, 'yellowCross')).toBe(true)

    // the corner swap leaves the edges alone and moves three corners
    const cornerState = applyAlg(SOLVED, "U R U' L' U R' U' L")
    expect(detectPhase(cornerState)).toBe('cornerPosition')
    expect(isPhaseDone(cornerState, 'yellowEdges')).toBe(true)

    // every piece home, but two corners are twisted in place
    expect(detectPhase(TWISTED_CORNERS)).toBe('cornerOrient')
    expect(isPhaseDone(TWISTED_CORNERS, 'cornerPosition')).toBe(true)
  })

  it('solves a cube where only two corners are twisted', () => {
    expect(validateFacelets(TWISTED_CORNERS).ok).toBe(true)
    const solution = solveLBL(TWISTED_CORNERS)
    expect(isSolved(applyAlg(TWISTED_CORNERS, solution.alg))).toBe(true)
    const ids = solution.phases.filter((p) => p.alg !== '').map((p) => p.id)
    expect(ids).toEqual(['cornerOrient'])
  })

  it('walks a solve phase by phase', () => {
    const start = applyAlg(SOLVED, randomScramble(25, mulberry32(777)))
    const solution = solveLBL(start)
    let state = start
    for (const phase of solution.phases) {
      if (phase.alg !== '') expect(detectPhase(state)).toBe(phase.id)
      state = applyAlg(state, phase.alg)
      expect(isPhaseDone(state, phase.id)).toBe(true)
    }
    expect(detectPhase(state)).toBe('solved')
  })
})

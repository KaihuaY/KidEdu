import { describe, expect, it } from 'vitest'
import { SOLVED, applyAlg, invertAlg, randomScramble } from '../cube'
import { PHASE_ORDER, detectPhase, isPhaseDone, solveLBL, type PhaseId } from '../solver'
import {
  countCornersPositioned,
  countCrossEdges,
  countDaisyPetals,
  countMiddleEdges,
  countWhiteCorners,
  countYellowEdgesAligned,
  cubeProgress,
  flattenSteps,
  stepsToGoal,
  stepsToPhase,
  yellowCrossShape,
} from '../progress'
import { mulberry32 } from './rng'

describe('counters on real states', () => {
  it('SOLVED is fully done everywhere', () => {
    expect(cubeProgress(SOLVED)).toMatchObject({
      phase: 'solved',
      daisyPetals: 0,
      crossEdges: 4,
      whiteCorners: 4,
      middleEdges: 4,
      yellowCrossShape: 'cross',
      yellowEdgesAligned: 4,
      cornersPositioned: 4,
      cornersOriented: 4,
    })
  })

  it('F2 pops one white edge into a petal and breaks a bit of everything below it', () => {
    const s = applyAlg(SOLVED, 'F2')
    expect(countDaisyPetals(s)).toBe(1)
    expect(countCrossEdges(s)).toBe(3)
    expect(countMiddleEdges(s)).toBe(2)
    expect(countWhiteCorners(s)).toBe(2)
  })

  it('F2 R2 B2 L2 pops all four edges into petals with the cross fully broken', () => {
    const s = applyAlg(SOLVED, 'F2 R2 B2 L2')
    expect(countDaisyPetals(s)).toBe(4)
    expect(countCrossEdges(s)).toBe(0)
  })

  it('...then one more F2 tucks one petal back down, losing a petal but gaining a cross edge', () => {
    const s = applyAlg(SOLVED, 'F2 R2 B2 L2 F2')
    expect(countDaisyPetals(s)).toBe(3)
    expect(countCrossEdges(s)).toBe(1)
  })

  describe('yellowCrossShape', () => {
    const trick = "F R U R' U' F'"

    it('one trick from solved makes a line', () => {
      const s = applyAlg(SOLVED, invertAlg(trick))
      expect(yellowCrossShape(s)).toBe('line')
    })

    it('the trick twice from solved makes an L', () => {
      const s = applyAlg(SOLVED, invertAlg(`${trick} ${trick}`))
      expect(yellowCrossShape(s)).toBe('L')
    })

    it('trick, U2, trick, trick from solved makes a dot', () => {
      const s = applyAlg(SOLVED, invertAlg(`${trick} U2 ${trick} ${trick}`))
      expect(yellowCrossShape(s)).toBe('dot')
    })
  })

  describe('countYellowEdgesAligned', () => {
    it('the Fish undone twice leaves 2 edges home', () => {
      const s = applyAlg(SOLVED, invertAlg("R U R' U R U2 R' U"))
      expect(countYellowEdgesAligned(s)).toBe(2)
    })

    it('a lone U turn leaves 0 edges home', () => {
      const s = applyAlg(SOLVED, invertAlg('U'))
      expect(countYellowEdgesAligned(s)).toBe(0)
    })
  })

  describe('countCornersPositioned', () => {
    it('the Corner Swap undone once leaves exactly 1 corner home', () => {
      const s = applyAlg(SOLVED, invertAlg("U R U' L' U R' U' L"))
      expect(countCornersPositioned(s)).toBe(1)
    })
  })
})

describe('cubeProgress().phase matches detectPhase() on scrambled cubes', () => {
  it('agrees on 100 seeded scrambles', () => {
    const rng = mulberry32(20260907)
    for (let i = 0; i < 100; i++) {
      const s = applyAlg(SOLVED, randomScramble(25, rng))
      expect(cubeProgress(s).phase).toBe(detectPhase(s))
    }
  })
})

describe('stepsToGoal / stepsToPhase', () => {
  interface GoalSpec {
    name: string
    goalPhase: PhaseId
    goal: (state: string) => { done: boolean }
  }

  const goals: GoalSpec[] = [
    ...PHASE_ORDER.map((p) => ({
      name: `phaseDone(${p})`,
      goalPhase: p,
      goal: (s: string) => ({ done: isPhaseDone(s, p) }),
    })),
    { name: 'petals+cross>=1', goalPhase: 'daisy', goal: (s) => ({ done: countDaisyPetals(s) + countCrossEdges(s) >= 1 }) },
    { name: 'petals+cross>=2', goalPhase: 'daisy', goal: (s) => ({ done: countDaisyPetals(s) + countCrossEdges(s) >= 2 }) },
    { name: 'petals+cross>=4', goalPhase: 'daisy', goal: (s) => ({ done: countDaisyPetals(s) + countCrossEdges(s) >= 4 }) },
    { name: 'crossEdges>=1', goalPhase: 'cross', goal: (s) => ({ done: countCrossEdges(s) >= 1 }) },
    { name: 'whiteCorners>=1', goalPhase: 'corners', goal: (s) => ({ done: countWhiteCorners(s) >= 1 }) },
    { name: 'whiteCorners>=2', goalPhase: 'corners', goal: (s) => ({ done: countWhiteCorners(s) >= 2 }) },
    { name: 'middleEdges>=1', goalPhase: 'middle', goal: (s) => ({ done: countMiddleEdges(s) >= 1 }) },
    { name: 'middleEdges>=2', goalPhase: 'middle', goal: (s) => ({ done: countMiddleEdges(s) >= 2 }) },
    { name: 'yellowShape!=dot', goalPhase: 'yellowCross', goal: (s) => ({ done: yellowCrossShape(s) !== 'dot' }) },
    { name: 'aligned>=2', goalPhase: 'yellowEdges', goal: (s) => ({ done: countYellowEdgesAligned(s) >= 2 }) },
    { name: 'positioned>=1', goalPhase: 'cornerPosition', goal: (s) => ({ done: countCornersPositioned(s) >= 1 }) },
  ]

  it('is a valid prefix of flattenSteps, ends passing the goal, and stops at the first passing step, over 200 seeded scrambles', () => {
    const rng = mulberry32(424242)
    for (let i = 0; i < 200; i++) {
      const start = applyAlg(SOLVED, randomScramble(25, rng))
      const solution = solveLBL(start)
      const flat = flattenSteps(solution)

      for (const g of goals) {
        const steps = stepsToGoal(solution, start, g.goalPhase, g.goal)

        if (g.goal(start).done) {
          expect(steps, `${g.name} scramble ${i}: already done -> []`).toEqual([])
          continue
        }

        const goalIndex = PHASE_ORDER.indexOf(g.goalPhase)
        const restricted = flat.filter((f) => PHASE_ORDER.indexOf(f.phaseId) <= goalIndex)
        expect(steps.length, `${g.name} scramble ${i}: no longer than the restricted flatten`).toBeLessThanOrEqual(
          restricted.length,
        )
        expect(steps, `${g.name} scramble ${i}: is a prefix`).toEqual(restricted.slice(0, steps.length))

        let end = start
        for (const st of steps) end = applyAlg(end, st.step.alg)
        expect(g.goal(end).done, `${g.name} scramble ${i}: end state passes the goal`).toBe(true)

        if (steps.length > 0) {
          let before = start
          for (const st of steps.slice(0, -1)) before = applyAlg(before, st.step.alg)
          expect(g.goal(before).done, `${g.name} scramble ${i}: the state before the last step does not pass yet`).toBe(
            false,
          )
        }
      }
    }
  })

  it('stepsToPhase always lands on a state where isPhaseDone(phase) is true', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 30; i++) {
      const start = applyAlg(SOLVED, randomScramble(25, rng))
      const solution = solveLBL(start)
      for (const phase of PHASE_ORDER) {
        const steps = stepsToPhase(solution, start, phase)
        let end = start
        for (const st of steps) end = applyAlg(end, st.step.alg)
        expect(isPhaseDone(end, phase), `phase ${phase}, scramble ${i}`).toBe(true)
      }
    }
  })
})

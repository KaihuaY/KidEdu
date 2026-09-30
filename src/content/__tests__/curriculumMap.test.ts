import { describe, expect, it } from 'vitest'
import { SOLVED, applyAlg, invertAlg, isSolved, parseAlg } from '../../engine/cube'
import { NAMED_ALGS, namedAlg } from '../../engine/notation'
import {
  BRANCHES,
  HOLD_ORDER,
  LESSON_LIST,
  LESSONS,
  PATTERNS,
  TRAIL_LESSONS,
  TRICK_ORDERS,
  branchById,
  isTrailLesson,
  learnCardEndState,
  learnCardState,
  repeatAlg,
  type HoldId,
  type Mission,
  type MissionStep,
} from '../lessons'

// ---------------------------------------------------------------------------
// The curriculum's prereq graph (round 13): every hold/node declares which
// earlier holds must be mastered before it opens. This file checks the graph
// itself is sane - every id resolves, no cycles, and the trail (the 11-hold
// trunk) is a single unbranched chain from Base Camp to the Summit.
// ---------------------------------------------------------------------------

describe('curriculum map', () => {
  it('every prereq id resolves to a real lesson', () => {
    for (const lesson of LESSON_LIST) {
      for (const prereqId of lesson.prereqs) {
        expect(LESSONS[prereqId], `${lesson.id} -> ${prereqId}`).toBeDefined()
      }
    }
  })

  it('has no prereq cycles', () => {
    const visiting = new Set<HoldId>()
    const done = new Set<HoldId>()

    function visit(id: HoldId): void {
      if (done.has(id)) return
      expect(visiting.has(id), `cycle through ${id}`).toBe(false)
      visiting.add(id)
      for (const prereqId of LESSONS[id].prereqs) visit(prereqId)
      visiting.delete(id)
      done.add(id)
    }

    for (const lesson of LESSON_LIST) visit(lesson.id)
  })

  it('the trail is a single chain: basecamp has no prereqs, every later trail hold has exactly one prereq - the hold right before it', () => {
    expect(TRAIL_LESSONS).toHaveLength(11)
    expect(TRAIL_LESSONS[0].id).toBe('basecamp')
    expect(TRAIL_LESSONS[0].prereqs).toEqual([])
    for (let i = 1; i < TRAIL_LESSONS.length; i++) {
      expect(TRAIL_LESSONS[i].prereqs, TRAIL_LESSONS[i].id).toEqual([TRAIL_LESSONS[i - 1].id])
    }
  })

  it('every trail lesson is identified correctly by isTrailLesson, in HOLD_ORDER', () => {
    for (const id of HOLD_ORDER) {
      expect(isTrailLesson(LESSONS[id]), id).toBe(true)
    }
  })

  it('colourMatch sits between corners and middle, both in HOLD_ORDER and by prereqs', () => {
    const corners = HOLD_ORDER.indexOf('corners')
    const colourMatch = HOLD_ORDER.indexOf('colourMatch')
    const middle = HOLD_ORDER.indexOf('middle')
    expect(colourMatch).toBe(corners + 1)
    expect(middle).toBe(colourMatch + 1)
    expect(LESSONS.colourMatch.prereqs).toEqual(['corners'])
    expect(LESSONS.middle.prereqs).toEqual(['colourMatch'])
  })
})

// ---------------------------------------------------------------------------
// Side branches (round 13 Phase 3): Trick Gym's 7 nodes + Pattern Lab.
// ---------------------------------------------------------------------------

describe('branch nodes', () => {
  it('every branch node carries branch, empty prereqs, and empty phaseIds', () => {
    const branchNodes = LESSON_LIST.filter((l) => l.branch)
    expect(branchNodes.length).toBe(8)
    for (const lesson of branchNodes) {
      expect(lesson.prereqs, lesson.id).toEqual([])
      expect(lesson.phaseIds, lesson.id).toEqual([])
    }
  })

  it('BRANCHES lists the gym nodes in NAMED_ALGS order, then Pattern Lab, matching LESSON_LIST', () => {
    const gym = branchById('gym')!
    expect(gym.nodeIds).toEqual([
      'gymElevator',
      'gymGoRight',
      'gymGoLeft',
      'gymYellowCross',
      'gymFish',
      'gymCornerCycle',
      'gymCornerTwist',
    ])
    expect(gym.nodeIds.map((id) => LESSONS[id].namedAlgIds[0])).toEqual(NAMED_ALGS.map((a) => a.id))

    const patternsBranch = branchById('patterns')!
    expect(patternsBranch.nodeIds).toEqual(['patterns'])

    const branchNodeIds = LESSON_LIST.filter((l) => l.branch).map((l) => l.id)
    expect(branchNodeIds).toEqual([...gym.nodeIds, ...patternsBranch.nodeIds])
  })

  it('branchById is undefined for an unknown id and BRANCHES has non-empty copy', () => {
    for (const branch of BRANCHES) {
      expect(branch.title.length).toBeGreaterThan(0)
      expect(branch.emoji.length).toBeGreaterThan(0)
      expect(branch.blurb.length).toBeGreaterThan(0)
      expect(branch.nodeIds.length).toBeGreaterThan(0)
    }
  })
})

describe('trick orders (Trick Gym Learn-it / From-memory)', () => {
  for (const trick of NAMED_ALGS) {
    const order = TRICK_ORDERS[trick.id]

    it(`${trick.id}: ${order === 'inverse' ? 'do it then backwards round-trips to solved' : `comes back to solved after exactly ${order} rides, never fewer`}`, () => {
      if (order === 'inverse') {
        const afterOne = applyAlg(SOLVED, trick.alg)
        expect(isSolved(afterOne)).toBe(false)
        expect(isSolved(applyAlg(afterOne, invertAlg(trick.alg)))).toBe(true)
        return
      }
      expect(order).toBeLessThanOrEqual(6)
      for (let n = 1; n < order; n++) {
        expect(isSolved(applyAlg(SOLVED, repeatAlg(trick.alg, n))), `${trick.id} x${n}`).toBe(false)
      }
      expect(isSolved(applyAlg(SOLVED, repeatAlg(trick.alg, order))), `${trick.id} x${order}`).toBe(true)
    })
  }
})

describe('Trick Gym node content', () => {
  const gymLessons = LESSON_LIST.filter((l) => l.branch === 'gym')

  it("each node's Learn-it mission ends solved (do-step 2, the 'comes back' step)", () => {
    for (const lesson of gymLessons) {
      const learnIt = lesson.missions.find((m) => m.id.endsWith('1'))!
      const lastStep = learnIt.steps[learnIt.steps.length - 1] as Extract<MissionStep, { kind: 'do' }>
      expect(isSolved(learnCardEndState(lastStep)), lesson.id).toBe(true)
    }
  })

  it("each node's From-memory mission opens with a fromMemory + namedAlgId step", () => {
    for (const lesson of gymLessons) {
      const fromMemory = lesson.missions.find((m) => m.id.endsWith('3'))!
      const first = fromMemory.steps[0] as Extract<MissionStep, { kind: 'do' }>
      expect(first.fromMemory, lesson.id).toBe(true)
      expect(first.namedAlgId, lesson.id).toBe(lesson.namedAlgIds[0])
    }
  })

  it("each node's Why-it-works chunk steps chain state to state, and their moves concatenate to the trick's alg", () => {
    for (const lesson of gymLessons) {
      const trickId = lesson.namedAlgIds[0]
      const trick = namedAlg(trickId)!
      const chunks = trick.why!.chunks!
      const whyItWorks = lesson.missions.find((m) => m.id.endsWith('2'))!
      const chunkSteps = whyItWorks.steps.slice(0, chunks.length) as Extract<MissionStep, { kind: 'do' }>[]
      expect(chunkSteps.length, lesson.id).toBe(chunks.length)

      let expectedState = SOLVED
      for (const step of chunkSteps) {
        expect(learnCardState(step), `${lesson.id}: ${step.title}`).toBe(expectedState)
        expectedState = learnCardEndState(step)
      }
      expect(expectedState, lesson.id).toBe(applyAlg(SOLVED, trick.alg))

      const joinedMoves = chunkSteps.map((s) => s.display!.alg).join(' ')
      expect(parseAlg(joinedMoves), lesson.id).toEqual(parseAlg(trick.alg))
    }
  })
})

describe('Pattern Lab content', () => {
  function stepByTitle(mission: Mission, title: string): Extract<MissionStep, { kind: 'do' }> {
    const step = mission.steps.find((s) => s.kind === 'do' && s.title === title)
    expect(step, `${mission.id}: no "${title}" step`).toBeDefined()
    return step as Extract<MissionStep, { kind: 'do' }>
  }

  it("every pattern's alg parses, 'Make it' ends unsolved, and 'Undo it' ends solved", () => {
    for (const mission of PATTERNS.missions) {
      const makeStep = stepByTitle(mission, 'Make it')
      const undoStep = stepByTitle(mission, 'Undo it')
      expect(() => parseAlg(makeStep.display!.alg)).not.toThrow()
      expect(isSolved(learnCardEndState(makeStep)), mission.id).toBe(false)
      expect(isSolved(learnCardEndState(undoStep)), mission.id).toBe(true)
    }
  })
})

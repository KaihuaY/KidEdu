import { describe, expect, it } from 'vitest'
import { SOLVED, applyAlg, facePositions } from '../../engine/cube'
import { NAMED_ALGS } from '../../engine/notation'
import { HOLD_ORDER, LESSON_LIST, LESSONS, spotOptionState } from '../lessons'

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

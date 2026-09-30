import { describe, expect, it } from 'vitest'
import { HOLD_ORDER, LESSON_LIST, LESSONS, TRAIL_LESSONS, isTrailLesson, type HoldId } from '../lessons'

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

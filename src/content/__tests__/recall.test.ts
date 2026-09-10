import { describe, expect, it } from 'vitest'
import { recallQuestion } from '../recall'
import { NAMED_ALGS, namedAlg, type NamedAlg } from '../../engine/notation'

function fakeNamed(alg: string, kidName = 'Test Trick'): NamedAlg {
  return { id: 'test', kidName, alg, hint: '' }
}

describe('recallQuestion', () => {
  it('asks "which move comes first" and answers with the first move\'s kid-friendly name', () => {
    const elevator = namedAlg('elevator')!
    const q = recallQuestion(elevator)
    expect(q.question).toBe(`Which move comes first in ${elevator.kidName}?`)
    expect(q.say).toBe(q.question)
    expect(q.answer).toBe('Right side UP') // first move is R
  })

  it('the distractor is a different move from the same trick when one has a different name', () => {
    const elevator = namedAlg('elevator')! // R U R' U'
    const q = recallQuestion(elevator)
    expect(q.distractor).toBe('Top layer LEFT') // second move, U
    expect(q.distractor).not.toBe(q.answer)
  })

  it('falls back to a different face entirely when every move in the trick shares the first move\'s name', () => {
    const q = recallQuestion(fakeNamed('R R'))
    expect(q.answer).toBe('Right side UP')
    expect(q.distractor).not.toBe(q.answer)
    expect(q.distractor).toBe('Top layer LEFT') // U, the first fallback face that isn't R
  })

  it('falls back the same way for a single-move trick', () => {
    const q = recallQuestion(fakeNamed('R'))
    expect(q.answer).toBe('Right side UP')
    expect(q.distractor).toBe('Top layer LEFT')
  })

  it('is deterministic: calling it twice for the same trick gives the same question/answer/distractor', () => {
    const elevator = namedAlg('elevator')!
    expect(recallQuestion(elevator)).toEqual(recallQuestion(elevator))
  })

  it('never returns an answer equal to the distractor, for every named trick in the curriculum', () => {
    for (const named of NAMED_ALGS) {
      const q = recallQuestion(named)
      expect(q.answer).not.toBe(q.distractor)
      expect(q.answer.length).toBeGreaterThan(0)
      expect(q.distractor.length).toBeGreaterThan(0)
    }
  })
})

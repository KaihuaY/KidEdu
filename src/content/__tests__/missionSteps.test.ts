import { describe, expect, it } from 'vitest'
import type { MissionStep } from '../lessons'
import { expandSteps } from '../missionSteps'

function doStep(title: string, alg = 'R'): MissionStep {
  return { kind: 'do', title, text: title, say: title, display: { setupAlg: 'z2', alg } }
}

function pickStep(): MissionStep {
  return {
    kind: 'pick',
    title: 'Which one looks like yours?',
    text: 'Pick one.',
    say: 'Pick one.',
    options: [
      { label: 'A', display: { setupAlg: 'z2', alg: '' }, then: [doStep('A1')] },
      { label: 'B', display: { setupAlg: 'z2', alg: '' }, then: [doStep('B1'), doStep('B2')] },
    ],
  }
}

describe('expandSteps', () => {
  it('leaves an unchosen pick step in the list as-is', () => {
    const steps = [pickStep()]
    const out = expandSteps(steps, {})
    expect(out).toHaveLength(1)
    expect(out[0].step.kind).toBe('pick')
    expect(out[0].topIndex).toBe(0)
  })

  it('replaces a chosen pick with that option\'s then steps', () => {
    const steps = [pickStep()]
    const out = expandSteps(steps, { 0: 1 })
    expect(out.map((o) => (o.step.kind === 'do' ? o.step.title : o.step.kind))).toEqual(['B1', 'B2'])
    expect(out.every((o) => o.topIndex === 0)).toBe(true)
  })

  it('"all" concatenates every option\'s then steps in order', () => {
    const steps = [pickStep()]
    const out = expandSteps(steps, { 0: 'all' })
    expect(out.map((o) => (o.step.kind === 'do' ? o.step.title : o.step.kind))).toEqual(['A1', 'B1', 'B2'])
    expect(out.every((o) => o.topIndex === 0)).toBe(true)
  })

  it('preserves non-pick steps and top-level indices around a pick (nesting depth 1 only)', () => {
    const before = doStep('Before')
    const after: MissionStep = { kind: 'practice', prompt: 'p', say: 's', sequence: 'R' }
    const steps = [before, pickStep(), after]

    const unchosen = expandSteps(steps, {})
    expect(unchosen.map((o) => o.topIndex)).toEqual([0, 1, 2])
    expect(unchosen[0].step).toBe(before)
    expect(unchosen[1].step.kind).toBe('pick')
    expect(unchosen[2].step).toBe(after)

    const chosen = expandSteps(steps, { 1: 0 })
    expect(chosen.map((o) => o.topIndex)).toEqual([0, 1, 2])
    expect(chosen[0].step).toBe(before)
    expect(chosen[1].step.kind).toBe('do')
    expect((chosen[1].step as { title: string }).title).toBe('A1')
    expect(chosen[2].step).toBe(after)
  })

  it('an out-of-range choice index drops that pick without throwing', () => {
    const steps = [pickStep()]
    const out = expandSteps(steps, { 0: 5 })
    expect(out).toEqual([])
  })
})

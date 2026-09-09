/**
 * Flattens a mission's top-level steps against the choices made on any
 * `pick` steps (see PickStep.tsx / MissionPlayer.tsx), so the player can walk
 * a single flat list of steps regardless of whether she has already chosen
 * a case or not.
 *
 * A `pick` step with no choice yet stays in the list as-is (the player shows
 * the picker when it gets there). Once chosen, it is replaced by that
 * option's `then` steps - or, for "Not sure, show me all", every option's
 * `then` steps concatenated in order. Only one level of nesting is
 * supported: a `then` list is never itself expanded for a nested pick (the
 * content model has none).
 */

import type { MissionStep, PickOption } from './lessons'

/** Per top-level step index: which option she picked (0-based), or 'all'. */
export type PickChoices = Record<number, number | 'all'>

export interface ExpandedStep {
  step: MissionStep
  /** The index of this step's originating top-level step (before expansion) - used to key the pick's own choice. */
  topIndex: number
}

export function expandSteps(steps: MissionStep[], choices: PickChoices): ExpandedStep[] {
  const out: ExpandedStep[] = []
  steps.forEach((step, topIndex) => {
    if (step.kind !== 'pick') {
      out.push({ step, topIndex })
      return
    }
    const choice = choices[topIndex]
    if (choice === undefined) {
      out.push({ step, topIndex })
      return
    }
    const chosenOptions: PickOption[] = choice === 'all' ? step.options : [step.options[choice]].filter(Boolean)
    for (const option of chosenOptions) {
      for (const thenStep of option.then) out.push({ step: thenStep, topIndex })
    }
  })
  return out
}

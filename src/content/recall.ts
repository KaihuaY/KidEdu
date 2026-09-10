/**
 * The "recall-before-show" question asked before a named trick's animation:
 * make her retrieve the first move from memory before she's shown it again.
 * Pure and deterministic - same `NamedAlg` always yields the same question,
 * answer and distractor (RecallPrompt.tsx randomises which button is left
 * or right, not the content itself).
 */

import { parseAlg } from '../engine/cube'
import type { NamedAlg } from '../engine/notation'
import { describeMove } from './moveNames'

export interface RecallQuestionInfo {
  question: string
  say: string
  answer: string
  distractor: string
}

/** Fallback distractor faces, tried in order, when every move in the trick shares the same kid-friendly name as the first. */
const FALLBACK_FACES = ['R', 'U', 'L', 'D', 'F', 'B']

/**
 * "Which move comes first in {kidName}?" - the answer is the first move's
 * kid-friendly name; the distractor is another move from the same trick with
 * a *different* name when one exists, otherwise a different face's move
 * entirely (so the two options are never identical text).
 */
export function recallQuestion(named: NamedAlg): RecallQuestionInfo {
  const moves = parseAlg(named.alg)
  const firstMove = moves[0] ?? ''
  const answer = describeMove(firstMove).name

  let distractorMove = moves.slice(1).find((move) => describeMove(move).name !== answer)
  if (!distractorMove) {
    const firstFace = firstMove[0]
    distractorMove = FALLBACK_FACES.find((face) => face !== firstFace) ?? 'U'
  }
  const distractor = describeMove(distractorMove).name

  return {
    question: `Which move comes first in ${named.kidName}?`,
    say: `Which move comes first in ${named.kidName}?`,
    answer,
    distractor,
  }
}

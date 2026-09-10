import { useMemo, useState } from 'react'
import { SayIt } from './SayIt'
import type { NamedAlg } from '../engine/notation'
import { recallQuestion } from '../content/recall'

export interface RecallPromptProps {
  named: NamedAlg
  /** Fires once, ~900ms after she taps either button - never blocks longer than that. */
  onRevealed: () => void
}

/** A small deterministic shuffle so the correct button isn't always on the same side, without needing real randomness. */
function answerGoesFirst(seed: string): boolean {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return (hash & 1) === 0
}

/** "Which move comes first?" - asked before a familiar trick's animation plays. Always resolves, right or wrong. */
export function RecallPrompt({ named, onRevealed }: RecallPromptProps) {
  const q = useMemo(() => recallQuestion(named), [named])
  const [picked, setPicked] = useState<'correct' | 'wrong' | null>(null)
  const options = useMemo(
    () => (answerGoesFirst(named.id) ? [q.answer, q.distractor] : [q.distractor, q.answer]),
    [named.id, q],
  )

  function choose(option: string) {
    if (picked) return
    setPicked(option === q.answer ? 'correct' : 'wrong')
    setTimeout(onRevealed, 900)
  }

  return (
    <div className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{q.question}</h2>
        <SayIt text={q.say} />
      </div>

      {picked === null ? (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="cc-btn cc-btn-surface"
              style={{ flex: 1, minWidth: 140, minHeight: 64, fontWeight: 800 }}
              onClick={() => choose(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontWeight: 800 }}>{picked === 'correct' ? 'Yes! 🎉' : `It's ${q.answer}. Watch:`}</p>
      )}
    </div>
  )
}

// Parent-facing editor for the three daily piano minute marks and the box
// tokens each one hands out (round 9). Mounted in Settings > Daily goals in
// place of the old fixed piano-goal buttons. Stays thin: all the stepping
// math (keep minutes ascending, clamp tokens 0-3) lives in
// src/store/marksEditor.ts so it's unit-tested without React.

import { setGoalMinutes, update, useProgress, type PianoMark, type TokenCounts } from '../store/progress'
import { DEFAULT_MARK_TOKENS, pianoMarks } from '../store/piano'
import { canStepMinutes, stepMarkMinutes, stepMarkTokens } from '../store/marksEditor'

/** Matches the built-in defaults in src/store/piano.ts (DEFAULT_MARK_MINUTES is private there). */
const DEFAULT_MARK_MINUTES = [10, 20, 30]

const ROW_LABELS = ['Mark 1 (ring goal)', 'Mark 2', 'Mark 3']

const TOKEN_TIERS: { tier: keyof TokenCounts; emoji: string; label: string }[] = [
  { tier: 'gold', emoji: '🟡', label: 'gold' },
  { tier: 'silver', emoji: '⚪', label: 'silver' },
  { tier: 'bronze', emoji: '🟤', label: 'bronze' },
]

const MAX_TOKENS_PER_TIER = 3

const stepperButtonStyle = { minHeight: 56, minWidth: 56, padding: 0 } as const

export function MarksEditor() {
  const progress = useProgress()
  const marks = pianoMarks(progress.settings)

  function commit(next: PianoMark[], row0MinutesChanged: boolean) {
    if (row0MinutesChanged) setGoalMinutes('piano', next[0].minutes)
    // Always write the full 3-entry array (built from pianoMarks(), which
    // already materialises the legacy pianoTiers migration when needed) so
    // settings.pianoMarks is fully populated from the very first edit.
    update('settings', (s) => ({ ...s, pianoMarks: next }))
  }

  function handleMinutesStep(row: number, delta: 1 | -1) {
    if (!canStepMinutes(marks, row, delta)) return
    commit(stepMarkMinutes(marks, row, delta), row === 0)
  }

  function handleTokenStep(row: number, tier: keyof TokenCounts, delta: 1 | -1) {
    commit(stepMarkTokens(marks, row, tier, delta), false)
  }

  function handleReset() {
    const next: PianoMark[] = DEFAULT_MARK_MINUTES.map((minutes, i) => ({ minutes, tokens: { ...DEFAULT_MARK_TOKENS[i] } }))
    commit(next, true)
  }

  return (
    <div data-testid="marks-editor" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {marks.map((mark, row) => {
        const n = row + 1
        const canMinus = canStepMinutes(marks, row, -1)
        return (
          <div key={row} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--cc-ink-soft)' }}>{ROW_LABELS[row]}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                className="cc-btn cc-btn-surface"
                data-testid={`mark-${n}-minus`}
                style={stepperButtonStyle}
                disabled={!canMinus}
                aria-label={`Mark ${n}: 5 fewer minutes`}
                onClick={() => handleMinutesStep(row, -1)}
              >
                −
              </button>
              <span data-testid={`mark-${n}-minutes`} style={{ minWidth: '5ch', textAlign: 'center', fontWeight: 800, fontSize: '1.1rem' }}>
                {mark.minutes} min
              </span>
              <button
                type="button"
                className="cc-btn cc-btn-surface"
                data-testid={`mark-${n}-plus`}
                style={stepperButtonStyle}
                aria-label={`Mark ${n}: 5 more minutes`}
                onClick={() => handleMinutesStep(row, 1)}
              >
                ＋
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {TOKEN_TIERS.map(({ tier, emoji, label }) => {
                const count = mark.tokens[tier]
                return (
                  <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      type="button"
                      className="cc-btn cc-btn-surface"
                      data-testid={`mark-${n}-${tier}-minus`}
                      style={{ ...stepperButtonStyle, minWidth: 44 }}
                      disabled={count <= 0}
                      aria-label={`Mark ${n}: one fewer ${label} token`}
                      onClick={() => handleTokenStep(row, tier, -1)}
                    >
                      −
                    </button>
                    <span
                      data-testid={`mark-${n}-${tier}`}
                      aria-label={`Mark ${n} ${label} tokens`}
                      style={{ minWidth: '2.5ch', textAlign: 'center', fontWeight: 700 }}
                    >
                      {emoji} {count}
                    </span>
                    <button
                      type="button"
                      className="cc-btn cc-btn-surface"
                      data-testid={`mark-${n}-${tier}-plus`}
                      style={{ ...stepperButtonStyle, minWidth: 44 }}
                      disabled={count >= MAX_TOKENS_PER_TIER}
                      aria-label={`Mark ${n}: one more ${label} token`}
                      onClick={() => handleTokenStep(row, tier, 1)}
                    >
                      ＋
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <button
        type="button"
        className="cc-btn cc-btn-surface"
        style={{ alignSelf: 'flex-start', minHeight: 56 }}
        onClick={handleReset}
      >
        Reset to default (10 / 20 / 30 min)
      </button>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--cc-ink-soft)' }}>
        Mark 1 is the ring on Piano home and keeps the streak. Each mark gives its tokens once a day.
      </p>
    </div>
  )
}

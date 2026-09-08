import { useEffect, useMemo, useState } from 'react'
import { TwistyCube } from './TwistyCube'
import { SayIt } from './SayIt'
import { applyAlg, invertAlg } from '../engine/cube'
import { NAMED_ALGS } from '../engine/notation'
import type { PhaseId } from '../engine/solver'
import type { FlatStep } from '../engine/progress'

export const PHASE_TITLES: Record<PhaseId, string> = {
  daisy: 'Daisy',
  cross: 'Cross',
  corners: 'Corners',
  middle: 'Middle',
  yellowCross: 'Yellow Cross',
  yellowEdges: 'Yellow Edges',
  cornerPosition: 'Corner Position',
  cornerOrient: 'Corner Twist',
}

export interface WalkthroughProps {
  steps: FlatStep[]
  /** The facelet state these steps start from. */
  startState: string
  onFinished: () => void
  /** Fires with the cube state Nora's physical cube should be in right now
   * (startState plus every step she's already marked "I did it" on), so a
   * caller can fall back to it (e.g. "scan again to check"). */
  onProgress?: (state: string) => void
  /** Animation speed multiplier for the step's TwistyCube; 1 is normal speed. */
  tempoScale?: number
}

/**
 * Walks Nora through a sequence of solver steps one at a time: "I did it" to
 * advance, "Back" to revisit. `key={startState}` at the mount site resets the
 * cursor whenever the underlying cube state changes (e.g. after a re-scan).
 */
export function Walkthrough({ steps, startState, onFinished, onProgress, tempoScale = 1 }: WalkthroughProps) {
  const [cursor, setCursor] = useState(0)
  const finished = cursor >= steps.length

  useEffect(() => {
    if (finished) onFinished()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  useEffect(() => {
    if (!onProgress) return
    const doneAlg = steps
      .slice(0, cursor)
      .map((f) => f.step.alg)
      .filter((a) => a.trim() !== '')
      .join(' ')
    onProgress(applyAlg(startState, doneAlg))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, steps, startState])

  const stepsInCurrentPhase = useMemo(() => {
    if (finished) return []
    const phaseId = steps[cursor].phaseId
    return steps.filter((s) => s.phaseId === phaseId)
  }, [steps, cursor, finished])

  if (steps.length === 0 || finished) {
    return null
  }

  const current = steps[cursor]
  const remainingAlg = steps
    .slice(cursor)
    .map((f) => f.step.alg)
    .filter((a) => a.trim() !== '')
    .join(' ')
  const setupAlg = 'z2 ' + invertAlg(remainingAlg)
  const namedAlgId = current.step.namedAlgId
  const namedAlg = namedAlgId ? NAMED_ALGS.find((a) => a.id === namedAlgId) : undefined
  const repeat = current.step.repeat ?? 1
  // Show the trick once in standard notation (with a "x n" label) rather than the fully expanded alg.
  const moveChips = (namedAlg ? namedAlg.alg : current.step.alg).split(' ').filter(Boolean)
  const doneCount = steps.filter((_, i) => i < cursor).length
  const indexInPhase = stepsInCurrentPhase.findIndex((s) => s === current)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.2rem' }} aria-label="Overall progress">
        {steps.map((_, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              background: i < doneCount ? 'var(--cc-success)' : i === cursor ? 'var(--cc-primary)' : 'var(--cc-border)',
            }}
          />
        ))}
      </div>
      <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
        {PHASE_TITLES[current.phaseId]} - step {indexInPhase + 1} of {stepsInCurrentPhase.length}
      </p>

      <div className="cc-card" style={{ height: 300, padding: '0.5rem' }}>
        <TwistyCube setupAlg={setupAlg} alg={current.step.alg} controls="bottom-row" tempoScale={tempoScale} />
      </div>

      <div className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <strong>{current.step.note}</strong>
          <SayIt text={current.step.note} />
        </div>
        {moveChips.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {namedAlg && (
              <span style={{ fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
                {namedAlg.kidName}
                {repeat > 1 ? ` × ${repeat}` : ''}
              </span>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }} aria-label="Moves in cube notation">
              {moveChips.map((m, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: 'ui-monospace, Consolas, monospace',
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    padding: '0.35rem 0.7rem',
                    borderRadius: '0.75rem',
                    background: 'var(--cc-bg)',
                    border: '1px solid var(--cc-border)',
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          disabled={cursor === 0}
          onClick={() => setCursor((c) => Math.max(0, c - 1))}
        >
          ◀ Back
        </button>
        <button type="button" className="cc-btn cc-btn-primary" onClick={() => setCursor((c) => c + 1)}>
          I did it ✅
        </button>
      </div>
    </div>
  )
}

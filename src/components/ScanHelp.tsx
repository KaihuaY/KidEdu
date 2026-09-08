import { useMemo, useState } from 'react'
import { CameraScan } from './CameraScan'
import { ColorNet } from './ColorNet'
import { SayIt } from './SayIt'
import { Walkthrough } from './Walkthrough'
import { fireConfetti } from './Confetti'
import { blankFacelets } from '../engine/cubeScan'
import { validateFacelets } from '../engine/validate'
import { isPhaseDone, solveLBL, type Solution } from '../engine/solver'
import { stepsToGoal, stepsToPhase, type FlatStep } from '../engine/progress'
import type { Mission } from '../content/lessons'

export interface ScanHelpProps {
  mission: Mission
  tempoScale: number
  onPassed: () => void
  onWalkedThrough: () => void
  onCancel: () => void
}

type Phase =
  | 'scan'
  | 'fix'
  | 'error'
  | 'prereq-intro'
  | 'prereq-walk'
  | 'goal-intro'
  | 'goal-walk'

/**
 * "Show me my cube" - the camera-scan help flow for one mission:
 *   scan -> (fix any '?'/invalid stickers) -> if a prereq phase isn't done
 *   yet, a FREE walkthrough gets her there first -> then either she already
 *   passes the mission's own goal (confetti!) or a walkthrough shows her the
 *   remaining steps.
 */
export function ScanHelp({ mission, tempoScale, onPassed, onWalkedThrough, onCancel }: ScanHelpProps) {
  const [phase, setPhase] = useState<Phase>('scan')
  const [facelets, setFacelets] = useState<string>(() => blankFacelets())
  const [solution, setSolution] = useState<Solution | null>(null)
  const [prereqSteps, setPrereqSteps] = useState<FlatStep[]>([])
  const [goalSteps, setGoalSteps] = useState<FlatStep[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [expectedState, setExpectedState] = useState<string>(facelets)

  const unknownCount = useMemo(() => facelets.split('').filter((c) => c === '?').length, [facelets])
  const validation = unknownCount === 0 ? validateFacelets(facelets) : null

  function handleScanned(scanned: string) {
    setFacelets(scanned)
    setExpectedState(scanned)
    const unknowns = scanned.split('').filter((c) => c === '?').length
    if (unknowns > 0 || !validateFacelets(scanned).ok) {
      setPhase('fix')
      return
    }
    proceedFrom(scanned)
  }

  function proceedFrom(state: string) {
    let sol: Solution
    try {
      sol = solveLBL(state)
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "I could not figure this cube out. Let's check the colours again.",
      )
      setPhase('error')
      return
    }
    setSolution(sol)

    if (mission.prereqPhase && !isPhaseDone(state, mission.prereqPhase)) {
      setPrereqSteps(stepsToPhase(sol, state, mission.prereqPhase))
      setPhase('prereq-intro')
      return
    }
    checkGoal(state, sol)
  }

  function checkGoal(state: string, sol: Solution) {
    if (mission.goalCheck(state).done) {
      fireConfetti('small')
      onPassed()
      return
    }
    if (!mission.goalPhase) {
      // No bounded phase to walk to (shouldn't normally happen - onScan is
      // only offered when goalPhase is set) - treat as "not there yet" and
      // let her keep trying on her own cube rather than crash.
      onCancel()
      return
    }
    setGoalSteps(stepsToGoal(sol, state, mission.goalPhase, mission.goalCheck))
    setPhase('goal-intro')
  }

  function handleFixDone() {
    proceedFrom(facelets)
  }

  function rescan() {
    setPhase('scan')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        background: 'var(--cc-bg, #fff)',
        overflowY: 'auto',
        padding: '1rem',
        paddingTop: 'max(1rem, var(--cc-safe-top))',
        paddingBottom: 'max(1rem, var(--cc-safe-bottom))',
      }}
    >
      {phase === 'scan' && (
        <CameraScan initialFacelets={facelets} onDone={handleScanned} onCancel={onCancel} />
      )}

      {phase === 'fix' && (
        <div className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>A few stickers need a look</h2>
          <p style={{ margin: 0 }}>Tap a colour below, then tap the squares that show it, to fix any grey squares.</p>
          <ColorNet
            value={facelets}
            onChange={setFacelets}
            invalidFacelets={validation && !validation.ok ? validation.facelets : undefined}
          />
          {unknownCount > 0 && (
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>{unknownCount} stickers to go</p>
          )}
          {unknownCount === 0 && validation && !validation.ok && (
            <p style={{ margin: 0 }}>{validation.message}</p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="cc-btn cc-btn-surface" onClick={rescan}>
              📷 Scan again
            </button>
            <button
              type="button"
              className="cc-btn cc-btn-primary"
              disabled={!validation || !validation.ok}
              onClick={handleFixDone}
            >
              Check it ✅
            </button>
          </div>
          <button type="button" className="cc-btn cc-btn-surface" onClick={onCancel}>
            ✖ Cancel
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="cc-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{errorMessage}</p>
          <button type="button" className="cc-btn cc-btn-primary" onClick={rescan}>
            📷 Try scanning again
          </button>
          <button type="button" className="cc-btn cc-btn-surface" onClick={onCancel}>
            ◀ Back
          </button>
        </div>
      )}

      {phase === 'prereq-intro' && (
        <div className="cc-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>First let's get your cube ready</h2>
          <p style={{ margin: 0, fontWeight: 700 }}>
            You know these steps! ({prereqSteps.length} step{prereqSteps.length === 1 ? '' : 's'})
          </p>
          <SayIt text="First let's get your cube ready. You already know these steps." />
          <button type="button" className="cc-btn cc-btn-primary" onClick={() => setPhase('prereq-walk')}>
            Show me ▶
          </button>
        </div>
      )}

      {phase === 'prereq-walk' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Walkthrough
            key={expectedState}
            steps={prereqSteps}
            startState={expectedState}
            onFinished={() => {
              /* she taps "Ready, continue" below once she's done */
            }}
            onProgress={setExpectedState}
            tempoScale={tempoScale}
          />
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="cc-btn cc-btn-surface" onClick={rescan}>
              📷 Scan again
            </button>
            <button
              type="button"
              className="cc-btn cc-btn-primary"
              onClick={() => {
                if (!solution) return
                checkGoal(expectedState, solution)
              }}
            >
              Ready, continue ▶
            </button>
          </div>
        </div>
      )}

      {phase === 'goal-intro' && (
        <div className="cc-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Almost there!</h2>
          <p style={{ margin: 0, fontWeight: 700 }}>
            Your cube needs {goalSteps.length} step{goalSteps.length === 1 ? '' : 's'} to get there.
          </p>
          <button type="button" className="cc-btn cc-btn-primary" onClick={() => setPhase('goal-walk')}>
            Show me ▶
          </button>
        </div>
      )}

      {phase === 'goal-walk' && (
        <Walkthrough
          key={expectedState}
          steps={goalSteps}
          startState={expectedState}
          onFinished={onWalkedThrough}
          onProgress={setExpectedState}
          tempoScale={tempoScale}
        />
      )}
    </div>
  )
}

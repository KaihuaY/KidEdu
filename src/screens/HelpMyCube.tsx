import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../router'
import { ColorNet } from '../components/ColorNet'
import { TwistyCube } from '../components/TwistyCube'
import { SayIt } from '../components/SayIt'
import { fireConfetti } from '../components/Confetti'
import { invertAlg } from '../engine/cube'
import { CENTER_INDICES } from '../engine/pieces'
import { validateFacelets } from '../engine/validate'
import { NAMED_ALGS } from '../engine/notation'
import { detectPhase, solveLBL, type PhaseId, type Solution, type SolveStep } from '../engine/solver'
import { holdForPhase } from '../content/lessons'
import { useActiveProfile } from '../store/activeProfile'
import { useProgress } from '../store/progress'
import { logSolve } from '../store/solves'

const NET_STORAGE_KEY = 'cubeclimb.help.net'
const CENTER_LETTERS = ['U', 'R', 'F', 'D', 'L', 'B']

function blankNet(): string {
  const chars = Array.from({ length: 54 }, () => '?')
  CENTER_INDICES.forEach((idx, i) => {
    chars[idx] = CENTER_LETTERS[i]
  })
  return chars.join('')
}

function readStoredNet(): string {
  try {
    if (typeof sessionStorage === 'undefined') return blankNet()
    const raw = sessionStorage.getItem(NET_STORAGE_KEY)
    return raw && raw.length === 54 ? raw : blankNet()
  } catch {
    return blankNet()
  }
}

function writeStoredNet(facelets: string): void {
  try {
    sessionStorage?.setItem(NET_STORAGE_KEY, facelets)
  } catch {
    // ignore - the net just won't survive a refresh
  }
}

interface FlatStep {
  phaseId: PhaseId
  phaseIndex: number
  stepIndexInPhase: number
  step: SolveStep
}

function flattenSteps(solution: Solution): FlatStep[] {
  const out: FlatStep[] = []
  solution.phases.forEach((phase, phaseIndex) => {
    phase.steps.forEach((step, stepIndexInPhase) => {
      out.push({ phaseId: phase.id, phaseIndex, stepIndexInPhase, step })
    })
  })
  return out
}

const PHASE_TITLES: Record<PhaseId, string> = {
  daisy: 'Daisy',
  cross: 'Cross',
  corners: 'Corners',
  middle: 'Middle',
  yellowCross: 'Yellow Cross',
  yellowEdges: 'Yellow Edges',
  cornerPosition: 'Corner Position',
  cornerOrient: 'Corner Twist',
}

function Walkthrough({
  solution,
  onFinished,
}: {
  solution: Solution
  onFinished: () => void
}) {
  const flatSteps = useMemo(() => flattenSteps(solution), [solution])
  const [cursor, setCursor] = useState(0)
  const finished = cursor >= flatSteps.length

  useEffect(() => {
    if (finished) onFinished()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  if (flatSteps.length === 0 || finished) {
    return null
  }

  const current = flatSteps[cursor]
  const remainingAlg = flatSteps
    .slice(cursor)
    .map((f) => f.step.alg)
    .filter((a) => a.trim() !== '')
    .join(' ')
  const setupAlg = 'z2 ' + invertAlg(remainingAlg)
  const namedAlgId = current.step.namedAlgId
  const namedAlg = namedAlgId ? NAMED_ALGS.find((a) => a.id === namedAlgId) : undefined
  const repeat = current.step.repeat ?? 1
  // Show the trick once in standard notation (with a "× n" label) rather than the fully expanded alg.
  const moveChips = (namedAlg ? namedAlg.alg : current.step.alg).split(' ').filter(Boolean)
  const doneCount = flatSteps.filter((_, i) => i < cursor).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.2rem' }} aria-label="Overall progress">
        {flatSteps.map((_, i) => (
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
        {PHASE_TITLES[current.phaseId]} - step {current.stepIndexInPhase + 1} of{' '}
        {solution.phases[current.phaseIndex].steps.length}
      </p>

      <div className="cc-card" style={{ height: 300, padding: '0.5rem' }}>
        <TwistyCube setupAlg={setupAlg} alg={current.step.alg} controls="bottom-row" />
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

export function HelpMyCube() {
  const [facelets, setFacelets] = useState<string>(() => readStoredNet())
  const [solution, setSolution] = useState<{ original: string; solution: Solution } | null>(null)
  const [solveError, setSolveError] = useState<string | null>(null)
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const activeProfile = useActiveProfile()
  const progress = useProgress()

  useEffect(() => {
    writeStoredNet(facelets)
  }, [facelets])

  const unknownCount = useMemo(() => facelets.split('').filter((c) => c === '?').length, [facelets])
  const validation = unknownCount === 0 ? validateFacelets(facelets) : null

  function solveIt() {
    setSolveError(null)
    try {
      const result = solveLBL(facelets)
      setSolution({ original: facelets, solution: result })
    } catch (err) {
      setSolveError(err instanceof Error ? err.message : 'I could not figure this cube out. Let’s check the colours again.')
    }
  }

  function handleFinished() {
    const { firstEverForProfile } = logSolve(activeProfile, null)
    fireConfetti('big')
    setCelebrating(
      firstEverForProfile
        ? `${progress.settings.kidName} solved the whole cube! 🏆 A gold token is yours!`
        : 'SOLVED! 🎉 Great job putting it all back together.',
    )
  }

  function startOver() {
    setSolution(null)
    setSolveError(null)
    setCelebrating(null)
    setFacelets(blankNet())
  }

  if (solution) {
    const phaseAtStart = detectPhase(solution.original)
    const startHoldLesson = phaseAtStart === 'solved' ? undefined : holdForPhase(phaseAtStart)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Let&apos;s solve it together!</h1>
        {startHoldLesson && (
          <button
            type="button"
            className="cc-btn cc-btn-surface"
            onClick={() => navigate(`/lesson/${startHoldLesson.id}`)}
            style={{ alignSelf: 'flex-start' }}
          >
            You&apos;re on hold: {startHoldLesson.title} - go practice it →
          </button>
        )}

        {!celebrating && (
          <Walkthrough solution={solution.solution} onFinished={handleFinished} />
        )}

        {celebrating && (
          <div className="cc-card" style={{ padding: '1.75rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{celebrating}</h2>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="cc-btn cc-btn-surface" onClick={startOver}>
                Scramble another cube
              </button>
              <button type="button" className="cc-btn cc-btn-primary" onClick={() => navigate('/wall')}>
                Back to the Wall
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingTop: '1.5rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', paddingBottom: '2rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Help with my cube</h1>
      <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>
        Copy your real, scrambled cube onto this picture, sticker by sticker. Tap a colour below, then tap the squares
        that show it.
      </p>

      <div className="cc-card" style={{ padding: '1rem' }}>
        <ColorNet value={facelets} onChange={setFacelets} invalidFacelets={validation && !validation.ok ? validation.facelets : undefined} />
      </div>

      {unknownCount > 0 && (
        <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>{unknownCount} stickers to go</p>
      )}

      {unknownCount === 0 && validation && !validation.ok && (
        <div className="cc-card" style={{ padding: '1rem', background: 'var(--cc-bg)' }}>
          <p style={{ margin: 0 }}>{validation.message}</p>
        </div>
      )}

      {solveError && (
        <div className="cc-card" style={{ padding: '1rem', background: 'var(--cc-bg)' }}>
          <p style={{ margin: 0 }}>{solveError}</p>
        </div>
      )}

      <button
        type="button"
        className="cc-btn cc-btn-primary"
        disabled={!validation || !validation.ok}
        onClick={solveIt}
      >
        Solve it!
      </button>
    </div>
  )
}

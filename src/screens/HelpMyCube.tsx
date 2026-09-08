import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../router'
import { ColorNet } from '../components/ColorNet'
import { fireConfetti } from '../components/Confetti'
import { CameraScan } from '../components/CameraScan'
import { Walkthrough } from '../components/Walkthrough'
import { isSolved } from '../engine/cube'
import { blankFacelets } from '../engine/cubeScan'
import { validateFacelets } from '../engine/validate'
import { detectPhase, solveLBL, type Solution } from '../engine/solver'
import { flattenSteps } from '../engine/progress'
import { holdForPhase } from '../content/lessons'
import { useProgress } from '../store/progress'
import { logSolve } from '../store/solves'
import { CubeTabs } from '../components/CubeTabs'

const NET_STORAGE_KEY = 'cubeclimb.help.net'

function readStoredNet(): string {
  try {
    if (typeof sessionStorage === 'undefined') return blankFacelets()
    const raw = sessionStorage.getItem(NET_STORAGE_KEY)
    return raw && raw.length === 54 ? raw : blankFacelets()
  } catch {
    return blankFacelets()
  }
}

function writeStoredNet(facelets: string): void {
  try {
    sessionStorage?.setItem(NET_STORAGE_KEY, facelets)
  } catch {
    // ignore - the net just won't survive a refresh
  }
}

export function HelpMyCube() {
  const [facelets, setFacelets] = useState<string>(() => readStoredNet())
  const [solution, setSolution] = useState<{ original: string; solution: Solution } | null>(null)
  const [solveError, setSolveError] = useState<string | null>(null)
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  // What Nora's physical cube should currently look like, kept up to date by
  // Walkthrough as she checks off steps - used as the "keep whatever was
  // there" fallback when she scans again to check her progress.
  const [expectedState, setExpectedState] = useState<string>(facelets)
  const progress = useProgress()

  useEffect(() => {
    writeStoredNet(facelets)
  }, [facelets])

  const unknownCount = useMemo(() => facelets.split('').filter((c) => c === '?').length, [facelets])
  const validation = unknownCount === 0 ? validateFacelets(facelets) : null

  function handleFaceletsChange(next: string) {
    setFacelets(next)
    setScanMessage(null)
  }

  function solveIt() {
    setSolveError(null)
    try {
      const result = solveLBL(facelets)
      setSolution({ original: facelets, solution: result })
      setExpectedState(facelets)
    } catch (err) {
      setSolveError(err instanceof Error ? err.message : 'I could not figure this cube out. Let’s check the colours again.')
    }
  }

  function handleFinished() {
    const { firstEverForProfile } = logSolve('kid', null)
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
    setScanMessage(null)
    setFacelets(blankFacelets())
  }

  function handleInitialScanDone(scanned: string) {
    setScanning(false)
    setFacelets(scanned)
    const unknowns = scanned.split('').filter((c) => c === '?').length
    setScanMessage(
      unknowns > 0
        ? `I read your cube! ${unknowns} sticker${unknowns === 1 ? '' : 's'} weren't clear - fix those, then press Solve.`
        : 'I read your cube! Fix any sticker that looks wrong, then press Solve.',
    )
  }

  function handleRescanDone(scanned: string) {
    setScanning(false)
    const unknowns = scanned.split('').filter((c) => c === '?').length

    if (unknowns > 0 || !validateFacelets(scanned).ok) {
      // Couldn't make full sense of the cube - drop back to the tap-to-fix
      // screen instead of guessing.
      setSolution(null)
      setCelebrating(null)
      setFacelets(scanned)
      return
    }

    if (isSolved(scanned)) {
      setSolution(null)
      setCelebrating('Your cube looks solved! 🎉 Great job.')
      fireConfetti('big')
      return
    }

    setSolveError(null)
    try {
      const result = solveLBL(scanned)
      setSolution({ original: scanned, solution: result })
      setExpectedState(scanned)
      setCelebrating(null)
    } catch (err) {
      setSolution(null)
      setFacelets(scanned)
      setSolveError(
        err instanceof Error
          ? err.message
          : 'I could not figure this cube out from that scan. Let’s check the colours again.',
      )
    }
  }

  if (solution) {
    const phaseAtStart = detectPhase(solution.original)
    const startHoldLesson = phaseAtStart === 'solved' ? undefined : holdForPhase(phaseAtStart)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <CubeTabs />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0 1rem 2rem' }}>
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

        <button
          type="button"
          className="cc-btn cc-btn-surface"
          onClick={() => setScanning(true)}
          style={{ alignSelf: 'flex-start' }}
        >
          📷 Scan again to check
        </button>

        {!celebrating && (
          <Walkthrough
            key={solution.original}
            steps={flattenSteps(solution.solution)}
            startState={solution.original}
            onFinished={handleFinished}
            onProgress={setExpectedState}
          />
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
        {scanning && (
          <CameraScan initialFacelets={expectedState} onDone={handleRescanDone} onCancel={() => setScanning(false)} />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <CubeTabs />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingTop: '0.5rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', paddingBottom: '2rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Help with my cube</h1>

      <button
        type="button"
        className="cc-btn cc-btn-primary"
        style={{ minHeight: 72, fontSize: '1.1rem' }}
        onClick={() => setScanning(true)}
      >
        📷 Scan my cube
      </button>

      <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>
        ✏️ Or tap the colours: copy your real, scrambled cube onto this picture, sticker by sticker. Tap a colour
        below, then tap the squares that show it.
      </p>

      {scanMessage && (
        <div className="cc-card" style={{ padding: '1rem', background: 'var(--cc-bg)' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{scanMessage}</p>
        </div>
      )}

      <div className="cc-card" style={{ padding: '1rem' }}>
        <ColorNet
          value={facelets}
          onChange={handleFaceletsChange}
          invalidFacelets={validation && !validation.ok ? validation.facelets : undefined}
        />
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
      {scanning && (
        <CameraScan initialFacelets={facelets} onDone={handleInitialScanDone} onCancel={() => setScanning(false)} />
      )}
    </div>
  )
}

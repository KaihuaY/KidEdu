import { useCallback, useEffect, useRef, useState } from 'react'
import { TwistyCube, type TwistyCubeHandle, type TwistyCubeProps } from './TwistyCube'
import { parseAlg } from '../engine/cube'
import { describeMove } from '../content/moveNames'

export interface FollowAlongProps {
  display: { setupAlg: string; alg: string }
  stickering?: string
  backView?: boolean
  tempoScale: number
  /** Show the raw notation letter (R, U'...) alongside the kid-friendly name. */
  showLetters: boolean
  /** Fires once, the moment the last move is confirmed done. */
  onFinished: () => void
}

/** Roughly how long one cube move takes to animate, at tempoScale 1. */
const MOVE_MS = 600

/** One move at a time: a paused TwistyCube plus "Show me" / "Again" / "Did it" controls. */
export function FollowAlong({ display, stickering, backView, tempoScale, showLetters, onFinished }: FollowAlongProps) {
  const ref = useRef<TwistyCubeHandle | null>(null)
  const moves = parseAlg(display.alg)
  const total = moves.length
  const [moveIndex, setMoveIndex] = useState(0)
  const [shown, setShown] = useState(false)
  const [animating, setAnimating] = useState(false)

  // A fresh case (new display) always starts paused at the beginning.
  useEffect(() => {
    ref.current?.jumpToStart()
    setMoveIndex(0)
    setShown(false)
    setAnimating(false)
  }, [display.setupAlg, display.alg])

  const animMs = Math.max(150, MOVE_MS / tempoScale)

  const handleMoveIndex = useCallback(
    (index: number, indexTotal: number) => {
      // She might use the cube's own control bar instead of our buttons -
      // guard the async `total` (0 until cubing.js resolves the indexer).
      // A fresh listener also fires once immediately on mount/re-subscribe
      // with the *current* position (not a move she just made), and our own
      // Show me/Did it buttons already drive moveIndex one step at a time -
      // so only react here when she genuinely jumped ahead via the cube's
      // own controls (more than the one step our buttons would produce).
      if (indexTotal === 0) return
      if (index >= indexTotal) {
        onFinished()
        return
      }
      setMoveIndex((prev) => (index > prev + 1 ? index : prev))
    },
    [onFinished],
  )

  function showMove() {
    if (animating || total === 0) return
    setAnimating(true)
    ref.current?.stepForward()
    setShown(true)
    setTimeout(() => setAnimating(false), animMs)
  }

  function again() {
    if (animating || total === 0) return
    setAnimating(true)
    ref.current?.stepBackward()
    setTimeout(() => {
      ref.current?.stepForward()
      setTimeout(() => setAnimating(false), animMs)
    }, 150)
  }

  function didIt() {
    if (!shown) ref.current?.stepForward()
    const next = moveIndex + 1
    setShown(false)
    if (next >= total) {
      onFinished()
      return
    }
    setMoveIndex(next)
  }

  const move = moves[moveIndex]
  const described = move ? describeMove(move) : { name: '' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="cc-card" style={{ height: 240, padding: '0.5rem' }}>
        <TwistyCube
          ref={ref}
          setupAlg={display.setupAlg}
          alg={display.alg}
          stickering={stickering as TwistyCubeProps['stickering']}
          backView={backView ? 'top-right' : 'none'}
          tempoScale={tempoScale}
          controls="bottom-row"
          onMoveIndex={handleMoveIndex}
        />
      </div>

      {total > 0 && (
        <div
          className="cc-card"
          style={{
            padding: '0.9rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
            Move {moveIndex + 1} of {total}
          </p>
          <p style={{ margin: 0, fontWeight: 900, fontSize: '1.2rem' }}>
            {described.name}
            {showLetters && move && <span style={{ opacity: 0.6, fontWeight: 700 }}> ({move})</span>}
          </p>
          {described.detail && (
            <p style={{ margin: 0, color: 'var(--cc-ink-soft)', fontWeight: 600 }}>{described.detail}</p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {!shown ? (
              <button
                type="button"
                className="cc-btn cc-btn-primary"
                style={{ minHeight: 56, minWidth: 130 }}
                disabled={animating}
                onClick={showMove}
              >
                ▶ Show me
              </button>
            ) : (
              <button
                type="button"
                className="cc-btn cc-btn-surface"
                style={{ minHeight: 56, minWidth: 130 }}
                disabled={animating}
                onClick={again}
              >
                ↺ Again
              </button>
            )}
            <button
              type="button"
              className="cc-btn cc-btn-primary"
              style={{ minHeight: 56, minWidth: 130 }}
              onClick={didIt}
            >
              Did it ✅
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

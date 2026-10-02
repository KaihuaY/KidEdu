// The "Surprise me" picker: a slot-machine reel that lands on a random song
// from the parent's surprise list. One re-spin per pick. The pick itself is
// stored by src/store/randomSong.ts; recording it for >= 20 s counts toward
// the daily "10 surprise songs = gold box" goal.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProgress, type PianoPiece } from '../store/progress'
import { randomPool, randomStatus, readPick, reelSequence, respin, spin, type RandomPick } from '../store/randomSong'
import { usePrefersReducedMotion } from '../utils/reducedMotion'
import { fireConfetti } from './Confetti'
import { SayIt } from './SayIt'

const ROW = 64
const ROLL_MS = 2600

function Reel({
  pool,
  chosen,
  animate,
  landed,
  onLanded,
}: {
  pool: PianoPiece[]
  chosen: PianoPiece
  animate: boolean
  landed: boolean
  onLanded: () => void
}) {
  // Built once per mount; the parent remounts this (new `key`) for every spin.
  const [rows] = useState<PianoPiece[]>(() => {
    const seq = reelSequence(pool, chosen)
    return [...seq, pool[0] ?? chosen]
  })
  const chosenIndex = rows.length - 2
  const finalY = -(chosenIndex - 1) * ROW
  const [go, setGo] = useState(!animate)
  const landedRef = useRef(false)
  const onLandedRef = useRef(onLanded)
  useEffect(() => {
    onLandedRef.current = onLanded
  })

  function land() {
    if (landedRef.current) return
    landedRef.current = true
    if (animate) fireConfetti('small')
    onLandedRef.current()
  }

  useEffect(() => {
    if (!animate) {
      land()
      return undefined
    }
    let id2 = 0
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setGo(true))
    })
    const safety = window.setTimeout(land, ROLL_MS + 400)
    return () => {
      cancelAnimationFrame(id1)
      cancelAnimationFrame(id2)
      window.clearTimeout(safety)
    }
    // Runs once per mount (the parent re-keys this component per spin).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      data-testid="random-reel"
      data-rolling={landed ? 'false' : 'true'}
      style={{
        height: 3 * ROW,
        overflow: 'hidden',
        position: 'relative',
        borderRadius: 'var(--cc-radius)',
        border: '2px solid var(--cc-border)',
        background: 'var(--cc-bg)',
      }}
    >
      <div
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget) land()
        }}
        style={{
          transform: `translateY(${go ? finalY : 0}px)`,
          transition: animate && go ? `transform ${ROLL_MS}ms cubic-bezier(0.12, 0.8, 0.2, 1)` : 'none',
        }}
      >
        {rows.map((p, i) => (
          <div
            key={i}
            style={{
              height: ROW,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.1rem',
              padding: '0 0.75rem',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {p.emoji} {p.name}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: ROW,
          height: ROW,
          boxSizing: 'border-box',
          border: '3px solid var(--cc-accent)',
          borderRadius: 'var(--cc-radius)',
          pointerEvents: 'none',
          animation: landed && animate ? 'cc-reel-land 450ms ease-out' : undefined,
        }}
      />
    </div>
  )
}

export function RandomSongPicker({
  today,
  freshSpin,
  onRecord,
  onClose,
}: {
  today: string
  /** true = always start with a new spin (the "Next surprise song" path); false = show today's stored pick if there is one, else spin. */
  freshSpin?: boolean
  /** Called synchronously inside the "Record it" tap (Safari needs the mic request in the gesture). */
  onRecord: (pieceId: string) => void
  onClose: () => void
}) {
  const progress = useProgress()
  const reduced = usePrefersReducedMotion()
  const pool = randomPool(progress.settings.pianoPieces)
  const status = randomStatus(progress, today)

  const [init] = useState<{ pick: RandomPick | null; existing: boolean }>(() => {
    const existing = freshSpin ? null : readPick(today)
    if (existing) return { pick: existing, existing: true }
    return { pick: spin(today), existing: false }
  })
  const [pick, setPick] = useState<RandomPick | null>(init.pick)
  const [spinKey, setSpinKey] = useState(0)
  const [animate, setAnimate] = useState(!init.existing && !reduced)
  const [landed, setLanded] = useState(init.existing || reduced)

  const piece = pick ? pool.find((p) => p.id === pick.pieceId) : undefined
  const vanished = !!pick && !piece

  useEffect(() => {
    if (vanished) onClose()
  }, [vanished, onClose])

  if (typeof document === 'undefined') return null

  const header = status.earned
    ? `🎲 ${status.goal} of ${status.goal} today · 🟡 gold box earned!`
    : `🎲 Surprise songs today: ${Math.min(status.done, status.goal)} of ${status.goal} · ${status.goal} = 🟡 gold box`

  function onRespin() {
    const next = respin(today)
    if (!next) return
    const willAnimate = !reduced
    setPick(next)
    setAnimate(willAnimate)
    setLanded(!willAnimate)
    setSpinKey((k) => k + 1)
  }

  let body
  if (!pick || !piece) {
    body = (
      <>
        <p style={{ margin: 0, textAlign: 'center', fontWeight: 700 }}>
          🎲 Ask a grown-up to add songs to the surprise list in Settings.
        </p>
        <button type="button" className="cc-btn cc-btn-surface" style={{ minHeight: 56 }} data-testid="random-close" onClick={onClose}>
          Close
        </button>
      </>
    )
  } else {
    const noSpins = pick.respinUsed || pool.length < 2
    body = (
      <>
        <p data-testid="random-header" style={{ margin: 0, fontWeight: 700, textAlign: 'center' }}>
          {header}
        </p>
        <Reel key={spinKey} pool={pool} chosen={piece} animate={animate} landed={landed} onLanded={() => setLanded(true)} />
        {!landed && (
          <p aria-live="polite" style={{ margin: 0, textAlign: 'center', color: 'var(--cc-ink-soft)' }}>
            Rolling…
          </p>
        )}
        {landed && (
          <>
            <p
              data-testid="random-result"
              data-piece-id={piece.id}
              style={{ margin: 0, textAlign: 'center', fontWeight: 800, fontSize: '1.15rem' }}
            >
              Your surprise song: {piece.emoji} {piece.name}
            </p>
            <SayIt text={`Your surprise song is ${piece.name}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <button
                type="button"
                className="cc-btn cc-btn-primary"
                style={{ minHeight: 96, fontSize: '1.2rem' }}
                data-testid="random-record"
                onClick={() => onRecord(piece.id)}
              >
                🎙️ Record it
              </button>
              <button
                type="button"
                className="cc-btn cc-btn-surface"
                style={{ minHeight: 56 }}
                data-testid="random-respin"
                disabled={noSpins}
                onClick={onRespin}
              >
                {noSpins ? '🔁 No spins left' : '🔁 Spin again (1 left)'}
              </button>
              <button type="button" className="cc-btn cc-btn-surface" style={{ minHeight: 56 }} data-testid="random-close" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </>
    )
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--cc-scrim)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="cc-card"
        data-testid="random-picker"
        role="dialog"
        aria-modal="true"
        style={{ padding: '1.25rem', width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
      >
        {body}
      </div>
    </div>,
    document.body,
  )
}

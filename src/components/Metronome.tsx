// A visual/audible metronome for piano practice: a big pulsing dot, the bpm
// number, quick tempo chips, a click toggle, and a play/stop button. Lives
// as a collapsible card on Piano home (see PianoHome.tsx's toggle row) and,
// once running, as the compact `MetronomeStrip` on the Record screen so the
// beat keeps going through the take without re-rendering the whole card.
// State lives in src/audio/metronome.ts, not here, so navigating between
// those two screens never resets or interrupts a beat already going.

import { useEffect, useState } from 'react'
import {
  clampBpm,
  getRememberedBpm,
  nudgeBpm,
  setBpm,
  setClick,
  setRememberedBpm,
  start,
  stop,
  useMetronome,
} from '../audio/metronome'

const TEMPO_CHIPS = [60, 72, 84, 96, 108]

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    try {
      return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      const handler = () => setReduced(mq.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } catch {
      return undefined
    }
  }, [])

  return reduced
}

/**
 * The pulsing beat indicator: a CSS class toggled off the beat counter's
 * parity (so any two consecutive beats always look different, however the
 * component re-renders) scales the dot up via a CSS transition back down to
 * its resting size - or, under prefers-reduced-motion, fades opacity instead
 * of scaling.
 */
function BeatDot({ beat, running, reducedMotion, size = 40 }: { beat: number; running: boolean; reducedMotion: boolean; size?: number }) {
  const on = running && beat % 2 === 1
  const beatClass = on ? (reducedMotion ? 'cc-metro-dot-beat-reduced' : 'cc-metro-dot-beat') : ''
  return (
    <span
      aria-hidden
      className={`cc-metro-dot${beatClass ? ` ${beatClass}` : ''}`}
      style={{ width: size, height: size, display: 'inline-block', flexShrink: 0 }}
    />
  )
}

/** Full metronome card - the collapsible panel on Piano home. */
export function Metronome({ pieceId }: { pieceId: string | null }) {
  const metronome = useMetronome()
  const reducedMotion = usePrefersReducedMotion()

  // Loads this piece's remembered tempo whenever the selected piece changes,
  // but only while the metronome isn't already running - switching pieces
  // mid-beat (from the Record screen there's no piece picker anyway) should
  // never yank the tempo out from under an active click track.
  useEffect(() => {
    if (!metronome.running) setBpm(getRememberedBpm(pieceId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId])

  function chooseBpm(next: number) {
    const clamped = clampBpm(next)
    setBpm(clamped)
    setRememberedBpm(pieceId, clamped)
  }

  return (
    <div className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <BeatDot beat={metronome.beat} running={metronome.running} reducedMotion={reducedMotion} size={56} />
        <strong style={{ fontSize: '1.5rem' }}>{metronome.bpm} bpm</strong>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {TEMPO_CHIPS.map((bpm) => (
          <button
            key={bpm}
            type="button"
            className={`cc-btn ${metronome.bpm === bpm ? 'cc-btn-primary' : 'cc-btn-surface'}`}
            style={{ minHeight: 56, flex: 1, minWidth: 56 }}
            onClick={() => chooseBpm(bpm)}
          >
            {bpm}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          style={{ minHeight: 56, flex: 1 }}
          onClick={() => chooseBpm(nudgeBpm(metronome.bpm, -4))}
        >
          −4
        </button>
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          style={{ minHeight: 56, flex: 1 }}
          onClick={() => chooseBpm(nudgeBpm(metronome.bpm, 4))}
        >
          +4
        </button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: 56, fontWeight: 700 }}>
        <input
          type="checkbox"
          checked={metronome.click}
          onChange={(e) => setClick(e.target.checked)}
          style={{ width: 24, height: 24 }}
        />
        🔔 click
      </label>
      <button
        type="button"
        className="cc-btn cc-btn-primary"
        style={{ minHeight: 56, fontSize: '1.1rem' }}
        onClick={() => (metronome.running ? stop() : start(metronome.bpm))}
      >
        {metronome.running ? '⏹ Stop' : '▶ Start'}
      </button>
    </div>
  )
}

/** Compact dot + bpm + stop strip shown on the Record screen while a take is going - renders nothing when the metronome isn't running. */
export function MetronomeStrip() {
  const metronome = useMetronome()
  const reducedMotion = usePrefersReducedMotion()

  if (!metronome.running) return null

  return (
    <div
      className="cc-card"
      style={{ padding: '0.6rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', maxWidth: 320 }}
    >
      <BeatDot beat={metronome.beat} running reducedMotion={reducedMotion} />
      <strong>{metronome.bpm} bpm</strong>
      <button
        type="button"
        className="cc-btn cc-btn-surface"
        style={{ minHeight: 56, minWidth: 56, marginLeft: 'auto', padding: '0.3rem 0.75rem' }}
        onClick={() => stop()}
        aria-label="Stop metronome"
      >
        ⏹
      </button>
    </div>
  )
}

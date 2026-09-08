import { useState } from 'react'
import { TwistyCube } from './TwistyCube'
import { SayIt } from './SayIt'
import { ORIENTATION_RITUAL } from '../content/lessons'
import { localDay } from '../store/sessions'

const RITUAL_ACK_PREFIX = 'cubeclimb.ritual.'

/** Has she already confirmed the centre ritual today (local calendar day)? */
export function hasAckedRitual(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false
    return sessionStorage.getItem(RITUAL_ACK_PREFIX + localDay()) === '1'
  } catch {
    return false
  }
}

/** Marks the centre ritual acknowledged for today. */
export function ackRitual(): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(RITUAL_ACK_PREFIX + localDay(), '1')
  } catch {
    // ignore - she'll just see the ritual again next mission, which is fine
  }
}

export interface OrientationRitualProps {
  tempoScale: number
  onConfirm: () => void
}

/** The once-per-day "hold it like this" ritual shown before any hold but Base Camp. */
export function OrientationRitual({ tempoScale, onConfirm }: OrientationRitualProps) {
  const [index, setIndex] = useState(0)
  const card = ORIENTATION_RITUAL[index]
  const isLast = index === ORIENTATION_RITUAL.length - 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Get ready to climb</h1>
      <div className="cc-card" style={{ height: 300, padding: '0.5rem' }}>
        <TwistyCube
          key={index}
          setupAlg={card.display?.setupAlg ?? 'z2'}
          alg={card.display?.alg ?? ''}
          tempoScale={tempoScale}
          controls="bottom-row"
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{card.title}</h2>
        <SayIt text={card.say} />
      </div>
      <p style={{ margin: 0, fontWeight: 600, lineHeight: 1.5 }}>{card.text}</p>

      {!isLast ? (
        <button
          type="button"
          className="cc-btn cc-btn-primary"
          style={{ minHeight: 64 }}
          onClick={() => setIndex((i) => i + 1)}
        >
          Next ▶
        </button>
      ) : (
        <button
          type="button"
          className="cc-btn cc-btn-primary"
          style={{ minHeight: 64 }}
          onClick={() => {
            ackRitual()
            onConfirm()
          }}
        >
          {card.confirmLabel ?? 'Ready ✅'}
        </button>
      )}
    </div>
  )
}

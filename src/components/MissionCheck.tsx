import { useState } from 'react'
import { TwistyCube, type TwistyCubeProps } from './TwistyCube'
import { SayIt } from './SayIt'
import type { Mission } from '../content/lessons'

export interface MissionCheckProps {
  mission: Mission
  tempoScale: number
  onYes: () => void
  onShowAgain: () => void
  /** Present only for missions with a goalPhase - offers the camera-scan help flow. */
  onScan?: () => void
  /** Fires once, the moment "Not yet" is tapped - a mission attempt's `tries` count. */
  onNotYet?: () => void
}

/** The "Look" -> "Do" -> Check picture: "does yours look like this?" */
export function MissionCheck({ mission, tempoScale, onYes, onShowAgain, onScan, onNotYet }: MissionCheckProps) {
  const [notYet, setNotYet] = useState(false)
  const check = mission.check

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {check.display && (
        <div className="cc-card" style={{ height: 280, padding: '0.5rem' }}>
          <TwistyCube
            setupAlg={check.display.setupAlg}
            alg={check.display.alg}
            stickering={check.stickering as TwistyCubeProps['stickering']}
            backView={check.backView ? 'top-right' : 'none'}
            tempoScale={tempoScale}
            controls="none"
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>{check.text}</p>
        <SayIt text={check.say} />
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="cc-btn cc-btn-primary"
          style={{ flex: 1, minWidth: 160, minHeight: 64 }}
          onClick={onYes}
        >
          ✅ Yes, I did it!
        </button>
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          style={{ flex: 1, minWidth: 160, minHeight: 64 }}
          onClick={() => {
            if (!notYet) onNotYet?.()
            setNotYet(true)
          }}
        >
          🤔 Not yet
        </button>
      </div>

      {notYet && (
        <div className="cc-card" style={{ padding: '1rem', background: 'var(--cc-bg)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>No worries! Want some help?</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="cc-btn cc-btn-surface" onClick={onShowAgain}>
              🔁 Show me again
            </button>
            {onScan && (
              <button type="button" className="cc-btn cc-btn-surface" onClick={onScan}>
                📷 Show me my cube
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

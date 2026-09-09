import { TwistyCube, type TwistyCubeProps } from './TwistyCube'
import { SayIt } from './SayIt'
import type { PickOption } from '../content/lessons'

export interface PickStepProps {
  title: string
  text: string
  say: string
  options: PickOption[]
  tempoScale: number
  onChoose: (choice: number | 'all') => void
}

/** "Which one looks like yours?" - tappable case cards, plus a "not sure" fallback. */
export function PickStep({ title, text, say, options, tempoScale, onChoose }: PickStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h2>
        <SayIt text={say} />
      </div>
      <p style={{ margin: 0, fontWeight: 600, lineHeight: 1.5 }}>{text}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {options.map((option, i) => (
          <button
            key={i}
            type="button"
            className="cc-btn cc-btn-surface"
            style={{
              minHeight: 200,
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              textAlign: 'left',
              padding: '0.5rem 0.85rem',
            }}
            onClick={() => onChoose(i)}
          >
            {/* cubing.js's <twisty-player> needs a decently sized viewport to size its
                WebGL canvas correctly - below ~180px it can render blank or badly
                distorted (verified in headless Chrome), so this still stays 200x200
                rather than the tighter thumbnail a plain <img> could get away with. */}
            <div
              className="cc-card"
              style={{ width: 200, height: 200, minHeight: 200, padding: '0.2rem', flexShrink: 0 }}
              aria-hidden="true"
            >
              <TwistyCube
                setupAlg={option.display.setupAlg}
                alg={option.display.alg}
                stickering={option.stickering as TwistyCubeProps['stickering']}
                tempoScale={tempoScale}
                controls="none"
              />
            </div>
            <span style={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.3 }}>{option.label}</span>
          </button>
        ))}
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          style={{ minHeight: 64 }}
          onClick={() => onChoose('all')}
        >
          🤔 Not sure, show me all
        </button>
      </div>
    </div>
  )
}

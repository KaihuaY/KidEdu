import { useProgress } from '../store/progress'
import { localDay } from '../store/sessions'
import { tokenEmojis } from '../store/piano'
import { tierStatus } from '../store/tierStrip'

/** A compact one-row strip of today's three piano reward tiers (ring goal, gold, bonus), the next one still to reach highlighted. */
export function TierStrip() {
  const progress = useProgress()
  const today = localDay()
  const status = tierStatus(progress, today)

  return (
    <div
      data-testid="tier-strip"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}
    >
      {status.markers.map((m) => {
        const isNext = status.next?.index === m.index
        return (
          <span
            key={m.index}
            data-testid={`tier-marker-${m.index + 1}`}
            data-reached={m.reached}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.3rem 0.55rem',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: '0.8rem',
              whiteSpace: 'nowrap',
              background: isNext ? 'var(--cc-bg)' : 'var(--cc-surface)',
              border: `2px solid ${m.reached ? 'var(--cc-success)' : isNext ? 'var(--cc-accent)' : 'var(--cc-border)'}`,
              color: 'var(--cc-ink)',
            }}
          >
            <span aria-hidden="true">{tokenEmojis(m.tokens) || '·'}</span>
            <span>{m.minutes} min</span>
            {m.reached && <span aria-hidden="true" style={{ color: 'var(--cc-success)' }}>✓</span>}
            {isNext && status.next && (
              <span style={{ color: 'var(--cc-ink-soft)', fontWeight: 600 }}>
                {status.next.minutesLeft <= 0 ? '· on your next take!' : `· ${status.next.minutesLeft} more min`}
              </span>
            )}
          </span>
        )
      })}
      {status.allReached && (
        <span style={{ fontWeight: 800, color: 'var(--cc-success)' }}>All three today! 🎉</span>
      )}
    </div>
  )
}

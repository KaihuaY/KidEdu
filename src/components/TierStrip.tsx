import { useProgress } from '../store/progress'
import { localDay } from '../store/sessions'
import { tierStatus, type TierMarker } from '../store/tierStrip'

/** What to show before a marker's minute count: a die until the bonus coin toss lands, then which tier it gave. */
function markerEmoji(m: TierMarker): string {
  if (m.tier === 'bronze') return '🟤'
  if (m.tier === 'gold') return '🟡'
  if (m.reached) return m.bonusTier === 'silver' ? '⚪' : '🟡'
  return '🎲'
}

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
        const isNext = status.next?.tier === m.tier
        return (
          <span
            key={m.tier}
            data-testid={`tier-marker-${m.tier}`}
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
            <span aria-hidden="true">{markerEmoji(m)}</span>
            <span>{m.minutes} min</span>
            {m.reached && <span aria-hidden="true" style={{ color: 'var(--cc-success)' }}>✓</span>}
            {isNext && status.next && (
              <span style={{ color: 'var(--cc-ink-soft)', fontWeight: 600 }}>· {status.next.minutesLeft} more min</span>
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

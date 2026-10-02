import { useProgress } from '../store/progress'
import { localDay } from '../store/sessions'
import { tokenEmojis } from '../store/piano'
import { tierStatus } from '../store/tierStrip'
import { randomStatus } from '../store/randomSong'

const CHIP_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.3rem 0.55rem',
  borderRadius: 999,
  fontWeight: 700,
  fontSize: '0.8rem',
  whiteSpace: 'nowrap',
  color: 'var(--cc-ink)',
} as const

/**
 * A compact one-row strip of today's piano rewards: the three minute marks
 * (ring goal, gold, bonus) with the next one highlighted, plus - when the
 * grown-up has a surprise list - the "10 surprise songs = gold box" chip, so
 * the promise is always in view. Tapping that chip opens the picker.
 */
export function TierStrip({ onOpenRandom }: { onOpenRandom?: () => void }) {
  const progress = useProgress()
  const today = localDay()
  const status = tierStatus(progress, today)
  const random = randomStatus(progress, today)
  const randomLeft = Math.max(0, random.goal - random.done)

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
              ...CHIP_STYLE,
              background: isNext ? 'var(--cc-bg)' : 'var(--cc-surface)',
              border: `2px solid ${m.reached ? 'var(--cc-success)' : isNext ? 'var(--cc-accent)' : 'var(--cc-border)'}`,
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
      {random.poolSize > 0 && (
        <button
          type="button"
          data-testid="tier-random"
          data-reached={random.earned}
          onClick={onOpenRandom}
          style={{
            ...CHIP_STYLE,
            minHeight: 44,
            fontFamily: 'inherit',
            cursor: 'pointer',
            background: 'var(--cc-surface)',
            border: `2px solid ${random.earned ? 'var(--cc-success)' : 'var(--cc-border)'}`,
          }}
        >
          <span aria-hidden="true">🎲</span>
          <span>{random.goal} songs</span>
          {random.earned ? (
            <>
              <span aria-hidden="true" style={{ color: 'var(--cc-success)' }}>✓</span>
              <span aria-hidden="true">🟡</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">→ 🟡</span>
              <span style={{ color: 'var(--cc-ink-soft)', fontWeight: 600 }}>· {randomLeft} more</span>
            </>
          )}
        </button>
      )}
      {status.allReached && (
        <span style={{ fontWeight: 800, color: 'var(--cc-success)' }}>All three today! 🎉</span>
      )}
    </div>
  )
}

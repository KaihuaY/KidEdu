import type { SelfRating } from '../store/progress'

const OPTIONS: Array<{ value: SelfRating; emoji: string; label: string }> = [
  { value: 1, emoji: '😕', label: 'Hard' },
  { value: 2, emoji: '🙂', label: 'Okay' },
  { value: 3, emoji: '🤩', label: 'Great!' },
]

/** Nora's own 😕/🙂/🤩 rating for a take. No wrong answer, no effect on tokens. */
export function SelfRatingButtons({
  value,
  onChange,
}: {
  value?: SelfRating
  onChange: (rating: SelfRating) => void
}) {
  return (
    <div role="group" aria-label="How did it feel?" style={{ display: 'flex', gap: '0.5rem' }}>
      {OPTIONS.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            className="cc-btn"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            style={{
              flexDirection: 'column',
              gap: '0.15rem',
              minWidth: 56,
              minHeight: 56,
              padding: '0.4rem',
              background: selected ? 'var(--cc-primary)' : 'var(--cc-surface)',
              color: selected ? 'var(--cc-primary-ink)' : 'var(--cc-ink)',
              border: selected ? 'none' : '2px solid var(--cc-border)',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>
              {opt.emoji}
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

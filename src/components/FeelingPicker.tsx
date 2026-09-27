// A once-a-day 1-10 feeling check-in, shown on the Record.tsx done screen
// once the ring is filled (and again on the Journal card if she skipped it
// there) - see src/store/feeling.ts for the ask/save logic.
import { useState } from 'react'
import { feelingColor, feelingEmoji, setDayFeeling } from '../store/feeling'
import { markNudgeShown } from '../store/journal'
import { useProgress } from '../store/progress'

export function FeelingPicker({ day, title }: { day: string; title?: string }) {
  const progress = useProgress()
  const current = progress.piano.days[day]?.feeling
  const [hidden, setHidden] = useState(false)

  if (hidden) return null

  return (
    <div
      className="cc-card"
      data-testid="feeling-picker"
      style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: 360 }}
    >
      <strong style={{ textAlign: 'center' }}>{title ?? 'You filled the ring! How do you feel?'}</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 6 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            data-testid={`feeling-${n}`}
            aria-label={`${n} out of 10`}
            aria-pressed={current === n}
            style={{
              minHeight: 56,
              minWidth: 0,
              padding: 0,
              borderRadius: 'var(--cc-radius)',
              border: current === n ? '3px solid var(--cc-ink)' : '2px solid transparent',
              background: feelingColor(n),
              color: '#10122b' /* theme-ok: dark ink on a fixed colour ramp */,
              fontWeight: 800,
              fontSize: '1.15rem',
              cursor: 'pointer',
              opacity: current !== undefined && current !== n ? 0.55 : 1,
            }}
            onClick={() => setDayFeeling(day, n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
        <span>😫 1</span>
        <span>10 🤩</span>
      </div>
      {current !== undefined ? (
        <p data-testid="feeling-saved" style={{ margin: 0, textAlign: 'center', fontWeight: 700, color: 'var(--cc-success)' }}>
          You feel {current}/10 {feelingEmoji(current)} — thanks for telling me!
        </p>
      ) : (
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          data-testid="feeling-later"
          style={{ minHeight: 56 }}
          onClick={() => {
            markNudgeShown(day, 'feeling')
            setHidden(true)
          }}
        >
          Not now
        </button>
      )}
    </div>
  )
}

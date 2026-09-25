import { navigate } from '../router'

/**
 * A row of dots for the last several local days, lit up for the ones with
 * practice logged. Each dot is a real 44px touch target (the visual dot
 * stays the same small circle it always was) that opens that day in
 * DayView - a quick way in from the strip on Piano home.
 */
export function WeekDots({ days, done }: { days: string[]; done: Set<string> }) {
  return (
    <div style={{ display: 'flex', gap: '0.1rem' }} role="group" aria-label="This week's practice days">
      {days.map((day) => (
        <button
          key={day}
          type="button"
          data-testid={`week-dot-${day}`}
          title={day}
          aria-label={day}
          onClick={() => navigate(`/piano/day/${day}`)}
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: done.has(day) ? 'var(--cc-success)' : 'var(--cc-border)',
            }}
          />
        </button>
      ))}
    </div>
  )
}

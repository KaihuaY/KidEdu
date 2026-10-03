import { useProgress } from '../store/progress'
import { localDay } from '../store/sessions'
import { isSick, markableDays, setSickDay, sickDays } from '../store/sickDays'

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function plural(n: number): string {
  return n === 1 ? '' : 's'
}

/** Monday-first weekday index (0 = Mo .. 6 = Su) of a local YYYY-MM-DD day. */
function weekdayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

/**
 * Settings body for marking sick days: the last 30 days plus today and
 * tomorrow on a Monday-first calendar. Settings is already behind the PIN, so
 * there is no gate here. A marked day pauses the piano and cube streaks.
 */
export function SickDaysEditor() {
  const progress = useProgress()
  const { piano, settings, profiles } = progress
  const today = localDay()
  const days = markableDays(today)
  const marked = sickDays(piano).filter((d) => days.includes(d)).length

  const cells: (string | null)[] = []
  if (days.length > 0) for (let i = 0; i < weekdayIndex(days[0]); i++) cells.push(null)
  for (const d of days) cells.push(d)

  const pianoCur = piano.streak.current
  const cubeCur = profiles.kid.streak.current

  return (
    <>
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
        Mark days {settings.kidName} was unwell. They pause the piano and cube streaks instead of breaking them. You can mark today and tomorrow too.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} style={{ fontSize: '0.75rem', color: 'var(--cc-ink-soft)', textAlign: 'center' }}>
            {label}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`pad-${i}`} aria-hidden="true" />
          const sick = isSick(piano, day)
          const ring = !!piano.days[day]?.goalReachedAt
          const frozen = !!piano.days[day]?.streakFreeze
          const dateNum = Number(day.slice(8, 10))
          const label = dateNum === 1 || day === days[0] ? `${SHORT_MONTHS[Number(day.slice(5, 7)) - 1]} ${dateNum}` : String(dateNum)
          const isToday = day === today
          return (
            <button
              key={day}
              type="button"
              data-testid={`sick-day-${day}`}
              aria-pressed={sick}
              aria-label={`${day}${ring ? ', practised' : sick ? ', sick day' : ''}`}
              disabled={ring}
              onClick={() => setSickDay(day, !sick, today)}
              style={{
                height: 44,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.1rem',
                background: sick ? 'var(--cc-tint-warm)' : 'var(--cc-surface)',
                border: sick ? '2px solid var(--cc-accent)' : '2px solid var(--cc-border)',
                borderRadius: '0.6rem',
                padding: 0,
                fontFamily: 'inherit',
                color: 'var(--cc-ink)',
                cursor: ring ? 'default' : 'pointer',
                opacity: ring ? 0.7 : 1,
              }}
            >
              <span style={{ fontSize: '0.8rem', lineHeight: 1, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--cc-primary)' : 'var(--cc-ink)' }}>
                {label}
              </span>
              {ring ? (
                <span aria-hidden="true" style={{ fontSize: '0.8rem', lineHeight: 1, color: 'var(--cc-success)' }}>
                  ✓
                </span>
              ) : sick ? (
                <span aria-hidden="true" style={{ fontSize: '0.8rem', lineHeight: 1 }}>
                  🤒
                </span>
              ) : frozen ? (
                <span aria-hidden="true" style={{ fontSize: '0.8rem', lineHeight: 1 }}>
                  ❄️
                </span>
              ) : (
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cc-border)' }} />
              )}
            </button>
          )
        })}
      </div>

      <p data-testid="sick-streaks" style={{ margin: 0, fontWeight: 700 }}>
        🎹 Piano streak: {pianoCur} day{plural(pianoCur)} · best {piano.streak.best}
        <br />
        🧊 Cube streak: {cubeCur} day{plural(cubeCur)}
      </p>

      {marked > 0 && (
        <p data-testid="sick-count" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
          {marked} sick day{plural(marked)} marked in the last 30 days
        </p>
      )}
    </>
  )
}

import { navigate } from '../../router'
import { JournalCard } from '../../components/JournalCard'
import { MiniLineChart } from '../../components/MiniLineChart'
import { averageFeeling, feelingSeries } from '../../store/feeling'
import { journalForDay, MOODS, useJournal } from '../../store/journal'
import { usePiano } from '../../store/piano'
import { dayOffset, lastNDays, localDay } from '../../store/sessions'

/** "Today", "Yesterday", or "Monday, Sep 1" for any other local day. */
function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === dayOffset(today, -1)) return 'Yesterday'
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

/** "9:41 AM" from a timestamp. */
function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/**
 * "📔 My journal": the write-a-line card, then a scroll of everything she's
 * written over the last 14 days, newest day first. Never a delete button
 * here - that only lives behind the grown-up PIN in ParentReview.
 */
export function Journal() {
  const entries = useJournal()
  const piano = usePiano()
  const today = localDay()
  const days = lastNDays(14, today).slice().reverse()
  const feeling14 = lastNDays(14, today)
  const hasFeeling = feeling14.some((d) => piano.days[d]?.feeling !== undefined)
  const avgFeeling7 = averageFeeling(piano, lastNDays(7, today))

  return (
    <div data-testid="journal-screen" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.3rem' }}>📔 My journal</h1>

      <JournalCard />

      {hasFeeling && (
        <div data-testid="feeling-trend" className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong>💗 How I felt after practice</strong>
          <MiniLineChart
            points={feelingSeries(piano, feeling14)}
            min={1}
            max={10}
            title="Feeling after practice"
            goodDirection="up"
            format={(v) => `${v}/10`}
          />
          {avgFeeling7 !== undefined && (
            <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>Average, last 7 days: {avgFeeling7}/10</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {days.map((day) => {
          const dayEntries = journalForDay(entries, day)
          if (dayEntries.length === 0) return null
          return (
            <div key={day} data-testid={`journal-day-${day}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <strong>{dayLabel(day, today)}</strong>
              {dayEntries.map((e) => (
                <div key={e.id} className="cc-card" style={{ padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.8rem' }}>
                    {e.mood ? `${MOODS.find((m) => m.value === e.mood)?.emoji} ` : ''}
                    {formatTime(e.at)}
                  </span>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{e.text}</p>
                </div>
              ))}
            </div>
          )
        })}
        {entries.length === 0 && <span style={{ color: 'var(--cc-ink-soft)' }}>Nothing written yet - your first line is above!</span>}
      </div>

      <button type="button" className="cc-btn cc-btn-surface" style={{ alignSelf: 'center' }} onClick={() => navigate('/piano')}>
        ⬅ Back to piano
      </button>
    </div>
  )
}

import { useProgress } from '../store/progress'
import { RECORD_KEYS, RECORD_LABELS, useRecords, type RecordKey } from '../store/records'
import { formatClock } from '../store/sessions'

/** "2026-09-19" -> "Sep 19", parsed as a local date so it never drifts a day from UTC parsing. */
function formatRecordDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatValue(key: RecordKey, value: number, pieceName: string | undefined): string {
  switch (key) {
    case 'longestTakeSec':
      return formatClock(value)
    case 'mostSecondsInDay':
      return `${Math.round(value / 60)} min`
    case 'mostPlaysOfSong':
      return pieceName ? `${value} × ${pieceName}` : `${value} plays`
    case 'longestStreakDays':
      return `${value} day${value === 1 ? '' : 's'}`
  }
}

/** "🏆 My records": one row per personal record, or an encouraging placeholder before it's set. Renders nothing until her first take (see useRecords()). */
export function RecordsCard() {
  const progress = useProgress()
  const records = useRecords()
  if (!records) return null

  return (
    <div data-testid="records-card" className="cc-card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <strong>🏆 My records</strong>
      {RECORD_KEYS.map((key) => {
        const entry = records[key]
        const label = RECORD_LABELS[key]
        const piece = entry?.pieceId ? progress.settings.pianoPieces.find((p) => p.id === entry.pieceId) : undefined
        return (
          <div
            key={key}
            data-testid={`record-row-${key}`}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.6rem' }}
          >
            <span>
              {label.emoji} {label.title}
            </span>
            {entry ? (
              <span style={{ fontWeight: 700, textAlign: 'right' }}>
                {formatValue(key, entry.value, piece?.name)}{' '}
                <span style={{ fontWeight: 600, color: 'var(--cc-ink-soft)', fontSize: '0.8rem' }}>{formatRecordDay(entry.day)}</span>
              </span>
            ) : (
              <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>not yet - keep playing!</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

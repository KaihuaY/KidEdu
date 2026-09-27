import { useProgress } from '../store/progress'
import { dayOffset } from '../store/sessions'
import { groupPieces } from '../store/songStats'
import { setTomorrowFirst } from '../store/tomorrowFirst'

/** Card on the done screen letting her pick which song leads off tomorrow's practice. */
export function TomorrowFirstPicker({ today }: { today: string }) {
  const { settings, piano } = useProgress()
  const tomorrow = dayOffset(today, 1)
  const pieces = groupPieces(settings.pianoPieces, piano.takes).week

  if (pieces.length === 0) return null

  const chosen = piano.tomorrowFirst?.forDay === tomorrow ? piano.tomorrowFirst.pieceId : undefined
  const chosenPiece = chosen ? pieces.find((p) => p.id === chosen) : undefined

  return (
    <div className="cc-card" data-testid="tomorrow-first" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%', maxWidth: 360 }}>
      <strong>⭐ Tomorrow, start with…</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '0.5rem' }}>
        {pieces.map((piece) => (
          <button
            key={piece.id}
            type="button"
            className={piece.id === chosen ? 'cc-btn cc-btn-primary' : 'cc-btn cc-btn-surface'}
            data-testid={`tomorrow-${piece.id}`}
            onClick={() => setTomorrowFirst(piece.id, tomorrow)}
            style={{ minHeight: 56, fontSize: '0.95rem', textAlign: 'left' }}
          >
            <span aria-hidden="true">{piece.emoji}</span>
            <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{piece.name}</span>
          </button>
        ))}
      </div>
      {chosenPiece && (
        <p data-testid="tomorrow-saved" style={{ margin: 0, fontWeight: 700, color: 'var(--cc-success)', textAlign: 'center' }}>
          Great plan! Tomorrow starts with {chosenPiece.name} ⭐
        </p>
      )}
    </div>
  )
}

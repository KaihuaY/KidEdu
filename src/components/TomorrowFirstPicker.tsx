import { useState } from 'react'
import { useProgress } from '../store/progress'
import { dayOffset } from '../store/sessions'
import { setTomorrowFirst, tomorrowChoices } from '../store/tomorrowFirst'

/** Lets her pick which song leads off tomorrow's practice: her most-played few, with the rest behind "More songs". */
export function TomorrowFirstPicker({ today }: { today: string }) {
  const { settings, piano } = useProgress()
  const [showMore, setShowMore] = useState(false)
  const tomorrow = dayOffset(today, 1)
  const chosen = piano.tomorrowFirst?.forDay === tomorrow ? piano.tomorrowFirst.pieceId : undefined
  const { top, more } = tomorrowChoices(settings.pianoPieces, piano.takes, today, chosen)

  if (top.length === 0) return null

  const chosenPiece = chosen ? [...top, ...more].find((p) => p.id === chosen) : undefined
  const shown = showMore ? [...top, ...more] : top

  return (
    <div data-testid="tomorrow-first" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '0.5rem' }}>
        {shown.map((piece) => (
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
      {more.length > 0 && (
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          data-testid="tomorrow-more"
          aria-expanded={showMore}
          style={{ minHeight: 44 }}
          onClick={() => setShowMore((v) => !v)}
        >
          {showMore ? 'Fewer songs ▲' : 'More songs ▼'}
        </button>
      )}
      {chosenPiece && (
        <p data-testid="tomorrow-saved" style={{ margin: 0, fontWeight: 700, color: 'var(--cc-success)', textAlign: 'center' }}>
          Great plan! Tomorrow starts with {chosenPiece.name} ⭐
        </p>
      )}
    </div>
  )
}

import type { CSSProperties } from 'react'

/** A compact two-line-max song picker chip, used on Piano home's "this week" grid and the "More songs" fold. */
export function SongChip({
  piece,
  selected,
  onClick,
  small,
  testId,
}: {
  piece: { id: string; name: string; emoji: string }
  selected: boolean
  onClick: () => void
  small?: boolean
  testId?: string
}) {
  return (
    <button
      type="button"
      className={`cc-btn ${selected ? 'cc-btn-primary' : 'cc-btn-surface'}`}
      data-testid={testId}
      aria-pressed={selected}
      style={{
        minHeight: 56,
        padding: '0.5rem 0.7rem',
        fontSize: small ? '0.9rem' : '0.95rem',
        lineHeight: 1.2,
        textAlign: 'left',
        justifyContent: 'flex-start',
        gap: '0.4rem',
        width: '100%',
        minWidth: 0,
      }}
      onClick={onClick}
    >
      <span aria-hidden="true">{piece.emoji}</span>
      <span className="cc-clamp-2">{piece.name}</span>
    </button>
  )
}

export const SONG_GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '0.5rem',
}

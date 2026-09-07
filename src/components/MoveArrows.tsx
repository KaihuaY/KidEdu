export interface MoveArrowsProps {
  onMove: (move: string) => void
  className?: string
}

interface MoveDef {
  move: string
  label: string
}

// Friendly names first, cube notation second (small), grouped by face so
// clockwise/counter-clockwise pairs sit next to each other.
const MOVES: MoveDef[] = [
  { move: 'R', label: 'Right' },
  { move: "R'", label: 'Right back' },
  { move: 'L', label: 'Left' },
  { move: "L'", label: 'Left back' },
  { move: 'U', label: 'Top' },
  { move: "U'", label: 'Top back' },
  { move: 'F', label: 'Front' },
  { move: "F'", label: 'Front back' },
  { move: 'D', label: 'Bottom' },
  { move: "D'", label: 'Bottom back' },
]

export function MoveArrows({ onMove, className }: MoveArrowsProps) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
        gap: '0.6rem',
      }}
    >
      {MOVES.map(({ move, label }) => (
        <button
          key={move}
          type="button"
          className="cc-btn cc-btn-primary"
          onClick={() => onMove(move)}
          style={{ flexDirection: 'column', gap: '0.1rem', minHeight: 64 }}
          aria-label={`${label} (${move})`}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>{label}</span>
          <span style={{ fontSize: '1rem', fontWeight: 900, opacity: 0.9 }}>{move}</span>
        </button>
      ))}
    </div>
  )
}

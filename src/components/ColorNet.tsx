import { useMemo, useState } from 'react'
import { CUBE_COLORS, FACE_ORDER, type Face } from '../content/colors'
// SOLVED is part of the engine contract (src/engine/cube.ts), written by a
// different agent in parallel. If that file doesn't exist yet, this import
// will fail to resolve until it lands - that's expected, not a bug here.
import { SOLVED } from '../engine/cube'

export interface ColorNetProps {
  /** 54-char facelet string, URFDLB order. Unknown stickers use '?'. */
  value: string
  onChange: (facelets: string) => void
  /** Facelet indices (0-53) to outline in red, e.g. from validateFacelets(). */
  invalidFacelets?: number[]
  /** Overall width/height of the net in px. */
  size?: number
  className?: string
}

const UNKNOWN = '?'

// Position of each face's 3x3 block within the cross-shaped net, in
// (column, row) block units:
//        U
//   L    F    R    B
//        D
const FACE_BLOCK: Record<Face, { col: number; row: number }> = {
  U: { col: 1, row: 0 },
  L: { col: 0, row: 1 },
  F: { col: 1, row: 1 },
  R: { col: 2, row: 1 },
  B: { col: 3, row: 1 },
  D: { col: 1, row: 2 },
}

function faceStart(face: Face): number {
  return FACE_ORDER.indexOf(face) * 9
}

function faceOfIndex(index: number): Face {
  return FACE_ORDER[Math.floor(index / 9)]
}

function isCenter(index: number): boolean {
  return index % 9 === 4
}

interface StickerCell {
  index: number
  col: number
  row: number
  face: Face
}

function buildCells(): StickerCell[] {
  const cells: StickerCell[] = []
  for (const face of FACE_ORDER) {
    const block = FACE_BLOCK[face]
    const start = faceStart(face)
    for (let i = 0; i < 9; i++) {
      const localCol = i % 3
      const localRow = Math.floor(i / 3)
      cells.push({
        index: start + i,
        col: block.col * 3 + localCol,
        row: block.row * 3 + localRow,
        face,
      })
    }
  }
  return cells
}

const CELLS = buildCells()

export function ColorNet({
  value,
  onChange,
  invalidFacelets,
  size = 600,
  className,
}: ColorNetProps) {
  const [selected, setSelected] = useState<Face>('U')

  const invalidSet = useMemo(
    () => new Set(invalidFacelets ?? []),
    [invalidFacelets],
  )

  const counts = useMemo(() => {
    const result: Record<Face, number> = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 }
    for (const ch of value) {
      if (ch in result) result[ch as Face]++
    }
    return result
  }, [value])

  function paint(index: number) {
    if (isCenter(index)) return
    const chars = value.split('')
    while (chars.length < 54) chars.push(UNKNOWN)
    chars[index] = selected
    onChange(chars.join(''))
  }

  function clear() {
    const chars = Array.from({ length: 54 }, (_, i) =>
      isCenter(i) ? faceOfIndex(i) : UNKNOWN,
    )
    onChange(chars.join(''))
  }

  function solved() {
    onChange(SOLVED)
  }

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        role="grid"
        aria-label="Cube net"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(12, 1fr)`,
          gridTemplateRows: `repeat(9, 1fr)`,
          width: '100%',
          maxWidth: size,
          aspectRatio: '12 / 9',
          gap: 2,
        }}
      >
        {CELLS.map(({ index, col, row, face }) => {
          const center = isCenter(index)
          const raw = value[index] ?? UNKNOWN
          const letter = center ? face : (raw as Face | '?')
          const hex =
            letter === UNKNOWN
              ? 'var(--cube-unknown)'
              : CUBE_COLORS[letter as Face]?.hex ?? 'var(--cube-unknown)'
          const invalid = invalidSet.has(index)

          if (center) {
            return (
              <div
                key={index}
                aria-label={`${CUBE_COLORS[face].name} center, fixed`}
                style={{
                  gridColumn: col + 1,
                  gridRow: row + 1,
                  background: hex,
                  borderRadius: 6,
                  border: '2px solid rgba(16,18,43,0.25)',
                }}
              />
            )
          }

          return (
            <button
              key={index}
              type="button"
              onClick={() => paint(index)}
              aria-label={`${letter === UNKNOWN ? 'empty' : CUBE_COLORS[letter as Face].name} sticker`}
              style={{
                gridColumn: col + 1,
                gridRow: row + 1,
                background: hex,
                borderRadius: 6,
                border: invalid ? '3px solid var(--cc-danger)' : '2px solid rgba(16,18,43,0.15)',
                boxShadow: invalid ? '0 0 0 2px rgba(230,43,43,0.35)' : 'none',
                cursor: 'pointer',
                padding: 0,
                minWidth: 0,
                minHeight: 0,
                touchAction: 'manipulation',
              }}
            />
          )
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {FACE_ORDER.map((face) => {
          const color = CUBE_COLORS[face]
          const isSelected = selected === face
          return (
            <button
              key={face}
              type="button"
              className="cc-btn"
              onClick={() => setSelected(face)}
              style={{
                background: color.hex,
                color: face === 'D' || face === 'U' ? '#10122b' : '#fff',
                flexDirection: 'column',
                minWidth: 72,
                minHeight: 64,
                gap: '0.15rem',
                outline: isSelected ? '3px solid var(--cc-primary)' : 'none',
                outlineOffset: 2,
              }}
            >
              <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>{color.name}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, opacity: 0.85 }}>
                {counts[face]}/9
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" className="cc-btn cc-btn-surface" onClick={clear}>
          Clear
        </button>
        <button type="button" className="cc-btn cc-btn-primary" onClick={solved}>
          Solved
        </button>
      </div>
    </div>
  )
}

// The "Bracelets" tab of the Blind Box screen: a bead strand she fills in
// from the loose beads in her tray (src/content/beads.ts), tap-then-tap or
// drag-and-drop, then finishes into a keepsake. BraceletStrand is exported
// as a pure, prop-only SVG so other screens (Home) can draw a finished
// bracelet without pulling in any of this file's interactive state.

import { useRef, useState } from 'react'
import { findBead, type BeadDef } from '../content/beads'
import { awardNewBadges } from '../store/badges'
import {
  BRACELET_SLOTS,
  MIN_BEADS_TO_FINISH,
  beadsOn,
  currentBracelet,
  finishBracelet,
  placeBead,
  renameBracelet,
  scrapBracelet,
  startBracelet,
  trayBeads,
  useCollection,
} from '../store/collection'
import type { Bracelet } from '../store/progress'
import { fireConfetti } from './Confetti'

/** The oval the beads sit on: a closed loop like a real bracelet, inset so the beads never clip the edge. */
function strandOval(width: number, height: number): { cx: number; cy: number; rx: number; ry: number } {
  const inset = Math.max(20, width * 0.075)
  return { cx: width / 2, cy: height / 2, rx: width / 2 - inset, ry: height / 2 - inset }
}

/**
 * One {x,y} per slot, evenly spaced around the oval starting at the top.
 * With 18 slots on a 340-wide strand the beads sit ~41 px apart, so the
 * 38 px hit circles in the editor never overlap a neighbour.
 */
function slotPositions(count: number, width: number, height: number): { x: number; y: number }[] {
  const { cx, cy, rx, ry } = strandOval(width, height)
  const positions: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i / Math.max(1, count)) * Math.PI * 2
    positions.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) })
  }
  return positions
}

/** The string underneath the beads: the same closed oval. */
function strandPath(width: number, height: number): string {
  const { cx, cy, rx, ry } = strandOval(width, height)
  return `M ${cx} ${cy - ry} A ${rx} ${ry} 0 1 1 ${cx - 0.01} ${cy - ry} Z`
}

function starPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const angle = (Math.PI / 5) * i - Math.PI / 2
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
  }
  return pts.join(' ')
}

function heartPath(cx: number, cy: number, r: number): string {
  const s = r
  return `M ${cx} ${cy + s * 0.35} C ${cx - s} ${cy - s * 0.35}, ${cx - s * 0.5} ${cy - s}, ${cx} ${cy - s * 0.35} C ${cx + s * 0.5} ${cy - s}, ${cx + s} ${cy - s * 0.35}, ${cx} ${cy + s * 0.35} Z`
}

function FlowerPetals({ cx, cy, r, colour }: { cx: number; cy: number; r: number; colour: string }) {
  const petalR = r * 0.55
  const dist = r * 0.5
  return (
    <g>
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = ((2 * Math.PI) / 5) * i - Math.PI / 2
        return <circle key={i} cx={cx + dist * Math.cos(angle)} cy={cy + dist * Math.sin(angle)} r={petalR} fill={colour} />
      })}
      <circle cx={cx} cy={cy} r={r * 0.32} fill="#fff7d6" />
    </g>
  )
}

/** Draws one bead (any shape) centered at (cx, cy) with "radius" r. */
export function BeadGlyph({ bead, cx, cy, r }: { bead: BeadDef; cx: number; cy: number; r: number }) {
  switch (bead.shape) {
    case 'star':
      return <polygon points={starPoints(cx, cy, r, r * 0.45)} fill={bead.colour} stroke="#00000022" />
    case 'heart':
      return <path d={heartPath(cx, cy, r)} fill={bead.colour} stroke="#00000022" />
    case 'flower':
      return <FlowerPetals cx={cx} cy={cy} r={r} colour={bead.colour} />
    case 'letter':
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={bead.colour} stroke="#00000022" />
          <text x={cx} y={cy + r * 0.08} textAnchor="middle" dominantBaseline="middle" fontSize={r * 1.15} fontWeight={800} fill="#3b2f0a">
            {bead.letter}
          </text>
        </g>
      )
    case 'round':
    default:
      return <circle cx={cx} cy={cy} r={r} fill={bead.colour} stroke="#00000022" />
  }
}

/** Pure, prop-only strand SVG for a bracelet - no interaction, safe to mount anywhere (e.g. Home). */
export function BraceletStrand({ bracelet, width }: { bracelet: Bracelet; width: number }) {
  const height = Math.round(width * 0.66)
  const positions = slotPositions(bracelet.beads.length, width, height)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${bracelet.name} bracelet`}>
      <path d={strandPath(width, height)} stroke="#c7cad9" strokeWidth={3} fill="none" strokeLinecap="round" />
      {bracelet.beads.map((beadId, i) => {
        const pos = positions[i]
        const bead = beadId ? findBead(beadId) : undefined
        if (!bead) return <circle key={i} cx={pos.x} cy={pos.y} r={width * 0.02} fill="#e1e3f5" />
        return <BeadGlyph key={i} bead={bead} cx={pos.x} cy={pos.y} r={width * 0.032} />
      })}
    </svg>
  )
}

const SLOT_R = 13
const SLOT_HIT_R = 19

function BraceletEditor({ bracelet }: { bracelet: Bracelet }) {
  const collection = useCollection()
  const [selectedBeadId, setSelectedBeadId] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ beadId: string; x: number; y: number } | null>(null)
  // Where the current press started, and whether it turned into a real drag.
  // A tray button captures the pointer while dragging, so the browser fires
  // its click on the button when the drag ends - that click must not toggle
  // the selection, or every drag would leave a bead looking selected.
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const dragged = useRef(false)
  const swallowClick = useRef(false)
  const [name, setName] = useState(bracelet.name)


  const width = 340
  const height = Math.round(width * 0.66)
  const positions = slotPositions(bracelet.beads.length, width, height)
  const filled = beadsOn(bracelet)
  const canFinish = filled >= MIN_BEADS_TO_FINISH

  function onSlotClick(index: number) {
    const current = bracelet.beads[index]
    if (current) {
      placeBead(bracelet.id, index, null)
      return
    }
    if (selectedBeadId) {
      placeBead(bracelet.id, index, selectedBeadId)
      setSelectedBeadId(null)
    }
  }

  function onTrayPointerDown(e: React.PointerEvent<HTMLButtonElement>, beadId: string) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pressStart.current = { x: e.clientX, y: e.clientY }
    dragged.current = false
    setDrag({ beadId, x: e.clientX, y: e.clientY })
  }
  function onTrayPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return
    const start = pressStart.current
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) dragged.current = true
    setDrag({ beadId: drag.beadId, x: e.clientX, y: e.clientY })
  }
  function onTrayPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return
    if (dragged.current) {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const slotEl = el?.closest('[data-slot-index]')
      const idx = slotEl ? Number(slotEl.getAttribute('data-slot-index')) : NaN
      if (!Number.isNaN(idx) && !bracelet.beads[idx]) placeBead(bracelet.id, idx, drag.beadId)
      swallowClick.current = true
    }
    setDrag(null)
  }
  function onTrayClick(id: string) {
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    setSelectedBeadId((cur) => (cur === id ? null : id))
  }

  function onFinish() {
    if (!finishBracelet(bracelet.id)) return
    fireConfetti('big')
    const newIds = awardNewBadges()
    if (newIds.includes('first-bracelet')) fireConfetti('big')
  }

  function onStartOver() {
    if (typeof window !== 'undefined' && !window.confirm('Take this bracelet apart and put the beads back in the tray?')) return
    scrapBracelet(bracelet.id)
  }

  return (
    <div className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ maxWidth: '100%' }}>
        <path d={strandPath(width, height)} stroke="#c7cad9" strokeWidth={3} fill="none" strokeLinecap="round" />
        {bracelet.beads.map((beadId, i) => {
          const pos = positions[i]
          const bead = beadId ? findBead(beadId) : undefined
          return (
            <g
              key={i}
              data-testid={`slot-${i}`}
              data-slot-index={i}
              data-bead={beadId ?? 'empty'}
              onClick={() => onSlotClick(i)}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={pos.x} cy={pos.y} r={SLOT_HIT_R} fill="transparent" />
              {bead ? (
                <BeadGlyph bead={bead} cx={pos.x} cy={pos.y} r={SLOT_R} />
              ) : (
                <circle cx={pos.x} cy={pos.y} r={SLOT_R} fill="none" stroke="#c7cad9" strokeWidth={2} strokeDasharray="3 3" />
              )}
            </g>
          )
        })}
      </svg>

      <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
        {filled}/{BRACELET_SLOTS} beads {canFinish ? '· ready to finish!' : `· ${MIN_BEADS_TO_FINISH - filled} more to finish`}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {trayBeads(collection).map(([id, count]) => {
          const bead = findBead(id)
          if (!bead) return null
          const selected = selectedBeadId === id
          return (
            <button
              key={id}
              type="button"
              data-testid={`tray-bead-${id}`}
              onClick={() => onTrayClick(id)}
              onPointerDown={(e) => onTrayPointerDown(e, id)}
              onPointerMove={onTrayPointerMove}
              onPointerUp={onTrayPointerUp}
              style={{
                position: 'relative',
                minWidth: 56,
                minHeight: 56,
                borderRadius: '0.85rem',
                border: selected ? '3px solid var(--cc-primary)' : '2px solid var(--cc-border)',
                background: selected ? 'var(--cc-bg)' : 'var(--cc-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'none',
              }}
            >
              <svg viewBox="0 0 40 40" width={36} height={36}>
                <BeadGlyph bead={bead} cx={20} cy={20} r={15} />
              </svg>
              <span
                style={{
                  position: 'absolute',
                  bottom: 2,
                  right: 4,
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  color: 'var(--cc-ink-soft)',
                  background: 'var(--cc-surface)',
                  borderRadius: '0.5rem',
                  padding: '0 0.2rem',
                }}
              >
                ×{count}
              </span>
            </button>
          )
        })}
        {trayBeads(collection).length === 0 && <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>No beads in the tray yet - open a box!</p>}
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => renameBracelet(bracelet.id, name)}
        placeholder="Name it"
        aria-label="Bracelet name"
        style={{
          minHeight: 56,
          borderRadius: '0.85rem',
          border: '2px solid var(--cc-border)',
          padding: '0 1rem',
          fontSize: '1rem',
          fontWeight: 700,
        }}
      />

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" className="cc-btn cc-btn-surface" style={{ flex: 1 }} onClick={onStartOver}>
          Start over
        </button>
        <button type="button" className="cc-btn cc-btn-primary" style={{ flex: 1 }} disabled={!canFinish} onClick={onFinish}>
          ✨ Finish
        </button>
      </div>
    </div>
  )
}

export function BraceletMaker() {
  const collection = useCollection()
  const bracelet = currentBracelet(collection)
  const finished = [...collection.bracelets].filter((b) => b.finishedAt).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {bracelet ? (
        <BraceletEditor key={bracelet.id} bracelet={bracelet} />
      ) : (
        <div className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: '2.5rem' }} aria-hidden="true">
            📿
          </span>
          <p style={{ margin: 0, color: 'var(--cc-ink-soft)', textAlign: 'center' }}>Start a bracelet and fill it with beads from your tray.</p>
          <button type="button" className="cc-btn cc-btn-primary" style={{ minHeight: 56 }} onClick={() => startBracelet('My bracelet')}>
            New bracelet
          </button>
        </div>
      )}

      {finished.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Finished bracelets</h2>
          {finished.map((b) => (
            <div key={b.id} className="cc-card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'center' }}>
              <BraceletStrand bracelet={b} width={260} />
              <strong>{b.name}</strong>
              <span style={{ fontSize: '0.8rem', color: 'var(--cc-ink-soft)' }}>{b.finishedAt ? new Date(b.finishedAt).toLocaleDateString() : ''}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

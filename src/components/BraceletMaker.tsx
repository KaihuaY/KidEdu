// The "Bracelets" tab of the Blind Box screen: a bead strand she fills in
// from the loose beads in her tray (src/content/beads.ts), tap-then-tap or
// drag-and-drop, then finishes into a keepsake. BraceletStrand is exported
// as a pure, prop-only SVG so other screens (Home) can draw a finished
// bracelet without pulling in any of this file's interactive state.

import { useRef, useState } from 'react'
import { findBead, type BeadDef } from '../content/beads'
import { heartPath, slotPositions, starPoints, strandPath } from '../content/braceletGeometry'
import { kidDisplayName, otherKidId } from '../store/kid'
import { useBraceletsFromFamily } from '../store/family'
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
  shareBracelet,
  unshareBracelet,
  startBracelet,
  trayBeads,
  useCollection,
} from '../store/collection'
import type { Bracelet } from '../store/progress'
import { fireConfetti } from './Confetti'

function FlowerPetals({ cx, cy, r, colour }: { cx: number; cy: number; r: number; colour: string }) {
  const petalR = r * 0.55
  const dist = r * 0.5
  return (
    <g>
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = ((2 * Math.PI) / 5) * i - Math.PI / 2
        return <circle key={i} cx={cx + dist * Math.cos(angle)} cy={cy + dist * Math.sin(angle)} r={petalR} fill={colour} />
      })}
      <circle cx={cx} cy={cy} r={r * 0.32} fill="var(--cc-tint-warm)" />
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
          <text x={cx} y={cy + r * 0.08} textAnchor="middle" dominantBaseline="middle" fontSize={r * 1.15} fontWeight={800} fill="var(--cc-accent-ink)">
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
      <path d={strandPath(width, height)} stroke="var(--cc-muted)" strokeWidth={3} fill="none" strokeLinecap="round" />
      {bracelet.beads.map((beadId, i) => {
        const pos = positions[i]
        const bead = beadId ? findBead(beadId) : undefined
        if (!bead) return <circle key={i} cx={pos.x} cy={pos.y} r={width * 0.02} fill="var(--cc-border)" />
        return <BeadGlyph key={i} bead={bead} cx={pos.x} cy={pos.y} r={width * 0.032} />
      })}
    </svg>
  )
}

/** Tray beads: everything else in the order collected, then letter beads A-Z. */
function sortedTray(collection: ReturnType<typeof useCollection>): [string, number][] {
  const all = trayBeads(collection)
  const isLetter = (id: string) => findBead(id)?.shape === 'letter'
  const letters = all.filter(([id]) => isLetter(id)).sort((a, b) => (findBead(a[0])?.letter ?? '').localeCompare(findBead(b[0])?.letter ?? ''))
  return [...all.filter(([id]) => !isLetter(id)), ...letters]
}

function NameBraceletDialog({ bracelet, onClose }: { bracelet: Bracelet; onClose: () => void }) {
  const [value, setValue] = useState(bracelet.name)
  const kid = kidDisplayName()
  const chips = ['Rainbow', 'Sparkle', 'Ocean', 'Sunshine', 'Best friends', `${kid}'s bracelet`]
  const canSave = value.trim().length > 0
  function save() {
    if (!canSave) return
    renameBracelet(bracelet.id, value)
    onClose()
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Name your bracelet"
      style={{ position: 'fixed', inset: 0, background: 'var(--cc-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 50 }}
    >
      <div className="cc-card" style={{ padding: '1.5rem', width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Name your bracelet</h2>
        <input
          type="text"
          data-testid="bracelet-name-input"
          aria-label="Bracelet name"
          autoFocus
          maxLength={30}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          style={{ minHeight: 56, fontSize: '1.2rem', fontWeight: 700, borderRadius: '0.85rem', border: '2px solid var(--cc-border)', padding: '0 1rem' }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {chips.map((chip, i) => (
            <button key={chip} type="button" className="cc-btn cc-btn-surface" data-testid={`bracelet-name-chip-${i}`} onClick={() => setValue(chip.slice(0, 30))}>
              {chip}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="cc-btn cc-btn-surface" style={{ flex: 1, minHeight: 56 }} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="cc-btn cc-btn-primary" style={{ flex: 1, minHeight: 56 }} data-testid="bracelet-name-save" disabled={!canSave} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function FinishedBraceletCard({ bracelet: b }: { bracelet: Bracelet }) {
  const [naming, setNaming] = useState(false)
  const date = b.finishedAt ? new Date(b.finishedAt).toLocaleDateString() : ''
  const sister = kidDisplayName(otherKidId())
  function onSend() {
    if (b.sharedAt) {
      if (typeof window !== 'undefined' && !window.confirm(`Take it back? ${sister} won't see it any more.`)) return
      unshareBracelet(b.id)
      return
    }
    if (shareBracelet(b.id)) fireConfetti('small')
  }
  return (
    <div className="cc-card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'center' }}>
      <BraceletStrand bracelet={b} width={260} />
      <strong>{b.name}</strong>
      <span style={{ fontSize: '0.8rem', color: 'var(--cc-ink-soft)' }}>{date}</span>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" className="cc-btn cc-btn-surface" style={{ minHeight: 56 }} data-testid={`bracelet-name-edit-${b.id}`} onClick={() => setNaming(true)}>
          ✏️ Name it
        </button>
        <button
          type="button"
          className={b.sharedAt ? 'cc-btn cc-btn-surface' : 'cc-btn cc-btn-primary'}
          style={{ minHeight: 56 }}
          data-testid={`bracelet-send-${b.id}`}
          onClick={onSend}
        >
          {b.sharedAt ? `✅ Sent to ${sister}` : `💌 Send to ${sister}`}
        </button>
      </div>
      {naming && <NameBraceletDialog bracelet={b} onClose={() => setNaming(false)} />}
    </div>
  )
}

/** Bracelets her sister sent her, read from the sister's synced file. */
function FromFamily() {
  const senders = useBraceletsFromFamily()
  if (senders.length === 0) return null
  return (
    <>
      {senders.map((s) => (
        <section key={s.id} data-testid={`bracelets-from-${s.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>💌 From {s.name}</h2>
          {s.bracelets.map((b) => (
            <div key={b.id} className="cc-card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'center' }}>
              <BraceletStrand bracelet={b} width={260} />
              <strong>{b.name}</strong>
              <span style={{ fontSize: '0.8rem', color: 'var(--cc-ink-soft)' }}>
                from {s.name}
                {b.sharedAt ? ` · ${new Date(b.sharedAt).toLocaleDateString()}` : ''}
              </span>
            </div>
          ))}
        </section>
      ))}
    </>
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
  const [naming, setNaming] = useState(false)

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <strong style={{ fontSize: '1.15rem', overflowWrap: 'anywhere' }}>{bracelet.name}</strong>
        <button type="button" className="cc-btn cc-btn-surface" style={{ minHeight: 56 }} data-testid={`bracelet-name-edit-${bracelet.id}`} onClick={() => setNaming(true)}>
          ✏️ Name it
        </button>
      </div>
      {naming && <NameBraceletDialog bracelet={bracelet} onClose={() => setNaming(false)} />}
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ maxWidth: '100%' }}>
        <path d={strandPath(width, height)} stroke="var(--cc-muted)" strokeWidth={3} fill="none" strokeLinecap="round" />
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
                <circle cx={pos.x} cy={pos.y} r={SLOT_R} fill="none" stroke="var(--cc-muted)" strokeWidth={2} strokeDasharray="3 3" />
              )}
            </g>
          )
        })}
      </svg>

      <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
        {filled}/{BRACELET_SLOTS} beads {canFinish ? '· ready to finish!' : `· ${MIN_BEADS_TO_FINISH - filled} more to finish`}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {sortedTray(collection).map(([id, count]) => {
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
        {sortedTray(collection).length === 0 && <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>No beads in the tray yet - open a box!</p>}
      </div>

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
            <FinishedBraceletCard key={b.id} bracelet={b} />
          ))}
        </section>
      )}

      <FromFamily />
    </div>
  )
}

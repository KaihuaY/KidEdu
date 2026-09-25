import { useEffect, useMemo, useRef } from 'react'
import { useProgress } from '../store/progress'
import { dayDots } from '../store/dayDigest'
import { localDay } from '../store/sessions'

function Dot({ color }: { color: string }) {
  return <span style={{ width: 4, height: 4, borderRadius: '50%', background: color, flexShrink: 0 }} aria-hidden="true" />
}

/**
 * A horizontally-scrolling strip of the last 60 local days (today at the
 * right), each a 44px button showing the day-of-month plus tiny dots for
 * what happened that day (played / ring reached / journal / teacher note).
 * ‹ › step one day at a time; the date input jumps straight to any day,
 * including ones off the front of the 60-day strip.
 */
export function DateStrip({ selected, onSelect }: { selected: string; onSelect: (day: string) => void }) {
  const progress = useProgress()
  const today = localDay()
  const dots = useMemo(() => dayDots(progress, today, 60), [progress, today])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const index = dots.findIndex((d) => d.day === selected)

  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-testid="day-${selected}"]`)
    el?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [selected])

  function step(delta: number) {
    const at = index === -1 ? dots.length - 1 : index
    const next = dots[Math.max(0, Math.min(dots.length - 1, at + delta))]
    if (next) onSelect(next.day)
  }

  return (
    <div data-testid="date-strip" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <button
          type="button"
          aria-label="Earlier"
          className="cc-btn cc-btn-surface"
          style={{ minHeight: 44, minWidth: 44, flexShrink: 0 }}
          disabled={index === 0}
          onClick={() => step(-1)}
        >
          ‹
        </button>
        <div
          ref={scrollRef}
          style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', flex: 1, minWidth: 0, paddingBottom: '0.25rem' }}
        >
          {dots.map((d) => {
            const isSelected = d.day === selected
            const dayNum = Number(d.day.slice(-2))
            return (
              <button
                key={d.day}
                type="button"
                data-testid={`day-${d.day}`}
                title={d.day}
                aria-current={isSelected ? 'date' : undefined}
                onClick={() => onSelect(d.day)}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: '0.75rem',
                  border: isSelected ? '2px solid var(--cc-primary)' : '1px solid var(--cc-border)',
                  background: isSelected ? 'var(--cc-primary)' : 'var(--cc-surface)',
                  color: isSelected ? '#fff' : 'var(--cc-ink)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.2rem',
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{dayNum}</span>
                <span style={{ display: 'flex', gap: '2px', minHeight: 4 }}>
                  {d.played && <Dot color={isSelected ? '#fff' : 'var(--cc-success)'} />}
                  {d.ring && <Dot color={isSelected ? '#fff' : 'var(--cc-primary)'} />}
                  {d.journal && <Dot color={isSelected ? '#fff' : '#a566ff'} />}
                  {d.teacherNote && <Dot color={isSelected ? '#fff' : '#ff8a00'} />}
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-label="Later"
          className="cc-btn cc-btn-surface"
          style={{ minHeight: 44, minWidth: 44, flexShrink: 0 }}
          disabled={index !== -1 && index >= dots.length - 1}
          onClick={() => step(1)}
        >
          ›
        </button>
      </div>
      <input
        type="date"
        aria-label="Jump to a day"
        data-testid="date-strip-input"
        value={selected}
        max={today}
        onChange={(e) => {
          if (e.target.value) onSelect(e.target.value)
        }}
        style={{ minHeight: 44, alignSelf: 'flex-start' }}
      />
    </div>
  )
}

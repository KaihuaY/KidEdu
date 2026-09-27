import { useState } from 'react'
import { useProgress } from '../store/progress'
import { localDay } from '../store/sessions'
import { kidKey } from '../store/kid'
import { navigate } from '../router'
import { dayKind, earliestMonth, monthGrid, monthLabel, type DayKind } from '../store/calendar'
import { freezeUsedInWeek } from '../store/streakFreeze'

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function openKey(): string {
  return kidKey('cubeclimb.piano.calendarOpen')
}

/** Default open: only an explicit '0' collapses it. */
function readOpen(): boolean {
  if (!hasLocalStorage()) return true
  try {
    return localStorage.getItem(openKey()) !== '0'
  } catch {
    return true
  }
}

function writeOpen(open: boolean): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(openKey(), open ? '1' : '0')
  } catch {
    // Storage disabled: the panel just won't remember its state next launch.
  }
}

/** 'M/D' for a local YYYY-MM-DD day string. */
function shortDate(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${m}/${d}`
}

function dotColor(kind: DayKind): string {
  if (kind === 'ring') return 'var(--cc-success)'
  if (kind === 'none') return 'var(--cc-border)'
  return 'transparent'
}

export function StreakCalendar() {
  const progress = useProgress()
  const { piano } = progress
  const today = localDay()
  const [open, setOpen] = useState(readOpen)
  const [viewed, setViewed] = useState(() => {
    const [y, m] = today.split('-').map(Number)
    return { year: y, month: m }
  })

  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    writeOpen(next)
  }

  const [todayYear, todayMonth] = today.split('-').map(Number)
  const isCurrentMonth = viewed.year === todayYear && viewed.month === todayMonth
  const earliest = earliestMonth(piano) ?? { year: todayYear, month: todayMonth }
  const isEarliestMonth = viewed.year === earliest.year && viewed.month === earliest.month

  const goPrevMonth = () => {
    setViewed((v) => (v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 }))
  }
  const goNextMonth = () => {
    setViewed((v) => (v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 }))
  }

  const weeks = monthGrid(viewed.year, viewed.month)
  const frozenDay = freezeUsedInWeek(piano, today)

  return (
    <div className="cc-card" data-testid="streak-calendar" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <button
        type="button"
        className="cc-btn cc-btn-surface"
        data-testid="calendar-toggle"
        aria-expanded={open}
        onClick={toggleOpen}
        style={{ minHeight: 56, justifyContent: 'space-between', width: '100%' }}
      >
        <span>🔥 {piano.streak.current}-day chain · best {piano.streak.best}</span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <>
          <div>
            <p data-testid="freeze-status" style={{ margin: 0, fontWeight: 700 }}>
              {frozenDay ? `❄️ Freeze used on ${shortDate(frozenDay)}` : '❄️ Freeze ready this week'}
            </p>
            <p style={{ margin: '0.15rem 0 0', color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>
              Miss one day a week and your chain keeps going.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <button
              type="button"
              className="cc-btn cc-btn-surface"
              data-testid="calendar-prev"
              aria-label="Previous month"
              onClick={goPrevMonth}
              disabled={isEarliestMonth}
              style={{ width: 44, height: 44, padding: 0 }}
            >
              ‹
            </button>
            <strong>{monthLabel(viewed.year, viewed.month)}</strong>
            <button
              type="button"
              className="cc-btn cc-btn-surface"
              data-testid="calendar-next"
              aria-label="Next month"
              onClick={goNextMonth}
              disabled={isCurrentMonth}
              style={{ width: 44, height: 44, padding: 0 }}
            >
              ›
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
            {WEEKDAY_LABELS.map((label) => (
              <span key={label} style={{ fontSize: '0.75rem', color: 'var(--cc-ink-soft)' }}>
                {label}
              </span>
            ))}
          </div>

          {weeks.map((row, rowIndex) => (
            <div key={rowIndex} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {row.map((day, cellIndex) => {
                if (!day) return <span key={cellIndex} style={{ width: 44, height: 44 }} />
                const kind = dayKind(piano, day, today)
                const isToday = day === today
                const dateNum = Number(day.slice(8, 10))
                const nextDay = row[cellIndex + 1]
                const chainsToNext =
                  !!nextDay &&
                  (kind === 'ring' || kind === 'frozen') &&
                  (() => {
                    const nextKind = dayKind(piano, nextDay, today)
                    return nextKind === 'ring' || nextKind === 'frozen'
                  })()
                return (
                  <div key={day} style={{ position: 'relative', width: 44, height: 44 }}>
                    {chainsToNext && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: 30,
                          left: '50%',
                          width: '100%',
                          height: 2,
                          background: 'var(--cc-success)',
                          zIndex: 0,
                        }}
                      />
                    )}
                    <button
                      type="button"
                      data-testid={`cal-${day}`}
                      aria-label={day}
                      disabled={kind === 'future'}
                      onClick={() => navigate(`/piano/day/${day}`)}
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        width: 44,
                        height: 44,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.15rem',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: kind === 'future' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <span style={{ fontSize: '0.8rem', fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--cc-primary)' : 'var(--cc-ink)' }}>
                        {dateNum}
                      </span>
                      {kind === 'frozen' ? (
                        <span aria-hidden="true" style={{ fontSize: '0.8rem' }}>
                          ❄️
                        </span>
                      ) : kind === 'future' ? null : (
                        <span
                          aria-hidden="true"
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: dotColor(kind),
                            border: kind === 'played' ? '2px solid var(--cc-success)' : 'none',
                          }}
                        />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

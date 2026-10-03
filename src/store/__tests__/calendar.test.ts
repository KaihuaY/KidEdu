import { describe, expect, it } from 'vitest'
import { dayKind, earliestMonth, monthGrid, monthLabel } from '../calendar'
import { emptyPiano, type PianoSection, type PianoTake } from '../progress'

function makeTake(day: string, overrides: Partial<PianoTake> = {}): PianoTake {
  return {
    id: `t-${day}-${Math.random()}`,
    day,
    pieceId: null,
    startedAt: Date.now(),
    durationSec: 60,
    activeSec: 60,
    mimeType: 'audio/webm',
    sizeBytes: 1,
    hasAudio: true,
    deviceId: 'd',
    ...overrides,
  }
}

describe('monthGrid', () => {
  it('September 2026 starts with 1 null pad (Sept 1 is a Tuesday) then the month days in order', () => {
    const weeks = monthGrid(2026, 9)
    expect(weeks[0]).toEqual([null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'])
  })

  it('every row has exactly 7 cells', () => {
    const weeks = monthGrid(2026, 9)
    for (const row of weeks) expect(row).toHaveLength(7)
  })

  it('contains every day of the month exactly once, with no duplicates', () => {
    const weeks = monthGrid(2026, 9)
    const days = weeks.flat().filter((d): d is string => d !== null)
    expect(days).toHaveLength(30)
    expect(days[0]).toBe('2026-09-01')
    expect(days[days.length - 1]).toBe('2026-09-30')
  })

  it('pads a month that ends mid-week with trailing nulls', () => {
    const weeks = monthGrid(2026, 9)
    const lastRow = weeks[weeks.length - 1]
    expect(lastRow.includes(null)).toBe(true)
  })
})

describe('dayKind', () => {
  const today = '2026-09-15'

  it('future for a day after today', () => {
    const piano = emptyPiano(0)
    expect(dayKind(piano, '2026-09-16', today)).toBe('future')
  })

  it('ring when the day reached the goal', () => {
    const piano: PianoSection = { ...emptyPiano(0), days: { '2026-09-10': { goalReachedAt: 1 } } }
    expect(dayKind(piano, '2026-09-10', today)).toBe('ring')
  })

  it('frozen when the day was covered by a streak freeze', () => {
    const piano: PianoSection = { ...emptyPiano(0), days: { '2026-09-10': { streakFreeze: true } } }
    expect(dayKind(piano, '2026-09-10', today)).toBe('frozen')
  })

  it('played when there are takes but no ring/freeze', () => {
    const piano: PianoSection = { ...emptyPiano(0), takes: [makeTake('2026-09-10')] }
    expect(dayKind(piano, '2026-09-10', today)).toBe('played')
  })

  it('none when nothing happened that day', () => {
    const piano = emptyPiano(0)
    expect(dayKind(piano, '2026-09-10', today)).toBe('none')
  })

  it('ring takes priority over frozen when somehow both are set', () => {
    const piano: PianoSection = { ...emptyPiano(0), days: { '2026-09-10': { goalReachedAt: 1, streakFreeze: true } } }
    expect(dayKind(piano, '2026-09-10', today)).toBe('ring')
  })

  it('sick when the day is marked sick', () => {
    const piano: PianoSection = { ...emptyPiano(0), days: { '2026-09-10': { sickDay: true } } }
    expect(dayKind(piano, '2026-09-10', today)).toBe('sick')
  })

  it('sick wins over played and frozen', () => {
    const piano: PianoSection = {
      ...emptyPiano(0),
      days: { '2026-09-10': { sickDay: true, streakFreeze: true } },
      takes: [makeTake('2026-09-10')],
    }
    expect(dayKind(piano, '2026-09-10', today)).toBe('sick')
  })

  it('ring wins over sick', () => {
    const piano: PianoSection = { ...emptyPiano(0), days: { '2026-09-10': { goalReachedAt: 1, sickDay: true } } }
    expect(dayKind(piano, '2026-09-10', today)).toBe('ring')
  })

  it('future wins over sick', () => {
    const piano: PianoSection = { ...emptyPiano(0), days: { '2026-09-16': { sickDay: true } } }
    expect(dayKind(piano, '2026-09-16', today)).toBe('future')
  })

  it('today itself is not future', () => {
    const piano = emptyPiano(0)
    expect(dayKind(piano, today, today)).toBe('none')
  })
})

describe('monthLabel', () => {
  it('formats as "Month Year"', () => {
    expect(monthLabel(2026, 9)).toBe('September 2026')
  })
})

describe('earliestMonth', () => {
  it('null when there are no takes', () => {
    expect(earliestMonth(emptyPiano(0))).toBeNull()
  })

  it('the month of the earliest non-note take', () => {
    const piano: PianoSection = {
      ...emptyPiano(0),
      takes: [makeTake('2026-09-20'), makeTake('2026-07-05'), makeTake('2026-08-11', { isNote: true })],
    }
    expect(earliestMonth(piano)).toEqual({ year: 2026, month: 7 })
  })
})

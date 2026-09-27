// A once-a-day "how do you feel after practice?" rating, 1-10, asked on the
// Record.tsx done screen once the ring is filled and (if missed there) again
// on the Journal card. Feeds a trend chart on Journal, DayView and
// ParentReview. Pure except setDayFeeling, which writes to the doc.

import { getDoc, update, type PianoDay, type PianoSection, type ProgressDoc } from './progress'

export const FEELING_MIN = 1
export const FEELING_MAX = 10

/** 1-2 😫, 3-4 😕, 5-6 😐, 7-8 🙂, 9-10 🤩 */
export function feelingEmoji(v: number): string {
  if (v <= 2) return '😫'
  if (v <= 4) return '😕'
  if (v <= 6) return '😐'
  if (v <= 8) return '🙂'
  return '🤩'
}

/** A data colour on a fixed red-to-green ramp, same in both themes. */
// theme-ok: a fixed data-colour ramp, not a light/dark surface colour.
export function feelingColor(v: number): string {
  return `hsl(${8 + (v - 1) * (122 / 9)}, 80%, 62%)`
}

/** Clamps to 1..10 and rounds; stamps `feelingAt`; a no-op if the value wouldn't change. */
export function setDayFeeling(day: string, value: number): void {
  const clamped = Math.min(FEELING_MAX, Math.max(FEELING_MIN, Math.round(value)))
  const current = getDoc().piano.days[day]?.feeling
  if (current === clamped) return
  update('piano', (piano) => {
    const d: PianoDay = piano.days[day] ?? {}
    return { ...piano, days: { ...piano.days, [day]: { ...d, feeling: clamped, feelingAt: Date.now() } } }
  })
}

/**
 * True when it's time to ask: not for a grown-up's voice note, the ring is
 * done today (just now or already), no feeling logged yet, and the nudge
 * wasn't already dismissed today. Pure.
 */
export function shouldAskFeeling(doc: ProgressDoc, day: string, ringJustReached: boolean, isNote = false): boolean {
  if (isNote) return false
  const d = doc.piano.days[day]
  if (!ringJustReached && !d?.goalReachedAt) return false
  if (d?.feeling !== undefined) return false
  if ((d?.nudges ?? []).includes('feeling')) return false
  return true
}

/** One point per day, label like '9/26', value undefined where no feeling was logged. */
export function feelingSeries(piano: PianoSection, days: string[]): { label: string; value: number | undefined }[] {
  return days.map((day) => ({
    label: `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`,
    value: piano.days[day]?.feeling,
  }))
}

/** Mean of the days with a feeling logged, rounded to 1 decimal - undefined if none. */
export function averageFeeling(piano: PianoSection, days: string[]): number | undefined {
  const values = days.map((day) => piano.days[day]?.feeling).filter((v): v is number => v !== undefined)
  if (values.length === 0) return undefined
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  return Math.round(mean * 10) / 10
}

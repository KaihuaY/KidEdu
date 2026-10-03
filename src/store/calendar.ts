// Pure helpers behind the streak calendar (src/components/StreakCalendar.tsx):
// a month's Mon-Sun week grid, and what to draw in each day's cell.

import { takesForDay } from './pianoRewards'
import type { PianoSection } from './progress'

export type DayKind = 'ring' | 'played' | 'sick' | 'frozen' | 'none' | 'future'

/** Local YYYY-MM-DD for `year`-`month` (1-12)-`date`. */
function ymd(year: number, month: number, date: number): string {
  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  const d = String(date).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Weeks (Mon..Sun) of a month as day strings; null pads outside the month. `month` is 1-12. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const firstOfMonth = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  // getDay(): 0 = Sunday .. 6 = Saturday. Days since the most recent Monday.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7

  const cells: (string | null)[] = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let date = 1; date <= daysInMonth; date++) cells.push(ymd(year, month, date))
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** What to draw for one day's cell. */
export function dayKind(piano: PianoSection, day: string, today: string): DayKind {
  if (day > today) return 'future'
  if (piano.days[day]?.goalReachedAt) return 'ring'
  if (piano.days[day]?.sickDay) return 'sick'
  if (piano.days[day]?.streakFreeze) return 'frozen'
  if (takesForDay(piano.takes, day).length > 0) return 'played'
  return 'none'
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** 'September 2026'. */
export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

/** The month of the earliest take day, or null when there are no takes. */
export function earliestMonth(piano: PianoSection): { year: number; month: number } | null {
  let earliest: string | null = null
  for (const t of piano.takes) {
    if (t.isNote) continue
    if (!earliest || t.day < earliest) earliest = t.day
  }
  if (!earliest) return null
  const [y, m] = earliest.split('-').map(Number)
  return { year: y, month: m }
}

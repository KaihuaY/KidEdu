// Sick days (grown-up action): a sick day pauses both the piano and the cube
// streak - it adds nothing to the count and does not break the chain, the same
// semantics as the weekly piano freeze. Works after the fact: marking the
// missed days of a streak that already reset restores it.

import { getDoc, update, type PianoSection, type PianoDay, type Streak } from './progress'
import { dayOffset, localDay } from './sessions'
import { updateRecords } from './records'
import { awardNewBadges } from './badges'

export const SICK_DAYS_BACK = 30
export const SICK_DAYS_AHEAD = 1

/** Every day marked as a sick day, sorted ascending. */
export function sickDays(piano: PianoSection): string[] {
  return Object.keys(piano.days)
    .filter((d) => piano.days[d]?.sickDay)
    .sort()
}

export function isSick(piano: PianoSection, day: string): boolean {
  return piano.days[day]?.sickDay === true
}

/** today-30 .. today+1 inclusive, oldest first. */
export function markableDays(today: string): string[] {
  const out: string[] = []
  for (let i = -SICK_DAYS_BACK; i <= SICK_DAYS_AHEAD; i++) out.push(dayOffset(today, i))
  return out
}

/** Counts practised days walking back from `endDay` (inclusive), passing over bridge days, stopping at the first day that is neither, or after 400 steps. */
export function chainLength(practised: (day: string) => boolean, bridge: (day: string) => boolean, endDay: string): number {
  let count = 0
  let d = endDay
  for (let i = 0; i < 400; i++) {
    if (practised(d)) count++
    else if (!bridge(d)) break
    d = dayOffset(d, -1)
  }
  return count
}

function derive(old: Streak, practisedDays: string[], practised: (d: string) => boolean, bridge: (d: string) => boolean): Streak {
  if (practisedDays.length === 0) return { current: 0, best: old.best, lastDay: old.lastDay }
  const lastDay = practisedDays.reduce((a, b) => (a > b ? a : b))
  const current = chainLength(practised, bridge, lastDay)
  return { current, best: Math.max(old.best, current), lastDay }
}

/** Piano: practised = goalReachedAt, bridge = sickDay or streakFreeze. End day = the latest ring day. */
export function recomputePianoStreak(piano: PianoSection): Streak {
  const ringDays = Object.keys(piano.days).filter((d) => piano.days[d]?.goalReachedAt)
  return derive(
    piano.streak,
    ringDays,
    (d) => Boolean(piano.days[d]?.goalReachedAt),
    (d) => Boolean(piano.days[d]?.sickDay || piano.days[d]?.streakFreeze),
  )
}

/** Cube: practised = has a session that day, bridge = a piano sick day. End day = the latest session day. */
export function recomputeCubeStreak(profile: { sessions: { day: string }[]; streak: Streak }, piano: PianoSection): Streak {
  const days = new Set(profile.sessions.map((s) => s.day))
  return derive(
    profile.streak,
    [...days],
    (d) => days.has(d),
    (d) => Boolean(piano.days[d]?.sickDay),
  )
}

/**
 * How a grown-up's mark changes a stored streak, given what the day history says
 * with the mark present (`withMark`) and absent (`withoutMark`).
 * - Marking never lowers: the result is the larger of the stored count and what
 *   the history now proves.
 * - Un-marking only follows the history when the stored count agreed with it
 *   (the normal case). A stored streak the history cannot fully prove - an older
 *   build's doc, a trimmed session list - is left exactly as it was, never cut.
 * `best` never goes down either way.
 */
function applyMark(old: Streak, withMark: Streak, withoutMark: Streak, marking: boolean): Streak {
  if (marking) {
    const current = Math.max(withMark.current, old.lastDay === withMark.lastDay ? old.current : 0)
    return { current, best: Math.max(old.best, current), lastDay: withMark.lastDay }
  }
  const consistent = old.lastDay === withMark.lastDay && old.current === withMark.current
  if (!consistent) return old
  return { current: withoutMark.current, best: old.best, lastDay: withoutMark.lastDay }
}

function sameStreak(a: Streak, b: Streak): boolean {
  return a.current === b.current && a.best === b.best && a.lastDay === b.lastDay
}

/**
 * Grown-up action (the UI puts it behind the PIN). Marks or un-marks `day` as a sick day and re-derives both streaks.
 * Ignored when `day` is outside markableDays(today), or when turning ON a day that reached the ring; a no-op (no
 * write at all) when the mark is already in the requested state. Returns true when it changed something.
 */
export function setSickDay(day: string, on: boolean, today: string = localDay()): boolean {
  if (!markableDays(today).includes(day)) return false
  const current = getDoc().piano
  if (isSick(current, day) === on) return false
  if (on && current.days[day]?.goalReachedAt) return false

  update('piano', (piano) => {
    const days: Record<string, PianoDay> = { ...piano.days }
    if (on) {
      days[day] = { ...days[day], sickDay: true }
    } else {
      const { sickDay: _removed, ...rest } = days[day] ?? {}
      void _removed
      if (Object.keys(rest).length === 0) delete days[day]
      else days[day] = rest
    }
    const next: PianoSection = { ...piano, days }
    const withMark = recomputePianoStreak(on ? next : piano)
    const withoutMark = recomputePianoStreak(on ? piano : next)
    return { ...next, streak: applyMark(piano.streak, withMark, withoutMark, on) }
  })

  const doc = getDoc()
  const kid = doc.profiles.kid
  const cubeNow = recomputeCubeStreak(kid, doc.piano)
  const cubeOther = recomputeCubeStreak(kid, on ? current : { ...doc.piano, days: { ...doc.piano.days, [day]: { ...doc.piano.days[day], sickDay: true } } })
  const cube = applyMark(kid.streak, on ? cubeNow : cubeOther, on ? cubeOther : cubeNow, on)
  if (!sameStreak(cube, kid.streak)) {
    update('profiles', (profiles) => ({ ...profiles, kid: { ...profiles.kid, streak: cube } }))
  }

  updateRecords()
  awardNewBadges()
  return true
}

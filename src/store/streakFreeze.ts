// Weekly streak freeze (piano only): missing one practice day in a
// Monday-Sunday week doesn't break the chain, so long as no other day that
// same week was already covered by a freeze. Pure functions over a
// PianoSection - src/store/piano.ts wires this into awardMarksIfReached.

import { dayOffset } from './sessions'
import type { PianoSection } from './progress'

/** Monday-based week key 'YYYY-MM-DD' of the Monday that starts the week containing `day`. */
export function weekKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  // getDay(): 0 = Sunday .. 6 = Saturday. Days since the most recent Monday.
  const sinceMonday = (date.getDay() + 6) % 7
  return dayOffset(day, -sinceMonday)
}

/** Days with `streakFreeze` set. */
export function frozenDays(piano: PianoSection): string[] {
  return Object.keys(piano.days).filter((day) => piano.days[day]?.streakFreeze)
}

/** The frozen day in the same Mon-Sun week as `day`, if any. */
export function freezeUsedInWeek(piano: PianoSection, day: string): string | undefined {
  const key = weekKey(day)
  return frozenDays(piano).find((d) => weekKey(d) === key)
}

/** True when no freeze has been used yet in `today`'s Mon-Sun week. */
export function freezeAvailable(piano: PianoSection, today: string): boolean {
  return freezeUsedInWeek(piano, today) === undefined
}

/**
 * If reaching the ring on `day` follows exactly one missed day (streak.lastDay
 * === day-2) and no freeze was used in the missed day's week, marks the
 * missed day frozen and returns the day; otherwise returns null. Pure:
 * returns a new piano section either way (unchanged when no freeze applies).
 */
export function applyFreezeIfNeeded(piano: PianoSection, day: string): { piano: PianoSection; frozenDay: string | null } {
  const twoDaysAgo = dayOffset(day, -2)
  if (piano.streak.lastDay !== twoDaysAgo) return { piano, frozenDay: null }
  const missedDay = dayOffset(day, -1)
  if (!freezeAvailable(piano, missedDay)) return { piano, frozenDay: null }

  const nextPiano: PianoSection = {
    ...piano,
    days: {
      ...piano.days,
      [missedDay]: { ...piano.days[missedDay], streakFreeze: true },
    },
  }
  return { piano: nextPiano, frozenDay: missedDay }
}

/**
 * What happens to the piano chain when the ring is reached on `day` after a gap. Looks at the days strictly
 * between streak.lastDay and `day` (if lastDay is empty, >= day, or the gap is longer than 60 days -> no bridge):
 * days that are sickDay or already streakFreeze are bridged. If no other day remains -> continues. If exactly ONE
 * other day remains and freezeAvailable(piano, thatDay) -> that day is frozen (streakFreeze: true) and the chain
 * continues. Otherwise it does not continue. A zero-day gap (lastDay === day-1) continues trivially with nothing bridged;
 * lastDay === day returns continues: true as well (same-day, bumpStreak leaves it unchanged).
 */
export function bridgeGap(
  piano: PianoSection,
  day: string,
): { piano: PianoSection; continues: boolean; frozenDay: string | null; sickBridged: number } {
  const last = piano.streak.lastDay
  const none = { piano, continues: false, frozenDay: null, sickBridged: 0 }
  if (!last || last > day) return none
  if (last === day || last === dayOffset(day, -1)) return { ...none, continues: true }

  const others: string[] = []
  let sick = 0
  let d = dayOffset(last, 1)
  for (let i = 0; d < day; i++) {
    if (i >= 60) return none
    const state = piano.days[d]
    if (state?.sickDay) sick++
    else if (!state?.streakFreeze) others.push(d)
    d = dayOffset(d, 1)
  }
  if (others.length === 0) return { piano, continues: true, frozenDay: null, sickBridged: sick }
  if (others.length > 1) return none
  const missed = others[0]
  if (!freezeAvailable(piano, missed)) return none
  const next: PianoSection = { ...piano, days: { ...piano.days, [missed]: { ...piano.days[missed], streakFreeze: true } } }
  return { piano: next, continues: true, frozenDay: missed, sickBridged: sick }
}

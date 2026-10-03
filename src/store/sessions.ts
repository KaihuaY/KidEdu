import { getDoc, update, type Streak } from './progress'

// ---------------------------------------------------------------------------
// Shared day/streak/clock helpers for both activities (cube and piano).
// `localDay` deliberately reads the *local* calendar day (year/month/date
// getters), not `toISOString()` (UTC) - the old Wall.tsx helper used UTC,
// which logs a late-evening practice session as tomorrow. See the plan's
// "Two findings" section.
// ---------------------------------------------------------------------------

/** The local calendar day (YYYY-MM-DD) for `d`, defaulting to now. */
export function localDay(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** The local day `deltaDays` away from `day` (negative = earlier). */
export function dayOffset(day: string, deltaDays: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + deltaDays)
  return localDay(date)
}

/** The last `n` local days (oldest first), ending at `today`. */
export function lastNDays(n: number, today: string = localDay()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(dayOffset(today, -i))
  return out
}

/**
 * A stable, monotonically increasing integer for a local day (round 13's
 * daily plan uses it to round-robin which Trick Gym node is today's pick, so
 * the rotation is the same for every device on the same day and moves on by
 * exactly one each day, with no drift or repeats).
 */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

/**
 * Advances a streak for a practice logged on `today`: continues it if the
 * last practice was yesterday, leaves it unchanged if it was already today,
 * and otherwise restarts it at 1. `best` tracks the highest `current` ever
 * reached.
 */
export function bumpStreak(streak: Streak, today: string): Streak {
  const yesterday = dayOffset(today, -1)
  let current: number
  if (streak.lastDay === yesterday) current = streak.current + 1
  else if (streak.lastDay === today) current = streak.current
  else current = 1
  return { current, best: Math.max(streak.best, current), lastDay: today }
}

/** Formats a duration in seconds as `M:SS`. */
export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** True when the profile streak's lastDay is earlier than yesterday, the gap is at most 60 days, and every day strictly between is a grown-up sick day. */
function sickGapOnly(lastDay: string, today: string, days: Record<string, { sickDay?: true } | undefined>): boolean {
  if (!lastDay || lastDay >= dayOffset(today, -1)) return false
  let d = dayOffset(lastDay, 1)
  for (let i = 0; i < 61; i++) {
    if (d >= today) return true
    if (!days[d]?.sickDay) return false
    d = dayOffset(d, 1)
  }
  return false
}

/**
 * Logs today's cube practice session (once per local day) and advances the
 * profile's streak. Replaces the old `updateStreakAndLogSession` in
 * Wall.tsx, now shared so other activities can follow the same rule.
 */
export function logCubeSession(profileId: 'kid' | 'parent', minutes: number): void {
  const today = localDay()
  const pianoDays = getDoc().piano.days
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const already = profile.sessions.some((s) => s.day === today)
    return {
      ...profiles,
      [profileId]: {
        ...profile,
        sessions: already ? profile.sessions : [...profile.sessions, { day: today, minutes, stagesDone: 0 }],
        streak: already
          ? profile.streak
          : bumpStreak(profileId === 'kid' && sickGapOnly(profile.streak.lastDay, today, pianoDays) ? { ...profile.streak, lastDay: dayOffset(today, -1) } : profile.streak, today),
      },
    }
  })
}

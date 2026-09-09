// The badge catalogue and the pure rule for which ones a doc has earned.
// Kept free of React/the progress store's `update()` so it's trivial to
// test; src/store/badges.ts is the thin stateful wrapper that persists
// newly-earned ids and fires toasts.

import { isMissionDone } from '../store/missions'
import type { ProgressDoc } from '../store/progress'

export interface Badge {
  id: string
  title: string
  emoji: string
  /** Shown greyed-out on the shelf until earned - how to get it. */
  how: string
}

export const BADGES: Badge[] = [
  { id: 'first-daisy', title: 'First daisy', emoji: '🌼', how: 'Finish "Finish the daisy" (D4) on the cube.' },
  { id: 'first-cross', title: 'White cross', emoji: '✝️', how: 'Finish "Check the T shapes" (C3) on the cube.' },
  { id: 'first-corners', title: 'All four corners', emoji: '📦', how: 'Finish "All four corners" (E3) on the cube.' },
  { id: 'first-middle', title: 'Middle layer done', emoji: '🎯', how: 'Finish "All four, no yellow but the top" (M4) on the cube.' },
  { id: 'first-yellow-cross', title: 'Yellow cross', emoji: '🌟', how: 'Finish "Finish the yellow cross" (Y2) on the cube.' },
  { id: 'summit', title: 'Summit', emoji: '🏔️', how: 'Solve the whole cube - reach the summit (S2).' },
  { id: 'cube-streak-3', title: '3-day cube streak', emoji: '🔥', how: 'Practice the cube 3 days in a row.' },
  { id: 'cube-streak-7', title: '7-day cube streak', emoji: '🔥', how: 'Practice the cube 7 days in a row.' },
  { id: 'cube-streak-14', title: '14-day cube streak', emoji: '🔥', how: 'Practice the cube 14 days in a row.' },
  { id: 'cube-streak-30', title: '30-day cube streak', emoji: '🔥', how: 'Practice the cube 30 days in a row.' },
  { id: 'piano-streak-3', title: '3-day piano streak', emoji: '🎹', how: 'Reach your piano goal 3 days in a row.' },
  { id: 'piano-streak-7', title: '7-day piano streak', emoji: '🎹', how: 'Reach your piano goal 7 days in a row.' },
  { id: 'piano-streak-14', title: '14-day piano streak', emoji: '🎹', how: 'Reach your piano goal 14 days in a row.' },
  { id: 'piano-streak-30', title: '30-day piano streak', emoji: '🎹', how: 'Reach your piano goal 30 days in a row.' },
  { id: 'first-take', title: 'First recording', emoji: '🎤', how: 'Record your first piano take.' },
  { id: 'ten-takes', title: '10 recordings', emoji: '🎼', how: 'Record 10 piano takes.' },
  { id: 'hundred-minutes', title: '100 minutes of playing', emoji: '⏱️', how: 'Play the piano for 100 minutes in total.' },
  { id: 'first-gold-stars', title: 'Triple star day', emoji: '⭐', how: 'Get 3 stars from your grown-up on a day.' },
]

/**
 * Every badge id `doc` currently qualifies for (order matches BADGES, not
 * earn order). Pure and cheap enough to call on every relevant doc change -
 * src/store/badges.ts diffs this against `rewards.badges` to find what's new.
 */
export function earnedBadges(doc: ProgressDoc): string[] {
  const out: string[] = []
  const kid = doc.profiles.kid

  if (isMissionDone(kid.holds.daisy, 'D4')) out.push('first-daisy')
  if (isMissionDone(kid.holds.cross, 'C3')) out.push('first-cross')
  if (isMissionDone(kid.holds.corners, 'E3')) out.push('first-corners')
  if (isMissionDone(kid.holds.middle, 'M4')) out.push('first-middle')
  if (isMissionDone(kid.holds.yellowCross, 'Y2')) out.push('first-yellow-cross')
  if (isMissionDone(kid.holds.cornerOrient, 'S2')) out.push('summit')

  const cubeStreakBest = kid.streak.best
  if (cubeStreakBest >= 3) out.push('cube-streak-3')
  if (cubeStreakBest >= 7) out.push('cube-streak-7')
  if (cubeStreakBest >= 14) out.push('cube-streak-14')
  if (cubeStreakBest >= 30) out.push('cube-streak-30')

  const pianoStreakBest = doc.piano.streak.best
  if (pianoStreakBest >= 3) out.push('piano-streak-3')
  if (pianoStreakBest >= 7) out.push('piano-streak-7')
  if (pianoStreakBest >= 14) out.push('piano-streak-14')
  if (pianoStreakBest >= 30) out.push('piano-streak-30')

  // Grown-up voice notes are flagged `isNote` and never count as practice.
  const realTakes = doc.piano.takes.filter((t) => !t.isNote)
  if (realTakes.length >= 1) out.push('first-take')
  if (realTakes.length >= 10) out.push('ten-takes')
  const totalActiveMinutes = realTakes.reduce((sum, t) => sum + t.activeSec, 0) / 60
  if (totalActiveMinutes >= 100) out.push('hundred-minutes')

  if (Object.values(doc.piano.days).some((d) => d.parentStars === 3)) out.push('first-gold-stars')

  return out
}

// Pure status for the three daily piano reward tiers (bronze ring goal, gold,
// and the bonus coin toss) on a given local day - shared by TierStrip.tsx (a
// compact strip on PianoHome) and, indirectly, by the done screen's
// celebration lines in Record.tsx. Kept free of React so it's trivial to
// unit test - see src/store/__tests__/tierStrip.test.ts.

import { pianoTiers } from './piano'
import { practiceSecondsForDay } from './pianoRewards'
import type { ProgressDoc } from './progress'

export type TierId = 'bronze' | 'gold' | 'bonus'

export interface TierMarker {
  tier: TierId
  /** Minutes needed to reach this tier. */
  minutes: number
  reached: boolean
  /** Only set on the bonus marker once the coin toss has landed. */
  bonusTier?: 'gold' | 'silver'
}

export interface TierStatus {
  markers: TierMarker[]
  /** The first unreached tier, and how many more minutes it needs (rounded up); undefined once all three are reached. */
  next?: { tier: TierId; minutesLeft: number }
  allReached: boolean
}

/** Today's status for all three daily piano tiers, from the doc alone - no storage reads. */
export function tierStatus(doc: ProgressDoc, today: string): TierStatus {
  const goalMin = doc.settings.goalMinutes.piano
  const { goldMin, bonusMin } = pianoTiers(doc.settings)
  const mode = doc.settings.pianoCountMode ?? 'recording'
  const minutes = practiceSecondsForDay(doc.piano.takes, today, mode) / 60
  const day = doc.piano.days[today]

  const markers: TierMarker[] = [
    { tier: 'bronze', minutes: goalMin, reached: Boolean(day?.goalReachedAt) },
    { tier: 'gold', minutes: goldMin, reached: Boolean(day?.goldReachedAt) },
    { tier: 'bonus', minutes: bonusMin, reached: Boolean(day?.bonusReachedAt), bonusTier: day?.bonusTier },
  ]

  const nextMarker = markers.find((m) => !m.reached)
  const next = nextMarker ? { tier: nextMarker.tier, minutesLeft: Math.max(0, Math.ceil(nextMarker.minutes - minutes)) } : undefined

  return { markers, next, allReached: markers.every((m) => m.reached) }
}

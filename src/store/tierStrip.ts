// Pure status of today's three daily piano marks for the strip under the ring
// (src/components/TierStrip.tsx): which are reached, which is next and how far.
import { pianoMarks } from './piano'
import { practiceSecondsForDay } from './pianoRewards'
import type { ProgressDoc, TokenCounts } from './progress'

export interface TierMarker {
  /** 0 = the ring goal, 1, 2. */
  index: number
  minutes: number
  tokens: TokenCounts
  reached: boolean
}

export interface TierStatus {
  markers: TierMarker[]
  next?: { index: number; minutesLeft: number }
  allReached: boolean
}

const STAMPS = ['goalReachedAt', 'goldReachedAt', 'bonusReachedAt'] as const

export function tierStatus(doc: ProgressDoc, today: string): TierStatus {
  const marks = pianoMarks(doc.settings)
  const mode = doc.settings.pianoCountMode ?? 'recording'
  const minutes = practiceSecondsForDay(doc.piano.takes, today, mode) / 60
  const day = doc.piano.days[today]
  const markers: TierMarker[] = marks.map((m, index) => ({ index, minutes: m.minutes, tokens: m.tokens, reached: Boolean(day?.[STAMPS[index]]) }))
  const nextMarker = markers.find((m) => !m.reached)
  const next = nextMarker ? { index: nextMarker.index, minutesLeft: Math.max(0, Math.ceil(nextMarker.minutes - minutes)) } : undefined
  return { markers, next, allReached: markers.every((m) => m.reached) }
}

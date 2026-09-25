import { describe, expect, it } from 'vitest'
import { defaultDoc, type PianoTake, type ProgressDoc } from '../progress'
import { tierStatus } from '../tierStrip'

const DAY = '2026-09-25'
function docWith(minutesPlayed: number, stamps: Partial<Record<'goalReachedAt' | 'goldReachedAt' | 'bonusReachedAt', number>> = {}): ProgressDoc {
  const doc = defaultDoc()
  doc.settings.goalMinutes.piano = 10
  const take: PianoTake = { id: 't1', day: DAY, pieceId: null, startedAt: 1, durationSec: minutesPlayed * 60, activeSec: minutesPlayed * 60, mimeType: 'audio/mp4', sizeBytes: 1, hasAudio: false, deviceId: 'd' }
  doc.piano.takes = minutesPlayed > 0 ? [take] : []
  doc.piano.days[DAY] = { ...stamps }
  return doc
}

describe('tierStatus (three daily marks)', () => {
  it('lists the three marks with their tokens and points at the ring goal first', () => {
    const s = tierStatus(docWith(0), DAY)
    expect(s.markers.map((m) => [m.index, m.minutes, m.reached])).toEqual([
      [0, 10, false],
      [1, 20, false],
      [2, 30, false],
    ])
    expect(s.markers[1].tokens).toEqual({ gold: 1, silver: 0, bronze: 1 })
    expect(s.next).toEqual({ index: 0, minutesLeft: 10 })
    expect(s.allReached).toBe(false)
  })

  it('counts minutes already played toward the next mark and never goes negative', () => {
    expect(tierStatus(docWith(7), DAY).next).toEqual({ index: 0, minutesLeft: 3 })
    expect(tierStatus(docWith(12, { goalReachedAt: 1 }), DAY).next).toEqual({ index: 1, minutesLeft: 8 })
    expect(tierStatus(docWith(25, { goalReachedAt: 1 }), DAY).next).toEqual({ index: 1, minutesLeft: 0 })
  })

  it('reports all reached once every mark is stamped', () => {
    const s = tierStatus(docWith(31, { goalReachedAt: 1, goldReachedAt: 2, bonusReachedAt: 3 }), DAY)
    expect(s.markers.every((m) => m.reached)).toBe(true)
    expect(s.next).toBeUndefined()
    expect(s.allReached).toBe(true)
  })

  it('follows the parent-configured marks and the count mode', () => {
    const doc = docWith(22)
    doc.settings.pianoMarks = [{ minutes: 10, tokens: { gold: 1, silver: 0, bronze: 0 } }, { minutes: 25, tokens: { gold: 2, silver: 0, bronze: 0 } }, { minutes: 40, tokens: { gold: 1, silver: 1, bronze: 1 } }]
    doc.piano.days[DAY] = { goalReachedAt: 1 }
    expect(tierStatus(doc, DAY).next).toEqual({ index: 1, minutesLeft: 3 })
    doc.settings.pianoCountMode = 'heard'
    doc.piano.takes[0].activeSec = 15 * 60
    expect(tierStatus(doc, DAY).next).toEqual({ index: 1, minutesLeft: 10 })
  })
})

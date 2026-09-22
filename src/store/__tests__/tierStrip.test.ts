import { describe, expect, it } from 'vitest'
import { tierStatus } from '../tierStrip'
import { defaultDoc, type PianoTake, type ProgressDoc } from '../progress'

const DAY = '2026-09-21'

function take(durationSec: number, extra: Partial<PianoTake> = {}): PianoTake {
  return {
    id: 't1',
    day: DAY,
    pieceId: null,
    startedAt: 1,
    durationSec,
    activeSec: durationSec,
    mimeType: 'audio/mp4',
    sizeBytes: 1,
    hasAudio: true,
    deviceId: 'd',
    ...extra,
  }
}

function baseDoc(): ProgressDoc {
  return defaultDoc()
}

describe('tierStatus', () => {
  it('nothing reached yet: next is bronze, with the full goal still owed', () => {
    const doc = baseDoc()
    doc.settings.goalMinutes.piano = 15
    const status = tierStatus(doc, DAY)
    expect(status.markers.map((m) => m.reached)).toEqual([false, false, false])
    expect(status.next).toEqual({ tier: 'bronze', minutesLeft: 15 })
    expect(status.allReached).toBe(false)
  })

  it('counts minutes already played toward the next tier', () => {
    const doc = baseDoc()
    doc.settings.goalMinutes.piano = 15
    doc.piano.takes = [take(10 * 60)]
    const status = tierStatus(doc, DAY)
    expect(status.next).toEqual({ tier: 'bronze', minutesLeft: 5 })
  })

  it('moves to gold once bronze is reached', () => {
    const doc = baseDoc()
    doc.settings.goalMinutes.piano = 15
    doc.piano.takes = [take(18 * 60)]
    doc.piano.days = { [DAY]: { goalReachedAt: 1 } }
    const status = tierStatus(doc, DAY)
    expect(status.markers[0].reached).toBe(true)
    expect(status.next).toEqual({ tier: 'gold', minutesLeft: 2 }) // default goldMin 20
  })

  it('moves to bonus once gold is reached too, and reports the bonus tier once resolved', () => {
    const doc = baseDoc()
    doc.piano.takes = [take(30 * 60)]
    doc.piano.days = { [DAY]: { goalReachedAt: 1, goldReachedAt: 1, bonusReachedAt: 1, bonusTier: 'silver' } }
    const status = tierStatus(doc, DAY)
    expect(status.allReached).toBe(true)
    expect(status.next).toBeUndefined()
    expect(status.markers[2]).toMatchObject({ reached: true, bonusTier: 'silver' })
  })

  it('respects parent-set tier minutes and the count mode', () => {
    const doc = baseDoc()
    doc.settings.pianoTiers = { goldMin: 25, bonusMin: 40 }
    doc.settings.pianoCountMode = 'heard'
    doc.piano.takes = [take(30 * 60, { activeSec: 24 * 60 })]
    doc.piano.days = { [DAY]: { goalReachedAt: 1 } }
    const status = tierStatus(doc, DAY)
    expect(status.next).toEqual({ tier: 'gold', minutesLeft: 1 })
  })

  it('minutesLeft never goes negative when she has already overshot the next tier', () => {
    const doc = baseDoc()
    doc.piano.takes = [take(45 * 60)]
    doc.piano.days = { [DAY]: { goalReachedAt: 1 } }
    const status = tierStatus(doc, DAY)
    expect(status.next?.tier).toBe('gold')
    expect(status.next?.minutesLeft).toBe(0)
  })
})

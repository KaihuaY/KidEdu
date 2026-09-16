import { beforeEach, describe, expect, it } from 'vitest'
import { clearRemoteKids, getRemoteKid, setRemoteKid, summarize } from '../family'
import { defaultDoc, type PianoDay, type PianoTake, type ProgressDoc } from '../progress'

function baseDoc(): ProgressDoc {
  return defaultDoc()
}

function take(overrides: Partial<PianoTake> = {}): PianoTake {
  return {
    id: 't1',
    day: '2026-09-15',
    pieceId: null,
    startedAt: 1,
    durationSec: 60,
    activeSec: 50,
    mimeType: 'audio/mp4',
    sizeBytes: 1,
    hasAudio: true,
    deviceId: 'd1',
    ...overrides,
  }
}

describe('summarize', () => {
  it('is all zeros for a brand new doc, with the fixed mission total', () => {
    const summary = summarize(baseDoc(), '2026-09-15')
    expect(summary).toEqual({
      cubeStreak: 0,
      pianoStreak: 0,
      missionsDone: 0,
      missionsTotal: 29,
      xp: 0,
      badges: 0,
      pianoMinutesThisWeek: 0,
      songsMetThisWeek: 0,
      cardsOwned: 0,
      beads: 0,
      braceletsFinished: 0,
      lastActiveDay: null,
    })
  })

  it('counts completed missions across every hold, ignoring unfinished ones', () => {
    const doc = baseDoc()
    doc.profiles.kid.holds = {
      daisy: {
        stages: {},
        missions: {
          m1: { completedAt: 1, tries: 1, help: 'none', minutes: 1 },
          m2: { tries: 1, help: 'none', minutes: 1 }, // no completedAt - not done
        },
      },
      cross: {
        stages: {},
        missions: { m3: { completedAt: 2, tries: 1, help: 'none', minutes: 1 } },
      },
    }
    expect(summarize(doc, '2026-09-15').missionsDone).toBe(2)
    expect(summarize(doc, '2026-09-15').missionsTotal).toBe(29)
  })

  it('reads xp and streaks straight off the kid profile / piano section', () => {
    const doc = baseDoc()
    doc.profiles.kid.xp = 42
    doc.profiles.kid.streak = { current: 5, best: 5, lastDay: '2026-09-14' }
    doc.piano.streak = { current: 3, best: 3, lastDay: '2026-09-13' }
    const summary = summarize(doc, '2026-09-15')
    expect(summary.xp).toBe(42)
    expect(summary.cubeStreak).toBe(5)
    expect(summary.pianoStreak).toBe(3)
  })

  it('counts badges, owned cards, loose beads and finished bracelets', () => {
    const doc = baseDoc()
    doc.rewards.badges = [
      { id: 'b1', earnedAt: 1 },
      { id: 'b2', earnedAt: 2 },
    ]
    doc.collection.items = [{ id: 'c1', count: 1, firstAt: 1 }]
    doc.collection.beads = { red: 3, blue: 2 }
    doc.collection.bracelets = [
      { id: 'br1', name: 'One', beads: [], startedAt: 1, finishedAt: 5 },
      { id: 'br2', name: 'Two', beads: [], startedAt: 1 },
    ]
    const summary = summarize(doc, '2026-09-15')
    expect(summary.badges).toBe(2)
    expect(summary.cardsOwned).toBe(1)
    expect(summary.beads).toBe(5)
    expect(summary.braceletsFinished).toBe(1)
  })

  it('sums piano minutes and counts song-met days within the last 7 days only', () => {
    const doc = baseDoc()
    doc.settings.pianoCountMode = 'recording'
    doc.piano.takes = [
      take({ id: 't1', day: '2026-09-15', durationSec: 120 }),
      take({ id: 't2', day: '2026-09-01', durationSec: 600 }), // outside the 7-day window
    ]
    const futureDay: PianoDay & { songBeadsAwarded?: string[] } = { songBeadsAwarded: ['bead-1'] }
    doc.piano.days = { ...doc.piano.days, '2026-09-15': futureDay }
    const summary = summarize(doc, '2026-09-15')
    expect(summary.pianoMinutesThisWeek).toBe(2) // 120s, the out-of-window take excluded
    expect(summary.songsMetThisWeek).toBe(1)
  })

  it("is defensive when songBeadsAwarded is absent (a doc from before that field existed)", () => {
    const doc = baseDoc()
    doc.piano.takes = [take()]
    expect(() => summarize(doc, '2026-09-15')).not.toThrow()
    expect(summarize(doc, '2026-09-15').songsMetThisWeek).toBe(0)
  })

  it("lastActiveDay is the max of both streaks' lastDay and the newest take day", () => {
    const doc = baseDoc()
    doc.profiles.kid.streak.lastDay = '2026-09-10'
    doc.piano.streak.lastDay = '2026-09-12'
    doc.piano.takes = [take({ day: '2026-09-14' })]
    expect(summarize(doc, '2026-09-15').lastActiveDay).toBe('2026-09-14')
  })

  it('lastActiveDay is null when nothing has ever happened', () => {
    expect(summarize(baseDoc(), '2026-09-15').lastActiveDay).toBeNull()
  })
})

describe('remote kid store', () => {
  beforeEach(() => {
    clearRemoteKids()
  })

  it('has nothing for a kid nobody has synced yet', () => {
    expect(getRemoteKid('amelia')).toBeUndefined()
  })

  it('records and forgets a remote kid', () => {
    const doc = baseDoc()
    setRemoteKid('amelia', doc, 1000)
    expect(getRemoteKid('amelia')).toEqual({ doc, updatedAt: 1000 })
    clearRemoteKids()
    expect(getRemoteKid('amelia')).toBeUndefined()
  })

  it('overwrites a previous entry for the same kid', () => {
    setRemoteKid('amelia', baseDoc(), 1000)
    const newer = baseDoc()
    newer.profiles.kid.xp = 99
    setRemoteKid('amelia', newer, 2000)
    expect(getRemoteKid('amelia')).toEqual({ doc: newer, updatedAt: 2000 })
  })
})

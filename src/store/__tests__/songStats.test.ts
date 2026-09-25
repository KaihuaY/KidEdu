import { describe, expect, it } from 'vitest'
import type { PianoPiece, PianoTake } from '../progress'
import { formatTotal, groupPieces, recentSeries, songStats, sortSongs } from '../songStats'

let n = 0
function take(day: string, pieceId: string | null, durationSec: number, extra: Partial<PianoTake> = {}): PianoTake {
  n++
  return { id: `t${n}`, day, pieceId, startedAt: Date.parse(day + 'T10:00:00') + n * 60_000, durationSec, activeSec: Math.round(durationSec * 0.8), mimeType: 'audio/mp4', sizeBytes: 1, hasAudio: true, deviceId: 'd', ...extra }
}
const takes = [
  take('2026-09-20', 'a', 60),
  take('2026-09-20', 'a', 90, { repetitions: 3 }),
  take('2026-09-22', 'a', 120),
  take('2026-09-22', 'b', 30),
  take('2026-09-23', 'a', 300, { isNote: true }),
  take('2026-09-23', null, 45),
]
const pieces: PianoPiece[] = [
  { id: 'a', name: 'Twinkle', emoji: '⭐', status: 'week', order: 2 },
  { id: 'b', name: 'Ode', emoji: '🎵' },
  { id: 'c', name: 'Old song', emoji: '🎵', status: 'archived' },
  { id: 'd', name: 'Puff', emoji: '🐉', status: 'week', order: 1 },
]

describe('songStats', () => {
  it('counts takes, plays (repetitions count), total time, days; notes never count', () => {
    const s = songStats(takes, 'a')
    expect(s).toMatchObject({ takes: 3, plays: 5, totalSec: 270, daysPlayed: 2, firstDay: '2026-09-20', lastDay: '2026-09-22', avgTakeSec: 90 })
    expect(s.perDay).toEqual([
      { day: '2026-09-20', plays: 4, sec: 150 },
      { day: '2026-09-22', plays: 1, sec: 120 },
    ])
  })

  it('uses heard seconds in heard mode and returns zeros for an unplayed piece', () => {
    expect(songStats(takes, 'a', 'heard').totalSec).toBe(216)
    expect(songStats(takes, 'zzz')).toMatchObject({ takes: 0, plays: 0, totalSec: 0, firstDay: null, daysPlayed: 0 })
  })

  it('builds a gap-free recent series ending today', () => {
    const series = recentSeries(songStats(takes, 'a'), '2026-09-23', 5)
    expect(series.map((d) => d.day)).toEqual(['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'])
    expect(series.map((d) => d.plays)).toEqual([0, 4, 0, 1, 0])
  })

  it('sorts by plays, time, recent and name', () => {
    const stats = new Map(pieces.map((p) => [p.id, songStats(takes, p.id)]))
    expect(sortSongs(pieces, stats, 'plays').map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
    // a and b were both last played on the 22nd: the tie breaks by name (Ode before Twinkle)
    expect(sortSongs(pieces, stats, 'recent').map((p) => p.id)).toEqual(['b', 'a', 'c', 'd'])
    expect(sortSongs(pieces, stats, 'name').map((p) => p.id)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('groups pieces: week by manual order, keep by last played, archived apart', () => {
    const g = groupPieces(pieces, takes)
    expect(g.week.map((p) => p.id)).toEqual(['d', 'a'])
    expect(g.more.map((p) => p.id)).toEqual(['b'])
    expect(g.archived.map((p) => p.id)).toEqual(['c'])
  })

  it('formats totals for kids', () => {
    expect(formatTotal(50)).toBe('50 s')
    expect(formatTotal(45 * 60)).toBe('45 min')
    expect(formatTotal(72 * 60)).toBe('1 h 12 min')
    expect(formatTotal(120 * 60)).toBe('2 h')
  })
})

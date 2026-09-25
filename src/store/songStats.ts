// Per-song statistics (how often and how long each piece was played) and the
// grouping of the song list for Piano home. Pure functions over the doc.

import type { PianoCountMode, PianoPiece, PianoTake, ProgressDoc } from './progress'
import { playsInTake } from './records'
import { dayOffset } from './sessions'

export interface SongDay {
  day: string
  plays: number
  sec: number
}

export interface SongStats {
  pieceId: string
  takes: number
  plays: number
  totalSec: number
  avgTakeSec: number
  firstDay: string | null
  lastDay: string | null
  daysPlayed: number
  /** One entry per day with at least one take, oldest first. */
  perDay: SongDay[]
}

function takeSec(t: PianoTake, mode: PianoCountMode): number {
  return mode === 'heard' ? t.activeSec : t.durationSec
}

export function songStats(takes: PianoTake[], pieceId: string, mode: PianoCountMode = 'recording'): SongStats {
  const mine = takes.filter((t) => !t.isNote && t.pieceId === pieceId).sort((a, b) => a.startedAt - b.startedAt)
  const byDay = new Map<string, SongDay>()
  let plays = 0
  let totalSec = 0
  for (const t of mine) {
    const p = playsInTake(t)
    const s = takeSec(t, mode)
    plays += p
    totalSec += s
    const d = byDay.get(t.day) ?? { day: t.day, plays: 0, sec: 0 }
    d.plays += p
    d.sec += s
    byDay.set(t.day, d)
  }
  const perDay = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
  return {
    pieceId,
    takes: mine.length,
    plays,
    totalSec: Math.round(totalSec),
    avgTakeSec: mine.length ? Math.round(totalSec / mine.length) : 0,
    firstDay: perDay[0]?.day ?? null,
    lastDay: perDay[perDay.length - 1]?.day ?? null,
    daysPlayed: perDay.length,
    perDay,
  }
}

/** Stats for every piece in settings (archived included), keyed by piece id. */
export function allSongStats(doc: ProgressDoc): Map<string, SongStats> {
  const mode = doc.settings.pianoCountMode ?? 'recording'
  const out = new Map<string, SongStats>()
  for (const p of doc.settings.pianoPieces) out.set(p.id, songStats(doc.piano.takes, p.id, mode))
  return out
}

/** Plays (and seconds) for each of the last `days` days ending today, zeros for silent days - for a bar chart. */
export function recentSeries(stats: SongStats, today: string, days = 21): SongDay[] {
  const byDay = new Map(stats.perDay.map((d) => [d.day, d]))
  const out: SongDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = dayOffset(today, -i)
    out.push(byDay.get(day) ?? { day, plays: 0, sec: 0 })
  }
  return out
}

export type SongSort = 'plays' | 'time' | 'recent' | 'name'

export function sortSongs(pieces: PianoPiece[], stats: Map<string, SongStats>, by: SongSort): PianoPiece[] {
  const s = (p: PianoPiece) => stats.get(p.id)
  return [...pieces].sort((a, b) => {
    if (by === 'name') return a.name.trim().localeCompare(b.name.trim())
    if (by === 'plays') return (s(b)?.plays ?? 0) - (s(a)?.plays ?? 0) || a.name.localeCompare(b.name)
    if (by === 'time') return (s(b)?.totalSec ?? 0) - (s(a)?.totalSec ?? 0) || a.name.localeCompare(b.name)
    return (s(b)?.lastDay ?? '').localeCompare(s(a)?.lastDay ?? '') || a.name.localeCompare(b.name)
  })
}

export type PieceStatus = 'week' | 'keep' | 'archived'

/** A piece that was never given a status (every piece from before round 9) stays a big chip, as it always was. */
export function pieceStatus(p: PianoPiece): PieceStatus {
  return p.status ?? 'week'
}

export interface PieceGroups {
  /** This week's pieces, in manual order. */
  week: PianoPiece[]
  /** Everything else she can still pick, most recently played first. */
  more: PianoPiece[]
  /** Hidden from the kid; history kept. */
  archived: PianoPiece[]
}

/** Splits the pieces for Piano home: 'week' chips first, then "More songs" by last played, archived hidden. */
export function groupPieces(pieces: PianoPiece[], takes: PianoTake[]): PieceGroups {
  const lastDay = new Map<string, string>()
  for (const t of takes) {
    if (t.isNote || !t.pieceId) continue
    if ((lastDay.get(t.pieceId) ?? '') < t.day) lastDay.set(t.pieceId, t.day)
  }
  const byOrder = (a: PianoPiece, b: PianoPiece) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.name.localeCompare(b.name)
  const week = pieces.filter((p) => pieceStatus(p) === 'week').sort(byOrder)
  const more = pieces
    .filter((p) => pieceStatus(p) === 'keep')
    .sort((a, b) => (lastDay.get(b.id) ?? '').localeCompare(lastDay.get(a.id) ?? '') || byOrder(a, b))
  const archived = pieces.filter((p) => pieceStatus(p) === 'archived').sort(byOrder)
  return { week, more, archived }
}

/** "1 h 12 min" / "45 min" / "50 s" for a total. */
export function formatTotal(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

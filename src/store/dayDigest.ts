// Everything that happened on one day, for the day view: takes, marks reached,
// journal entries, the week's teacher note, records set and parent stars. Pure.

import type { ParentStars, PianoTake, ProgressDoc, RecordEntry, TeacherNote, TokenCounts } from './progress'
import { pianoMarks } from './piano'
import { practiceSecondsForDay } from './pianoRewards'
import { journalForDay } from './journal'
import { RECORD_KEYS, type RecordKey } from './records'
import { teacherNotesForWeek } from './teacherNotes'
import { dayOffset } from './sessions'
import type { JournalEntry } from './progress'

export interface DayDigest {
  day: string
  takes: PianoTake[]
  playedSec: number
  marks: { index: number; minutes: number; tokens: TokenCounts; reached: boolean }[]
  journal: JournalEntry[]
  teacherNotes: TeacherNote[]
  records: { key: RecordKey; entry: RecordEntry }[]
  parentStars?: ParentStars
  /** Piece ids played that day with their play counts, most played first. */
  songs: { pieceId: string | null; plays: number; sec: number }[]
}

const STAMPS = ['goalReachedAt', 'goldReachedAt', 'bonusReachedAt'] as const

export function dayDigest(doc: ProgressDoc, day: string): DayDigest {
  const mode = doc.settings.pianoCountMode ?? 'recording'
  const takes = doc.piano.takes.filter((t) => t.day === day && !t.isNote).sort((a, b) => a.startedAt - b.startedAt)
  const state = doc.piano.days[day]
  const marks = pianoMarks(doc.settings).map((m, index) => ({ index, minutes: m.minutes, tokens: m.tokens, reached: Boolean(state?.[STAMPS[index]]) }))
  const songs = new Map<string | null, { pieceId: string | null; plays: number; sec: number }>()
  for (const t of takes) {
    const s = songs.get(t.pieceId) ?? { pieceId: t.pieceId, plays: 0, sec: 0 }
    s.plays += Math.max(1, t.repetitions ?? 0)
    s.sec += mode === 'heard' ? t.activeSec : t.durationSec
    songs.set(t.pieceId, s)
  }
  const records: DayDigest['records'] = []
  for (const key of RECORD_KEYS) {
    const entry = doc.piano.records?.[key]
    if (entry && entry.day === day) records.push({ key, entry })
  }
  return {
    day,
    takes,
    playedSec: Math.round(practiceSecondsForDay(doc.piano.takes, day, mode)),
    marks,
    journal: journalForDay(doc.piano.journal, day),
    teacherNotes: teacherNotesForWeek(doc.teacherNotes.items, day),
    records,
    parentStars: state?.parentStars,
    songs: [...songs.values()].sort((a, b) => b.plays - a.plays || b.sec - a.sec),
  }
}

export interface DayDot {
  day: string
  played: boolean
  ring: boolean
  journal: boolean
  teacherNote: boolean
}

/** One dot per day for the date strip, oldest first. */
export function dayDots(doc: ProgressDoc, today: string, days = 60): DayDot[] {
  const played = new Set(doc.piano.takes.filter((t) => !t.isNote).map((t) => t.day))
  const journal = new Set((doc.piano.journal ?? []).map((e) => e.day))
  const notes = new Set(doc.teacherNotes.items.map((n) => n.day))
  const out: DayDot[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = dayOffset(today, -i)
    out.push({ day, played: played.has(day), ring: Boolean(doc.piano.days[day]?.goalReachedAt), journal: journal.has(day), teacherNote: notes.has(day) })
  }
  return out
}

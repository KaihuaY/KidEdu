import { beforeEach, describe, expect, it } from 'vitest'
import { getDoc, resetAll, type PianoTake } from '../progress'
import { saveTake } from '../piano'
import { addJournalEntry, appendJournalEntry, deleteJournalEntry, JOURNAL_MAX_CHARS, journalForDay, markNudgeShown, nudgeFor } from '../journal'
import { addTeacherNote, deleteTeacherNote, setTeacherNoteUpload, teacherNotesForWeek } from '../teacherNotes'
import { dayDigest, dayDots } from '../dayDigest'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

const DAY = '2026-09-25'
let n = 0
function take(day: string, durationSec: number, extra: Partial<PianoTake> = {}): PianoTake {
  n++
  return { id: `t${n}`, day, pieceId: 'p1', startedAt: Date.parse(day + 'T10:00:00') + n * 60_000, durationSec, activeSec: durationSec, mimeType: 'audio/mp4', sizeBytes: 1, hasAudio: true, deviceId: 'd', ...extra }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  resetAll()
  n = 0
})

describe('nudges', () => {
  it('shows the third-take nudge once, and the ring nudge wins when both apply', () => {
    saveTake(take(DAY, 60))
    saveTake(take(DAY, 60))
    expect(nudgeFor(getDoc(), DAY, false)).toBeNull()
    saveTake(take(DAY, 60))
    expect(nudgeFor(getDoc(), DAY, false)?.id).toBe('third-take')
    expect(nudgeFor(getDoc(), DAY, true)?.id).toBe('mark-1')
    markNudgeShown(DAY, 'third-take')
    markNudgeShown(DAY, 'third-take')
    expect(getDoc().piano.days[DAY].nudges).toEqual(['third-take'])
    expect(nudgeFor(getDoc(), DAY, false)).toBeNull()
    expect(nudgeFor(getDoc(), DAY, true)?.prompt).toBe('The tricky part was…')
    markNudgeShown(DAY, 'mark-1')
    expect(nudgeFor(getDoc(), DAY, true)).toBeNull()
  })

  it('never nudges on a voice note and does not count notes as takes', () => {
    saveTake(take(DAY, 60, { isNote: true }))
    saveTake(take(DAY, 60, { isNote: true }))
    saveTake(take(DAY, 60, { isNote: true }))
    expect(nudgeFor(getDoc(), DAY, false)).toBeNull()
    expect(nudgeFor(getDoc(), DAY, true, true)).toBeNull()
  })
})

describe('journal', () => {
  it('adds, appends, lists per day and deletes; empty entries are ignored; text is capped', () => {
    expect(addJournalEntry({ day: DAY, text: '   ' })).toBeNull()
    const id = addJournalEntry({ day: DAY, text: 'The tricky part was the jump.', mood: 3, prompt: 'The tricky part was…' })!
    addJournalEntry({ day: '2026-09-24', text: 'Yesterday' })
    expect(journalForDay(getDoc().piano.journal, DAY).map((e) => e.text)).toEqual(['The tricky part was the jump.'])
    appendJournalEntry(id, 'I fixed it slowly.')
    expect(journalForDay(getDoc().piano.journal, DAY)[0].text).toBe('The tricky part was the jump.\nI fixed it slowly.')
    expect(addJournalEntry({ day: DAY, mood: 4, text: '' })).not.toBeNull()
    const long = addJournalEntry({ day: DAY, text: 'x'.repeat(500) })!
    expect(getDoc().piano.journal!.find((e) => e.id === long)!.text).toHaveLength(JOURNAL_MAX_CHARS)
    deleteJournalEntry(id)
    expect(getDoc().piano.journal!.some((e) => e.id === id)).toBe(false)
  })
})

describe('teacher notes + day digest', () => {
  it('stores a note with its thumbnail, tracks the upload, and attaches it to the following week', () => {
    const id = addTeacherNote({ day: '2026-09-22', thumbDataUrl: 'data:image/jpeg;base64,AAAA', caption: 'Week 3' })
    setTeacherNoteUpload(id, { status: 'done', driveUrl: 'https://drive/x' })
    const items = getDoc().teacherNotes.items
    expect(items[0]).toMatchObject({ day: '2026-09-22', caption: 'Week 3', upload: { status: 'done', driveUrl: 'https://drive/x' } })
    expect(teacherNotesForWeek(items, '2026-09-25').map((x) => x.id)).toEqual([id])
    expect(teacherNotesForWeek(items, '2026-09-30')).toEqual([])
    expect(teacherNotesForWeek(items, '2026-09-21')).toEqual([])
    deleteTeacherNote(id)
    expect(getDoc().teacherNotes.items).toEqual([])
  })

  it('digests a day: takes, songs, marks, journal, week note, records, and dots for the strip', () => {
    saveTake(take(DAY, 120, { repetitions: 2 }))
    saveTake(take(DAY, 60, { pieceId: 'p2' }))
    saveTake(take('2026-09-24', 30))
    addJournalEntry({ day: DAY, text: 'Fun!', mood: 4 })
    addTeacherNote({ day: '2026-09-23', thumbDataUrl: 'data:,' })
    const d = dayDigest(getDoc(), DAY)
    expect(d.takes).toHaveLength(2)
    expect(d.playedSec).toBe(180)
    expect(d.songs).toEqual([
      { pieceId: 'p1', plays: 2, sec: 120 },
      { pieceId: 'p2', plays: 1, sec: 60 },
    ])
    expect(d.marks.map((m) => m.reached)).toEqual([false, false, false])
    expect(d.journal[0].text).toBe('Fun!')
    expect(d.teacherNotes).toHaveLength(1)
    const dots = dayDots(getDoc(), DAY, 3)
    expect(dots.map((x) => x.day)).toEqual(['2026-09-23', '2026-09-24', DAY])
    expect(dots.map((x) => x.played)).toEqual([false, true, true])
    expect(dots[2]).toMatchObject({ journal: true, teacherNote: false })
    expect(dots[0].teacherNote).toBe(true)
  })
})

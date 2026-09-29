import { beforeEach, describe, expect, it } from 'vitest'
import { defaultDoc, getDoc, resetAll, update, type ProgressDoc, type TeacherNote } from '../progress'
import {
  addTeacherNote,
  confirmTeacherDay,
  confirmedDaysFor,
  currentTeacherNote,
  shouldRemindTeacher,
  teacherStarTarget,
  teacherWeekDays,
} from '../teacherNotes'

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

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  resetAll()
})

/** A bare TeacherNote, for pure-function tests that don't need the store. */
function note(id: string, day: string, takenAt = 0): TeacherNote {
  return { id, day, takenAt, thumbDataUrl: 'data:,', upload: { status: 'pending', attempts: 0, updatedAt: 0 } }
}

describe('currentTeacherNote', () => {
  const today = '2026-09-25'

  it('picks the newest note within 14 days', () => {
    const items = [note('a', '2026-09-15'), note('b', '2026-09-20')]
    expect(currentTeacherNote(items, today)?.id).toBe('b')
  })

  it('is undefined when the only note is older than 14 days', () => {
    // today - 13 = 2026-09-12, so 2026-09-10 is just outside the window.
    expect(currentTeacherNote([note('a', '2026-09-10')], today)).toBeUndefined()
  })
})

describe('teacherWeekDays', () => {
  it('ends the day before the next newer note', () => {
    const a = note('a', '2026-09-10')
    const b = note('b', '2026-09-14')
    expect(teacherWeekDays([a, b], a)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'])
  })

  it('is capped at 7 days when there is no next note', () => {
    const a = note('a', '2026-09-10')
    expect(teacherWeekDays([a], a)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
    ])
  })
})

describe('shouldRemindTeacher', () => {
  const today = '2026-09-25'

  function docWithNote(day: string): ProgressDoc {
    const doc = defaultDoc()
    doc.teacherNotes = { items: [note('n1', day)], updatedAt: 0 }
    return doc
  }

  it('is undefined with no current note', () => {
    expect(shouldRemindTeacher(defaultDoc(), today, true)).toBeUndefined()
  })

  it('is undefined when the ring is not done', () => {
    expect(shouldRemindTeacher(docWithNote('2026-09-20'), today, false)).toBeUndefined()
  })

  it('is undefined for a grown-up voice note', () => {
    expect(shouldRemindTeacher(docWithNote('2026-09-20'), today, true, true)).toBeUndefined()
  })

  it('is undefined once today is already confirmed', () => {
    const doc = docWithNote('2026-09-20')
    doc.piano.days[today] = { teacherConfirmed: { noteId: 'n1', at: 1 } }
    expect(shouldRemindTeacher(doc, today, true)).toBeUndefined()
  })

  it("is undefined once the 'teacher' nudge was already shown today", () => {
    const doc = docWithNote('2026-09-20')
    doc.piano.days[today] = { nudges: ['teacher'] }
    expect(shouldRemindTeacher(doc, today, true)).toBeUndefined()
  })

  it('otherwise returns the current note', () => {
    expect(shouldRemindTeacher(docWithNote('2026-09-20'), today, true)?.id).toBe('n1')
  })
})

describe('confirmTeacherDay', () => {
  it('is idempotent per day: confirming the same day twice confirms once and leaves tokens unchanged', () => {
    const id = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    const r1 = confirmTeacherDay('2026-09-21', id)
    expect(r1.confirmedDays).toBe(1)
    const goldAfterFirst = getDoc().profiles.kid.tokens.gold
    const r2 = confirmTeacherDay('2026-09-21', id)
    expect(r2.confirmedDays).toBe(1)
    expect(getDoc().profiles.kid.tokens.gold).toBe(goldAfterFirst)
  })

  it('awards the star exactly once at the default target (3): +1 gold, starAwardedAt set, badge earned', () => {
    const id = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    confirmTeacherDay('2026-09-20', id)
    confirmTeacherDay('2026-09-21', id)
    const goldBeforeStar = getDoc().profiles.kid.tokens.gold
    const r = confirmTeacherDay('2026-09-22', id)
    expect(r.starJustAwarded).toBe(true)
    expect(r.target).toBe(3)
    expect(getDoc().profiles.kid.tokens.gold).toBe(goldBeforeStar + 1)
    expect(getDoc().teacherNotes.items.find((n) => n.id === id)?.starAwardedAt).toEqual(expect.any(Number))
    expect(getDoc().rewards.badges?.some((b) => b.id === 'teacher-star-1')).toBe(true)

    // A further confirmed day never awards a second gold for the same note.
    const goldAfterStar = getDoc().profiles.kid.tokens.gold
    const r4 = confirmTeacherDay('2026-09-23', id)
    expect(r4.starJustAwarded).toBe(false)
    expect(getDoc().profiles.kid.tokens.gold).toBe(goldAfterStar)
  })

  it('awards the star at a lower configured target (2)', () => {
    update('settings', (s) => ({ ...s, teacherStarDays: 2 }))
    const id = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    confirmTeacherDay('2026-09-20', id)
    const r = confirmTeacherDay('2026-09-21', id)
    expect(r.starJustAwarded).toBe(true)
    expect(r.target).toBe(2)
  })

  it('confirmations stamped for an older note never count toward a newer one', () => {
    const oldId = addTeacherNote({ day: '2026-09-01', thumbDataUrl: 'data:,' })
    const newId = addTeacherNote({ day: '2026-09-20', thumbDataUrl: 'data:,' })
    // Stamp an old-note confirmation on a day that also falls inside the new note's week window.
    update('piano', (piano) => ({
      ...piano,
      days: { ...piano.days, '2026-09-21': { teacherConfirmed: { noteId: oldId, at: 1 } } },
    }))
    const newNote = getDoc().teacherNotes.items.find((n) => n.id === newId)!
    expect(confirmedDaysFor(getDoc(), newNote)).toEqual([])
  })
})

describe('teacherStarTarget', () => {
  it('defaults to 3 and clamps to 1..7', () => {
    const doc = defaultDoc()
    expect(teacherStarTarget(doc.settings)).toBe(3)
    expect(teacherStarTarget({ ...doc.settings, teacherStarDays: 0 })).toBe(1)
    expect(teacherStarTarget({ ...doc.settings, teacherStarDays: -5 })).toBe(1)
    expect(teacherStarTarget({ ...doc.settings, teacherStarDays: 10 })).toBe(7)
    expect(teacherStarTarget({ ...doc.settings, teacherStarDays: 5 })).toBe(5)
  })
})

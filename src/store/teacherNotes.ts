// Photos of the teacher's weekly note in the kid's notebook. The synced doc
// keeps a small thumbnail per note; the full photo is stored locally
// (recordings IndexedDB, store 'photos') until the Drive upload worker has
// sent it, after which the Drive link is the source for the full size.

import { getDoc, update, useProgress, type ProgressDoc, type Settings, type TeacherNote } from './progress'
import { dayOffset } from './sessions'
import { grantTokens } from './piano'
import { awardNewBadges } from './badges'

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const TEACHER_ITEM_MAX_CHARS = 80
const TEACHER_ITEMS_MAX = 3

/** Trims, drops empty lines, and caps at 3 items of up to 80 characters each. */
function normalizeTeacherItems(items: string[]): string[] {
  return items
    .map((s) => s.trim().slice(0, TEACHER_ITEM_MAX_CHARS))
    .filter((s) => s.length > 0)
    .slice(0, TEACHER_ITEMS_MAX)
}

export function addTeacherNote(input: { day: string; thumbDataUrl: string; caption?: string; takenAt?: number; items?: string[] }): string {
  const id = uid()
  const note: TeacherNote = {
    id,
    day: input.day,
    takenAt: input.takenAt ?? Date.now(),
    thumbDataUrl: input.thumbDataUrl,
    upload: { status: 'pending', attempts: 0, updatedAt: Date.now() },
  }
  if (input.caption?.trim()) note.caption = input.caption.trim()
  const items = input.items ? normalizeTeacherItems(input.items) : []
  if (items.length > 0) note.items = items
  update('teacherNotes', (s) => ({ ...s, items: [...s.items, note] }))
  return id
}

/** Replaces a note's typed items (trimmed, empties dropped, max 3 of up to 80 chars each). No-op if unchanged. */
export function setTeacherNoteItems(id: string, items: string[]): void {
  const current = getDoc().teacherNotes.items.find((n) => n.id === id)
  if (!current) return
  const next = normalizeTeacherItems(items)
  const before = current.items ?? []
  if (before.length === next.length && before.every((v, i) => v === next[i])) return
  update('teacherNotes', (s) => ({
    ...s,
    items: s.items.map((n) => (n.id === id ? { ...n, items: next.length > 0 ? next : undefined } : n)),
  }))
}

export function setTeacherNoteCaption(id: string, caption: string): void {
  const current = getDoc().teacherNotes.items.find((n) => n.id === id)
  if (!current || (current.caption ?? '') === caption.trim()) return
  update('teacherNotes', (s) => ({ ...s, items: s.items.map((n) => (n.id === id ? { ...n, caption: caption.trim() } : n)) }))
}

export function setTeacherNoteDay(id: string, day: string): void {
  const current = getDoc().teacherNotes.items.find((n) => n.id === id)
  if (!current || current.day === day) return
  update('teacherNotes', (s) => ({ ...s, items: s.items.map((n) => (n.id === id ? { ...n, day } : n)) }))
}

export function setTeacherNoteUpload(id: string, upload: Partial<TeacherNote['upload']>): void {
  if (!getDoc().teacherNotes.items.some((n) => n.id === id)) return
  update('teacherNotes', (s) => ({
    ...s,
    items: s.items.map((n) => (n.id === id ? { ...n, upload: { ...n.upload, ...upload, updatedAt: Date.now() } } : n)),
  }))
}

/** Grown-up only (behind the PIN in the UI). The Drive copy is left alone. */
export function deleteTeacherNote(id: string): void {
  if (!getDoc().teacherNotes.items.some((n) => n.id === id)) return
  update('teacherNotes', (s) => ({ ...s, items: s.items.filter((n) => n.id !== id) }))
}

/** Newest first. */
export function useTeacherNotes(): TeacherNote[] {
  return [...useProgress().teacherNotes.items].sort((a, b) => b.takenAt - a.takenAt)
}

/** Notes whose lesson day falls in the 7 days ending on `day` (a weekly note "belongs" to the week that follows it). */
export function teacherNotesForWeek(items: TeacherNote[], day: string): TeacherNote[] {
  const from = dayOffset(day, -6)
  return items.filter((n) => n.day >= from && n.day <= day).sort((a, b) => b.day.localeCompare(a.day))
}

export function pendingTeacherNoteUploads(items: TeacherNote[]): TeacherNote[] {
  return items.filter((n) => n.upload.status === 'pending' || n.upload.status === 'failed')
}

// ---------------------------------------------------------------------------
// Teacher's star (round 12): at the end of the daily ring, remind Nora of the
// teacher's weekly note; a grown-up confirms with the PIN that she worked on
// it. Confirmed days per week reaching the target (Settings) earns one gold
// token plus badges.
// ---------------------------------------------------------------------------

export const TEACHER_STAR_DEFAULT_DAYS = 3
export const TEACHER_NOTE_CURRENT_DAYS = 14

/** Confirmed days per week needed for the Teacher's star, clamped 1..7 (default 3). */
export function teacherStarTarget(settings: Settings): number {
  const raw = settings.teacherStarDays ?? TEACHER_STAR_DEFAULT_DAYS
  return Math.max(1, Math.min(7, Math.round(raw)))
}

/** The newest note (by day, then takenAt) whose lesson day falls within [today-13, today], or undefined. */
export function currentTeacherNote(items: TeacherNote[], today: string): TeacherNote | undefined {
  const from = dayOffset(today, -(TEACHER_NOTE_CURRENT_DAYS - 1))
  const inWindow = items.filter((n) => n.day >= from && n.day <= today)
  if (inWindow.length === 0) return undefined
  return inWindow.slice().sort((a, b) => (a.day === b.day ? b.takenAt - a.takenAt : b.day.localeCompare(a.day)))[0]
}

/** The days `note`'s week covers: `note.day` through min(note.day+6, the day before the next newer note's day). */
export function teacherWeekDays(items: TeacherNote[], note: TeacherNote): string[] {
  const uncapped = dayOffset(note.day, 6)
  const nextNewer = items
    .filter((n) => n.day > note.day)
    .sort((a, b) => a.day.localeCompare(b.day))[0]
  const end = nextNewer ? (dayOffset(nextNewer.day, -1) < uncapped ? dayOffset(nextNewer.day, -1) : uncapped) : uncapped

  const out: string[] = []
  for (let d = note.day; d <= end; d = dayOffset(d, 1)) out.push(d)
  return out
}

/** Days within `note`'s week that were confirmed (PIN) for this note specifically. */
export function confirmedDaysFor(doc: ProgressDoc, note: TeacherNote): string[] {
  return teacherWeekDays(doc.teacherNotes.items, note).filter((d) => doc.piano.days[d]?.teacherConfirmed?.noteId === note.id)
}

/**
 * Whether to show the end-of-ring teacher reminder right now: the ring must
 * be freshly filled (or already done, `ringDone`), this isn't a grown-up's
 * voice note, a current note must exist, today isn't already confirmed, and
 * the 'teacher' nudge hasn't been dismissed today. Pure.
 */
export function shouldRemindTeacher(doc: ProgressDoc, today: string, ringDone: boolean, isNote = false): TeacherNote | undefined {
  if (!ringDone || isNote) return undefined
  const note = currentTeacherNote(doc.teacherNotes.items, today)
  if (!note) return undefined
  const dayState = doc.piano.days[today]
  if (dayState?.teacherConfirmed) return undefined
  if ((dayState?.nudges ?? []).includes('teacher')) return undefined
  return note
}

/**
 * Records the PIN-confirmed "she worked on the teacher's note" for `day`
 * (idempotent per day/note). If confirming this pushes the note's week over
 * its target and the star wasn't already awarded, awards it: one gold token
 * plus any newly-earned badges.
 */
export function confirmTeacherDay(day: string, noteId: string): { confirmedDays: number; target: number; starJustAwarded: boolean } {
  const doc = getDoc()
  const note = doc.teacherNotes.items.find((n) => n.id === noteId)
  const target = teacherStarTarget(doc.settings)
  if (!note) return { confirmedDays: 0, target, starJustAwarded: false }

  const already = doc.piano.days[day]?.teacherConfirmed
  if (!already || already.noteId !== noteId) {
    update('piano', (piano) => ({
      ...piano,
      days: { ...piano.days, [day]: { ...piano.days[day], teacherConfirmed: { noteId, at: Date.now() } } },
    }))
  }

  const confirmedDays = confirmedDaysFor(getDoc(), note).length
  let starJustAwarded = false
  if (confirmedDays >= target && !note.starAwardedAt) {
    const awardedAt = Date.now()
    update('teacherNotes', (s) => ({
      ...s,
      items: s.items.map((n) => (n.id === noteId ? { ...n, starAwardedAt: awardedAt } : n)),
    }))
    grantTokens({ gold: 1, silver: 0, bronze: 0 })
    awardNewBadges()
    starJustAwarded = true
  }

  return { confirmedDays, target, starJustAwarded }
}

/**
 * How many Teacher's stars have been earned. `sinceDay`, if given, filters
 * by the awarded note's own `day` field (not `starAwardedAt`'s day) - simpler,
 * and consistent with how every other date filter in this file reads `day`.
 */
export function teacherStarsCount(items: TeacherNote[], sinceDay?: string): number {
  return items.filter((n) => n.starAwardedAt && (!sinceDay || n.day >= sinceDay)).length
}

/** The Drive file id: `upload.driveFileId`, else parsed from `upload.driveUrl` (`…?id=<id>` or `…/d/<id>/`). */
export function driveFileIdOf(note: TeacherNote): string | undefined {
  if (note.upload.driveFileId) return note.upload.driveFileId
  const url = note.upload.driveUrl
  if (!url) return undefined
  const queryId = url.match(/[?&]id=([^&]+)/)
  if (queryId) return queryId[1]
  const pathId = url.match(/\/d\/([^/]+)/)
  if (pathId) return pathId[1]
  return undefined
}

/** An <img>-embeddable URL for the Drive copy (Drive's thumbnail endpoint, up to `px` wide). */
export function driveImageUrl(note: TeacherNote, px = 1600): string | undefined {
  const id = driveFileIdOf(note)
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${px}` : undefined
}

/** The Drive web page for the file, for an "Open in Drive" link. */
export function driveViewUrl(note: TeacherNote): string | undefined {
  const id = driveFileIdOf(note)
  return id ? `https://drive.google.com/file/d/${id}/view` : undefined
}

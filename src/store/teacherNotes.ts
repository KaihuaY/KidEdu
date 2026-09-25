// Photos of the teacher's weekly note in the kid's notebook. The synced doc
// keeps a small thumbnail per note; the full photo is stored locally
// (recordings IndexedDB, store 'photos') until the Drive upload worker has
// sent it, after which the Drive link is the source for the full size.

import { getDoc, update, useProgress, type TeacherNote } from './progress'
import { dayOffset } from './sessions'

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function addTeacherNote(input: { day: string; thumbDataUrl: string; caption?: string; takenAt?: number }): string {
  const id = uid()
  const note: TeacherNote = {
    id,
    day: input.day,
    takenAt: input.takenAt ?? Date.now(),
    thumbDataUrl: input.thumbDataUrl,
    upload: { status: 'pending', attempts: 0, updatedAt: Date.now() },
  }
  if (input.caption?.trim()) note.caption = input.caption.trim()
  update('teacherNotes', (s) => ({ ...s, items: [...s.items, note] }))
  return id
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

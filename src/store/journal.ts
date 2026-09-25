// The kid's own practice journal (typed, with a mood and optional prompt) and
// the two once-a-day nudges that invite her to write: after her third take of
// the day, and when the ring goal (mark 1) is reached.

import { getDoc, update, useProgress, type JournalEntry, type PianoDay, type PianoTake, type ProgressDoc } from './progress'

export const JOURNAL_MAX_CHARS = 280

export const JOURNAL_PROMPTS = [
  'The tricky part was…',
  'I felt proud when…',
  'Tomorrow I want to…',
  'My favourite song today was…',
] as const

export const MOODS: { value: 1 | 2 | 3 | 4; emoji: string; label: string }[] = [
  { value: 1, emoji: '😫', label: 'Hard day' },
  { value: 2, emoji: '😐', label: 'Okay' },
  { value: 3, emoji: '🙂', label: 'Good' },
  { value: 4, emoji: '🤩', label: 'Amazing' },
]

export type NudgeId = 'third-take' | 'mark-1'

export interface Nudge {
  id: NudgeId
  title: string
  /** Prompt chip to pre-select, if any. */
  prompt?: string
}

/** Takes she made today, notes excluded. */
function takesToday(takes: PianoTake[], day: string): PianoTake[] {
  return takes.filter((t) => t.day === day && !t.isNote)
}

/**
 * Which nudge (if any) to show on the done screen right now. `ringJustReached`
 * = mark 1 was awarded by this very take. Each nudge shows once per day and
 * the ring nudge wins when both apply. Pure.
 */
export function nudgeFor(doc: ProgressDoc, day: string, ringJustReached: boolean, isNote = false): Nudge | null {
  if (isNote) return null
  const shown = doc.piano.days[day]?.nudges ?? []
  if (ringJustReached && !shown.includes('mark-1')) {
    return { id: 'mark-1', title: `${doc.settings.goalMinutes.piano} minutes done! What was the trickiest bit today?`, prompt: JOURNAL_PROMPTS[0] }
  }
  if (takesToday(doc.piano.takes, day).length >= 3 && !shown.includes('third-take')) {
    return { id: 'third-take', title: "You've played 3 songs already! Want to write one line in your journal? ✍️" }
  }
  return null
}

/** Remembers that a nudge was shown today (whether she wrote or tapped "Not now"). */
export function markNudgeShown(day: string, id: NudgeId): void {
  const current = getDoc().piano.days[day]?.nudges ?? []
  if (current.includes(id)) return
  update('piano', (piano) => {
    const d: PianoDay = piano.days[day] ?? {}
    return { ...piano, days: { ...piano.days, [day]: { ...d, nudges: [...(d.nudges ?? []), id] } } }
  })
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Adds an entry; empty text (after trimming) with no mood is ignored. Returns the id or null. */
export function addJournalEntry(input: { day: string; text: string; mood?: 1 | 2 | 3 | 4; prompt?: string; takeIds?: string[] }): string | null {
  const text = input.text.trim().slice(0, JOURNAL_MAX_CHARS)
  if (!text && !input.mood) return null
  const id = uid()
  const entry: JournalEntry = { id, day: input.day, at: Date.now(), text }
  if (input.mood) entry.mood = input.mood
  if (input.prompt) entry.prompt = input.prompt
  if (input.takeIds?.length) entry.takeIds = input.takeIds
  update('piano', (piano) => ({ ...piano, journal: [...(piano.journal ?? []), entry] }))
  return id
}

/** Appends a line to an existing entry (she adds to her day rather than rewriting history). */
export function appendJournalEntry(id: string, more: string): void {
  const line = more.trim()
  if (!line) return
  const existing = getDoc().piano.journal?.find((e) => e.id === id)
  if (!existing) return
  const text = `${existing.text}\n${line}`.slice(0, JOURNAL_MAX_CHARS * 2)
  update('piano', (piano) => ({ ...piano, journal: (piano.journal ?? []).map((e) => (e.id === id ? { ...e, text } : e)) }))
}

/** Grown-up only (behind the PIN in the UI). */
export function deleteJournalEntry(id: string): void {
  if (!getDoc().piano.journal?.some((e) => e.id === id)) return
  update('piano', (piano) => ({ ...piano, journal: (piano.journal ?? []).filter((e) => e.id !== id) }))
}

export function journalForDay(entries: JournalEntry[] | undefined, day: string): JournalEntry[] {
  return (entries ?? []).filter((e) => e.day === day).sort((a, b) => a.at - b.at)
}

export function useJournal(): JournalEntry[] {
  return useProgress().piano.journal ?? []
}
